"use server";

import { and, asc, eq, gt, inArray, isNull, lt, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireOwner, requireTeam } from "@/lib/team";
import { APPLICATION_STATUSES, WORK_STATUSES, type ApplicationStatus, type WorkStatus } from "@/lib/status";
import { ensureApplication } from "@/lib/applications";
import { notifyNewMessage } from "@/lib/notify";
import { ARTIST_ONBOARDING, SHOW_ONBOARDING, readOnboarding } from "@/lib/onboarding";
import { fetchStoreCollections, matchCollections } from "@/lib/shopify-bios";
import { recordWorkChanges, TRACKED_FIELDS } from "@/lib/changes";
import { attachPhotos, createPhotoSlots, listPhotos, makeMainPhoto, removePhoto, worksByIds, type UploadedPhoto } from "@/lib/photos";
import { personalize, renderEmail, renderText, sendEmails, type EmailContent } from "@/lib/email";

async function log(entry: { artistId?: string | null; workId?: string | null; showId?: string | null; kind: string; body: string; actor: string }) {
  await db.insert(s.activity).values(entry);
}

async function addToWaitlist(artistId: string, showId: string | null) {
  const [last] = await db.select({ rank: s.waitlist.rank }).from(s.waitlist).orderBy(desc(s.waitlist.rank)).limit(1);
  await db
    .insert(s.waitlist)
    .values({ artistId, rank: (last?.rank ?? 0) + 1, fromShowId: showId, since: new Date().toISOString().slice(0, 10) })
    .onConflictDoNothing();
}

async function removeFromWaitlist(artistId: string) {
  const [row] = await db.delete(s.waitlist).where(eq(s.waitlist.artistId, artistId)).returning();
  if (row) await db.update(s.waitlist).set({ rank: sql`${s.waitlist.rank} - 1` }).where(gt(s.waitlist.rank, row.rank));
}

export async function setApplicationStatus(applicationId: string, status: ApplicationStatus) {
  const actor = await requireOwner();
  if (!APPLICATION_STATUSES.includes(status)) throw new Error("Unknown status");
  const [before] = await db.select({ status: s.applications.status }).from(s.applications).where(eq(s.applications.id, applicationId));
  if (before?.status === status) return;
  const [app] = await db
    .update(s.applications)
    .set({ status, decidedAt: new Date() })
    .where(eq(s.applications.id, applicationId))
    .returning();
  if (!app) throw new Error("Application not found");
  if (status === "Waitlist") await addToWaitlist(app.artistId, app.showId);
  else if (status === "Selected" || status === "Not selected" || status === "Withdrawn") await removeFromWaitlist(app.artistId);
  await log({ artistId: app.artistId, showId: app.showId, kind: "status", body: `Application set to ${status}`, actor });
  revalidatePath("/admin", "layout");
}

export async function setWorkStatus(showId: string, workId: string, status: WorkStatus) {
  const actor = await requireOwner();
  if (!WORK_STATUSES.includes(status)) throw new Error("Unknown status");
  const [before] = await db
    .select({ status: s.showWorks.status })
    .from(s.showWorks)
    .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)));
  if (before?.status === status) return;
  const [row] = await db
    .update(s.showWorks)
    .set({ status, decidedAt: new Date() })
    .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)))
    .returning();
  if (!row) throw new Error("Work is not part of this show");
  const [work] = await db.select({ artistId: s.works.artistId, title: s.works.title }).from(s.works).where(eq(s.works.id, workId));
  await log({ artistId: work?.artistId, workId, showId, kind: "status", body: `"${work?.title}" set to ${status}`, actor });
  revalidatePath("/admin", "layout");
}

/** A private curator note on an artist, or on one of their works when workId is given. */
export async function addNote(artistId: string, body: string, showId?: string, workId?: string) {
  const actor = (await requireTeam()).email;
  const text = body.trim();
  if (!text) return;
  await log({ artistId, workId: workId ?? null, showId: showId ?? null, kind: "note", body: text.slice(0, 4000), actor });
  revalidatePath("/admin", "layout");
}

export async function moveOnWaitlist(artistId: string, direction: "up" | "down") {
  await requireOwner();
  const [me] = await db.select().from(s.waitlist).where(eq(s.waitlist.artistId, artistId));
  if (!me) return;
  const [other] =
    direction === "up"
      ? await db.select().from(s.waitlist).where(lt(s.waitlist.rank, me.rank)).orderBy(desc(s.waitlist.rank)).limit(1)
      : await db.select().from(s.waitlist).where(gt(s.waitlist.rank, me.rank)).orderBy(asc(s.waitlist.rank)).limit(1);
  if (!other) return;
  await db.transaction(async (tx) => {
    await tx.update(s.waitlist).set({ rank: -1 }).where(eq(s.waitlist.artistId, me.artistId));
    await tx.update(s.waitlist).set({ rank: me.rank }).where(eq(s.waitlist.artistId, other.artistId));
    await tx.update(s.waitlist).set({ rank: other.rank }).where(eq(s.waitlist.artistId, me.artistId));
  });
  revalidatePath("/admin/waitlist");
}

export async function updateWaitlistEntry(artistId: string, fields: { note?: string; carryForward?: boolean }) {
  const actor = await requireOwner();
  await db.update(s.waitlist).set(fields).where(eq(s.waitlist.artistId, artistId));
  if (fields.note !== undefined) await log({ artistId, kind: "waitlist", body: `Waitlist note: ${fields.note}`, actor });
  revalidatePath("/admin/waitlist");
}

export async function removeFromWaitlistAction(artistId: string) {
  const actor = await requireOwner();
  await removeFromWaitlist(artistId);
  await log({ artistId, kind: "waitlist", body: "Removed from waitlist", actor });
  revalidatePath("/admin", "layout");
}

// ---- Sandbox: a private scratch space per show. Nothing here is a decision. ----

export async function addToSandbox(showId: string, workId: string) {
  await requireOwner();
  const [last] = await db
    .select({ position: s.sandboxItems.position })
    .from(s.sandboxItems)
    .where(eq(s.sandboxItems.showId, showId))
    .orderBy(desc(s.sandboxItems.position))
    .limit(1);
  await db
    .insert(s.sandboxItems)
    .values({ showId, workId, position: (last?.position ?? -1) + 1 })
    .onConflictDoNothing();
  revalidatePath("/admin", "layout");
}

export async function removeFromSandbox(showId: string, workId: string) {
  await requireOwner();
  await db.delete(s.sandboxItems).where(and(eq(s.sandboxItems.showId, showId), eq(s.sandboxItems.workId, workId)));
  revalidatePath("/admin", "layout");
}

export async function reorderSandbox(showId: string, workIds: string[]) {
  await requireOwner();
  await db.transaction(async (tx) => {
    for (const [position, workId] of workIds.entries()) {
      await tx
        .update(s.sandboxItems)
        .set({ position })
        .where(and(eq(s.sandboxItems.showId, showId), eq(s.sandboxItems.workId, workId)));
    }
  });
}

export async function setSandboxNote(showId: string, workId: string, note: string) {
  await requireOwner();
  await db
    .update(s.sandboxItems)
    .set({ note: note.trim().slice(0, 2000) || null })
    .where(and(eq(s.sandboxItems.showId, showId), eq(s.sandboxItems.workId, workId)));
}

/**
 * Make sandbox works "possible choices" for the show: they join the show's review board
 * as Shortlist (private; artists see "Under review"). Works already decided keep their decision.
 */
export async function promoteFromSandbox(showId: string, workIds: string[]) {
  const actor = await requireOwner();
  if (!workIds.length) return;
  const existing = await db
    .select({ workId: s.showWorks.workId, status: s.showWorks.status })
    .from(s.showWorks)
    .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.workId, workIds)));
  const has = new Map(existing.map((e) => [e.workId, e.status]));
  const open: WorkStatus[] = ["Submitted", "In review", "Requested"];
  const toInsert = workIds.filter((id) => !has.has(id));
  const toUpdate = workIds.filter((id) => open.includes(has.get(id) as WorkStatus));
  if (toInsert.length)
    await db.insert(s.showWorks).values(toInsert.map((workId) => ({ showId, workId, status: "Shortlist" as const, decidedAt: new Date() })));
  if (toUpdate.length)
    await db
      .update(s.showWorks)
      .set({ status: "Shortlist", decidedAt: new Date() })
      .where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.workId, toUpdate)));
  const works = await db.select({ id: s.works.id, artistId: s.works.artistId, title: s.works.title }).from(s.works).where(inArray(s.works.id, [...toInsert, ...toUpdate].length ? [...toInsert, ...toUpdate] : ["-"]));
  for (const w of works) await log({ artistId: w.artistId, workId: w.id, showId, kind: "status", body: `"${w.title}" made a possible choice from the sandbox`, actor });
  revalidatePath("/admin", "layout");
}

export async function createShow(name: string, type: "Volume" | "Takeover" | "ARRAE Finds") {
  const actor = await requireOwner();
  const clean = name.trim().slice(0, 200);
  if (!clean) throw new Error("Give the show a name");
  if (!["Volume", "Takeover", "ARRAE Finds"].includes(type)) throw new Error("Unknown show type");
  const base = clean.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "show";
  let id = base;
  for (let n = 2; (await db.select({ id: s.shows.id }).from(s.shows).where(eq(s.shows.id, id))).length; n++) id = `${base}-${n}`;
  await db.insert(s.shows).values({ id, name: clean, type });
  await log({ showId: id, kind: "show", body: `Created ${type} "${clean}"`, actor });
  revalidatePath("/admin", "layout");
  return id;
}

// ---- Fixing submissions that landed in the wrong place ----

/** Move works (and optionally the artist's application) from one show to another. Decisions travel with them. */
export async function moveWorksToShow(fromShowId: string, toShowId: string, workIds: string[], applicationId?: string) {
  const actor = await requireOwner();
  if (fromShowId === toShowId || !workIds.length) return;
  const [target] = await db.select({ id: s.shows.id, name: s.shows.name }).from(s.shows).where(eq(s.shows.id, toShowId));
  if (!target) throw new Error("Unknown show");
  await db.transaction(async (tx) => {
    const already = await tx
      .select({ workId: s.showWorks.workId })
      .from(s.showWorks)
      .where(and(eq(s.showWorks.showId, toShowId), inArray(s.showWorks.workId, workIds)));
    const dupes = already.map((r) => r.workId);
    // Already in the target show: just drop the stray copy
    if (dupes.length) await tx.delete(s.showWorks).where(and(eq(s.showWorks.showId, fromShowId), inArray(s.showWorks.workId, dupes)));
    const rest = workIds.filter((id) => !dupes.includes(id));
    if (rest.length) await tx.update(s.showWorks).set({ showId: toShowId }).where(and(eq(s.showWorks.showId, fromShowId), inArray(s.showWorks.workId, rest)));
    if (applicationId) await tx.update(s.applications).set({ showId: toShowId }).where(eq(s.applications.id, applicationId));
  });
  const works = await db.select({ id: s.works.id, artistId: s.works.artistId, title: s.works.title }).from(s.works).where(inArray(s.works.id, workIds));
  for (const w of works) await log({ artistId: w.artistId, workId: w.id, showId: toShowId, kind: "move", body: `"${w.title}" moved to ${target.name}`, actor });
  revalidatePath("/admin", "layout");
}

/** Take works out of a show entirely (the works themselves are kept). */
export async function removeWorksFromShow(showId: string, workIds: string[]) {
  const actor = await requireOwner();
  if (!workIds.length) return;
  const works = await db.select({ id: s.works.id, artistId: s.works.artistId, title: s.works.title }).from(s.works).where(inArray(s.works.id, workIds));
  await db.delete(s.showWorks).where(and(eq(s.showWorks.showId, showId), inArray(s.showWorks.workId, workIds)));
  await db.delete(s.sandboxItems).where(and(eq(s.sandboxItems.showId, showId), inArray(s.sandboxItems.workId, workIds)));
  for (const w of works) await log({ artistId: w.artistId, workId: w.id, showId, kind: "move", body: `"${w.title}" taken out of this show`, actor });
  revalidatePath("/admin", "layout");
}

/**
 * Works that were submitted on someone else's behalf: give them to the right artist,
 * either an existing one or a new artist record. Returns the artist id.
 */
export async function reassignWorks(workIds: string[], to: { artistId: string } | { name: string; email: string }) {
  const actor = await requireOwner();
  if (!workIds.length) throw new Error("Pick at least one work");
  let artistId: string;
  if ("artistId" in to) {
    const [a] = await db.select({ id: s.artists.id }).from(s.artists).where(eq(s.artists.id, to.artistId));
    if (!a) throw new Error("Unknown artist");
    artistId = a.id;
  } else {
    const name = to.name.trim().slice(0, 200);
    const email = to.email.trim().toLowerCase().slice(0, 320);
    if (!name) throw new Error("Give the artist a name");
    const base = `art_${name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "artist"}`;
    artistId = base;
    for (let n = 2; (await db.select({ id: s.artists.id }).from(s.artists).where(eq(s.artists.id, artistId))).length; n++) artistId = `${base}-${n}`;
    await db.insert(s.artists).values({ id: artistId, name, email });
    await log({ artistId, kind: "artist", body: `Artist record created (works submitted on their behalf)`, actor });
  }
  const works = await db.select({ id: s.works.id, artistId: s.works.artistId, title: s.works.title }).from(s.works).where(inArray(s.works.id, workIds));
  await db.update(s.works).set({ artistId }).where(inArray(s.works.id, workIds));
  const [target] = await db.select({ name: s.artists.name }).from(s.artists).where(eq(s.artists.id, artistId));
  for (const w of works) {
    await log({ artistId: w.artistId, workId: w.id, kind: "move", body: `"${w.title}" moved to artist ${target?.name}`, actor });
    await log({ artistId, workId: w.id, kind: "move", body: `"${w.title}" moved here from another artist record`, actor });
  }
  revalidatePath("/admin", "layout");
  return artistId;
}

// ---- Editing artist and work records ----

const clean = (v: unknown, max = 4000) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};

export async function updateArtist(
  artistId: string,
  fields: Partial<Record<"name" | "email" | "phone" | "website" | "social" | "education" | "bio" | "arraeBio" | "internalNotes" | "shopifyCollectionHandle", string>> & {
    onboarding?: Record<string, unknown>;
  },
) {
  const actor = (await requireTeam()).email;
  const set: Partial<typeof s.artists.$inferInsert> = {};
  if (fields.name !== undefined) {
    const n = clean(fields.name, 200);
    if (!n) throw new Error("Name can't be empty");
    set.name = n;
  }
  if (fields.email !== undefined) set.email = (clean(fields.email, 320) ?? "").toLowerCase();
  for (const k of ["phone", "website", "social", "education", "shopifyCollectionHandle"] as const) if (fields[k] !== undefined) set[k] = clean(fields[k], 500);
  for (const k of ["bio", "arraeBio", "internalNotes"] as const) if (fields[k] !== undefined) set[k] = clean(fields[k], 10000);
  if (fields.onboarding) set.onboarding = fields.onboarding;
  if (!Object.keys(set).length) return;
  await db.update(s.artists).set(set).where(eq(s.artists.id, artistId));
  await log({ artistId, kind: "edit", body: `Profile edited: ${Object.keys(set).join(", ")}`, actor });
  revalidatePath("/admin", "layout");
}

/** Tick or untick one onboarding step, for the artist overall (showId null) or for one show. */
export async function setOnboardingStep(artistId: string, key: string, showId: string | null, done: boolean) {
  const actor = (await requireTeam()).email;
  const allowed = showId ? SHOW_ONBOARDING.map(([k]) => k as string) : ARTIST_ONBOARDING.map(([k]) => k as string);
  if (!allowed.includes(key)) throw new Error("Unknown onboarding step");
  const [a] = await db.select({ onboarding: s.artists.onboarding }).from(s.artists).where(eq(s.artists.id, artistId));
  if (!a) throw new Error("Unknown artist");
  const ob = { ...readOnboarding(a.onboarding) };
  if (showId) ob.shows = { ...(ob.shows ?? {}), [showId]: { ...(ob.shows?.[showId] ?? {}), [key]: done } };
  else ob[key] = done;
  await db.update(s.artists).set({ onboarding: ob }).where(eq(s.artists.id, artistId));
  const label = [...ARTIST_ONBOARDING, ...SHOW_ONBOARDING].find(([k]) => k === key)?.[1] ?? key;
  await log({ artistId, showId, kind: "onboarding", body: `${label}: ${done ? "done" : "not done"}`, actor });
  revalidatePath(`/admin/artists/${artistId}`);
  return ob;
}

/** Put existing works (say, shown before and still available) forward for another show. */
export async function addWorksToShow(workIds: string[], showId: string) {
  const actor = await requireOwner();
  if (!workIds.length) return;
  const [show] = await db.select({ id: s.shows.id, name: s.shows.name }).from(s.shows).where(eq(s.shows.id, showId));
  if (!show) throw new Error("Unknown show");
  const works = await db.select({ id: s.works.id, title: s.works.title, artistId: s.works.artistId }).from(s.works).where(inArray(s.works.id, workIds));
  await db.insert(s.showWorks).values(works.map((w) => ({ showId, workId: w.id, status: "Submitted" as const }))).onConflictDoNothing();
  for (const artistId of new Set(works.map((w) => w.artistId).filter((x): x is string => !!x))) await ensureApplication(artistId, showId);
  for (const w of works) await log({ artistId: w.artistId, workId: w.id, showId, kind: "move", body: `"${w.title}" put forward for ${show.name}`, actor });
  revalidatePath("/admin", "layout");
}

export async function updateWork(
  workId: string,
  fields: { title?: string; year?: string; medium?: string; category?: string; description?: string; price?: string; width?: string; height?: string; depth?: string; unit?: string; sold?: string },
) {
  const actor = (await requireTeam()).email;
  const num = (v?: string) => {
    if (v === undefined) return undefined;
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(/[$,]/g, ""));
    if (!Number.isFinite(n) || n < 0) throw new Error(`"${v}" isn't a number`);
    return n;
  };
  const set: Partial<typeof s.works.$inferInsert> = {};
  if (fields.title !== undefined) set.title = clean(fields.title, 300) ?? "Untitled";
  for (const k of ["year", "medium", "category"] as const) if (fields[k] !== undefined) set[k] = clean(fields[k], 300);
  if (fields.description !== undefined) set.description = clean(fields.description, 10000);
  const price = num(fields.price);
  if (price !== undefined) set.priceUsd = price === null ? null : price.toFixed(2);
  for (const k of ["width", "height", "depth"] as const) {
    const v = num(fields[k]);
    if (v !== undefined) set[k] = v;
  }
  if (fields.unit !== undefined) set.unit = fields.unit === "cm" ? "cm" : "in";
  if (set.width !== undefined || set.height !== undefined) set.sizeConfidence = "high";
  const [before] = await db.select().from(s.works).where(eq(s.works.id, workId));
  if (!before) throw new Error("That work no longer exists");
  // "Sold" only changes when it flips, so re-saving keeps the original sold date.
  if (fields.sold !== undefined && !!fields.sold !== !!before.soldAt) set.soldAt = fields.sold ? new Date() : null;
  if (!Object.keys(set).length) return;
  const [w] = await db.update(s.works).set(set).where(eq(s.works.id, workId)).returning({ artistId: s.works.artistId, title: s.works.title });
  const changed = await recordWorkChanges({ workId, artistId: w?.artistId ?? null, before, after: set, actor, role: "arrae" });
  if (changed.length) await log({ artistId: w?.artistId, workId, kind: "edit", body: `"${w?.title}" edited: ${changed.map((f) => TRACKED_FIELDS[f].toLowerCase()).join(", ")}`, actor });
  revalidatePath("/admin", "layout");
}

// ---- Messages to artists ----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanMessage(m: EmailContent): EmailContent {
  const subject = m.subject?.trim().slice(0, 200) ?? "";
  const body = m.body?.trim().slice(0, 20000) ?? "";
  if (!subject) throw new Error("Add a subject");
  if (!body) throw new Error("Write a message");
  return { subject, body, heading: m.heading?.trim().slice(0, 200), buttonLabel: m.buttonLabel?.trim().slice(0, 60), buttonUrl: m.buttonUrl?.trim().slice(0, 1000) };
}

function compose(m: EmailContent, name: string) {
  const p: EmailContent = { ...m, subject: personalize(m.subject, name), heading: m.heading && personalize(m.heading, name), body: personalize(m.body, name) };
  return { subject: p.subject, html: renderEmail(p), text: renderText(p) };
}

/** Send the message to the signed-in admin only, addressed as the first chosen artist. */
export async function sendTestMessage(message: EmailContent, sampleArtistId?: string) {
  const actor = await requireOwner();
  const m = cleanMessage(message);
  const [sample] = sampleArtistId ? await db.select({ name: s.artists.name }).from(s.artists).where(eq(s.artists.id, sampleArtistId)) : [];
  const out = compose(m, sample?.name ?? "Artist");
  const { failures } = await sendEmails([{ to: actor, ...out, subject: `[Test] ${out.subject}` }]);
  if (failures.length) throw new Error(`Test didn't send: ${failures[0].error}`);
  return actor;
}

/** Send one separate email to each chosen artist, so nobody sees anyone else's address. */
export async function sendMessageToArtists(artistIds: string[], message: EmailContent) {
  const actor = await requireOwner();
  const m = cleanMessage(message);
  const ids = [...new Set(artistIds)];
  if (!ids.length) throw new Error("Choose at least one artist");
  if (ids.length > 1000) throw new Error("That's more than 1,000 artists; send in smaller groups");
  const rows = await db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email }).from(s.artists).where(inArray(s.artists.id, ids));
  // One email per address, even if two artist records share it.
  const seen = new Set<string>();
  const recipients = rows.filter((r) => {
    const e = r.email.trim().toLowerCase();
    if (!EMAIL_RE.test(e) || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
  const skipped = rows.filter((r) => !recipients.includes(r)).map((r) => r.name);
  const { sent, failures } = await sendEmails(recipients.map((r) => ({ to: r.email.trim(), ...compose(m, r.name) })));
  const failed = new Set(failures.map((f) => f.to.toLowerCase()));
  const delivered = recipients.filter((r) => !failed.has(r.email.trim().toLowerCase()));
  if (delivered.length) await db.insert(s.activity).values(delivered.map((r) => ({ artistId: r.id, kind: "email", body: `Email sent: "${m.subject}"`, actor })));
  await log({ kind: "email-batch", body: `"${m.subject}" sent to ${sent} artist${sent === 1 ? "" : "s"}${failures.length ? `, ${failures.length} failed` : ""}`, actor });
  revalidatePath("/admin/messages");
  return { sent, failed: failures.length, skipped, firstError: failures[0]?.error ?? null };
}

// ---- ARRAE bios from the Shopify artist collections ----

/** Copies each artist collection's description into ARRAE bios that are still empty. Never overwrites. */
export async function fillBiosFromShopify() {
  const actor = await requireOwner();
  const collections = await fetchStoreCollections();
  const artists = await db.select({ id: s.artists.id, name: s.artists.name, arraeBio: s.artists.arraeBio, handle: s.artists.shopifyCollectionHandle }).from(s.artists);
  const { matches, unmatched } = matchCollections(artists, collections);
  const filled: string[] = [];
  const kept: string[] = [];
  for (const { artist, collection } of matches) {
    const set: Partial<typeof s.artists.$inferInsert> = {};
    if (!artist.arraeBio?.trim()) set.arraeBio = collection.bio;
    if (!artist.handle) set.shopifyCollectionHandle = collection.handle;
    if (!Object.keys(set).length) {
      kept.push(artist.name);
      continue;
    }
    await db.update(s.artists).set(set).where(eq(s.artists.id, artist.id));
    if (set.arraeBio) {
      filled.push(artist.name);
      await log({ artistId: artist.id, kind: "edit", body: `ARRAE bio filled from Shopify collection "${collection.title}"`, actor });
    }
  }
  revalidatePath("/admin/artists", "layout");
  return { filled, kept: kept.length, unmatched: unmatched.map((c) => c.title) };
}

// ---- Conversations with artists ----

export async function sendMessageToArtist(artistId: string, body: string) {
  const actor = (await requireTeam()).email;
  const text = body.trim().slice(0, 5000);
  if (!text) throw new Error("Write a message first");
  const [artist] = await db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email }).from(s.artists).where(eq(s.artists.id, artistId));
  if (!artist) throw new Error("Unknown artist");
  const [row] = await db.insert(s.artistMessages).values({ artistId, sender: "arrae", body: text, actor, readByArraeAt: new Date() }).returning();
  if (artist.email.includes("@")) await notifyNewMessage({ to: artist.email.trim(), artistName: artist.name, preview: text });
  revalidatePath(`/admin/artists/${artistId}`);
  revalidatePath("/admin/inbox");
  return { id: row.id, sender: "arrae" as const, body: row.body, at: row.createdAt.toISOString(), read: true };
}

export async function markArtistMessagesRead(artistId: string) {
  await requireTeam();
  await db
    .update(s.artistMessages)
    .set({ readByArraeAt: new Date() })
    .where(and(eq(s.artistMessages.artistId, artistId), eq(s.artistMessages.sender, "artist"), isNull(s.artistMessages.readByArraeAt)));
}

// ---- Shows ----

type ShowFields = {
  name?: string;
  type?: string;
  opensOn?: string;
  closesOn?: string;
  applicationDeadline?: string;
  decisionsDueOn?: string;
  description?: string;
  openForSubmissions?: boolean;
  decisionsReleased?: boolean;
};

export async function updateShow(showId: string, fields: ShowFields) {
  const actor = await requireOwner();
  const date = (v?: string) => (v === undefined ? undefined : /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
  const set: Partial<typeof s.shows.$inferInsert> = {};
  if (fields.name !== undefined) {
    const n = fields.name.trim().slice(0, 200);
    if (!n) throw new Error("Give the show a name");
    set.name = n;
  }
  if (fields.type !== undefined) {
    if (!["Volume", "Takeover", "ARRAE Finds"].includes(fields.type)) throw new Error("Unknown show type");
    set.type = fields.type as "Volume" | "Takeover" | "ARRAE Finds";
  }
  for (const k of ["opensOn", "closesOn", "applicationDeadline", "decisionsDueOn"] as const) {
    const d = date(fields[k]);
    if (d !== undefined) set[k] = d;
  }
  if (fields.description !== undefined) set.description = fields.description.trim().slice(0, 4000) || null;
  if (fields.openForSubmissions !== undefined) set.openForSubmissions = !!fields.openForSubmissions;
  if (fields.decisionsReleased !== undefined) set.decisionsReleased = !!fields.decisionsReleased;
  if (!Object.keys(set).length) return;
  await db.update(s.shows).set(set).where(eq(s.shows.id, showId));
  const notes = [
    set.openForSubmissions !== undefined ? (set.openForSubmissions ? "opened to artist submissions" : "closed to artist submissions") : "",
    set.decisionsReleased !== undefined ? (set.decisionsReleased ? "decisions released to artists" : "decisions hidden from artists") : "",
  ].filter(Boolean);
  await log({ showId, kind: "show", body: `Show ${notes.length ? notes.join(", ") : `details edited: ${Object.keys(set).join(", ")}`}`, actor });
  revalidatePath("/admin", "layout");
  revalidatePath("/studio", "layout");
}

/* Photos: anyone on the team can fix a work's photos or ask the artist for better ones. */

async function teamWork(workId: string) {
  const actor = (await requireTeam()).email;
  const [work] = await db.select().from(s.works).where(eq(s.works.id, workId));
  if (!work) throw new Error("That work no longer exists");
  return { actor, work };
}

export async function getWorkPhotos(workId: string) {
  await teamWork(workId);
  return listPhotos(workId);
}

export async function prepareWorkPhotoUploads(workId: string, count: number) {
  await teamWork(workId);
  return createPhotoSlots(workId, count);
}

export async function addWorkPhotos(workId: string, images: UploadedPhoto[], asMain: boolean) {
  const { actor, work } = await teamWork(workId);
  await attachPhotos(workId, images, asMain);
  await db.insert(s.activity).values({ artistId: work.artistId, workId, kind: "edit", body: `Added ${images.length} photo${images.length === 1 ? "" : "s"} to "${work.title}"`, actor });
  revalidateWorkPages(work.artistId);
  return listPhotos(workId);
}

export async function makeWorkMainPhoto(workId: string, imageId: string) {
  const { work } = await teamWork(workId);
  await makeMainPhoto(workId, imageId);
  revalidateWorkPages(work.artistId);
  return listPhotos(workId);
}

export async function removeWorkPhoto(workId: string, imageId: string) {
  const { actor, work } = await teamWork(workId);
  await removePhoto(workId, imageId, false);
  await db.insert(s.activity).values({ artistId: work.artistId, workId, kind: "edit", body: `Removed a photo from "${work.title}"`, actor });
  revalidateWorkPages(work.artistId);
  return listPhotos(workId);
}

function revalidateWorkPages(artistId: string | null) {
  if (artistId) revalidatePath(`/admin/artists/${artistId}`);
  revalidatePath("/admin/review/[show]", "page");
  revalidatePath("/admin/sandbox/[show]", "page");
}

/** Asks the artist, in their message thread (and by email), for better photos of these works. */
export async function requestBetterPhotos(workIds: string[], note: string) {
  const actor = (await requireTeam()).email;
  const works = await worksByIds(workIds);
  if (!works.length) throw new Error("Choose at least one work");
  const artistIds = [...new Set(works.map((w) => w.artistId))];
  if (artistIds.length !== 1 || !artistIds[0]) throw new Error("Ask one artist at a time");
  const [artist] = await db.select().from(s.artists).where(eq(s.artists.id, artistIds[0]));
  const text = note.trim().slice(0, 2000);
  await db.update(s.works).set({ photosRequestedAt: new Date(), photosRequestNote: text || null }).where(inArray(s.works.id, works.map((w) => w.id)));
  const list = works.map((w) => `• ${w.title}`).join("\n");
  const body = `${text || "Could you send us better photos of these works?"}\n\n${list}\n\nYou can upload new photos from your studio: open the work and choose "Photos".`;
  const [row] = await db.insert(s.artistMessages).values({ artistId: artist.id, sender: "arrae", body, actor, readByArraeAt: new Date() }).returning();
  for (const w of works) await db.insert(s.activity).values({ artistId: artist.id, workId: w.id, kind: "note", body: `Asked for better photos of "${w.title}"`, actor });
  if (artist.email) await notifyNewMessage({ to: artist.email, artistName: artist.name, preview: body });
  revalidateWorkPages(artist.id);
  revalidatePath("/studio");
  return { id: row.id, sender: "arrae" as const, body: row.body, at: row.createdAt.toISOString(), read: true };
}

export async function clearPhotoRequest(workId: string) {
  const { work } = await teamWork(workId);
  await db.update(s.works).set({ photosRequestedAt: null, photosRequestNote: null }).where(eq(s.works.id, workId));
  revalidateWorkPages(work.artistId);
}

/** The partnership terms applicants must agree to. Saving new wording asks new applicants to agree to it. */
export async function saveApplicationTerms(text: string | null) {
  await requireOwner();
  const t = text?.trim() ?? "";
  if (!t) await db.delete(s.appSettings).where(eq(s.appSettings.key, "application_terms"));
  else await db.insert(s.appSettings).values({ key: "application_terms", value: t.slice(0, 30000) }).onConflictDoUpdate({ target: s.appSettings.key, set: { value: t.slice(0, 30000) } });
  revalidatePath("/admin/shows");
  revalidatePath("/apply/start");
}
