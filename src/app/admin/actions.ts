"use server";

import { and, asc, eq, gt, inArray, lt, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { APPLICATION_STATUSES, WORK_STATUSES, type ApplicationStatus, type WorkStatus } from "@/lib/status";

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
  const actor = await requireAdmin();
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
  const actor = await requireAdmin();
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
  const actor = await requireAdmin();
  const text = body.trim();
  if (!text) return;
  await log({ artistId, workId: workId ?? null, showId: showId ?? null, kind: "note", body: text.slice(0, 4000), actor });
  revalidatePath("/admin", "layout");
}

export async function moveOnWaitlist(artistId: string, direction: "up" | "down") {
  await requireAdmin();
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
  const actor = await requireAdmin();
  await db.update(s.waitlist).set(fields).where(eq(s.waitlist.artistId, artistId));
  if (fields.note !== undefined) await log({ artistId, kind: "waitlist", body: `Waitlist note: ${fields.note}`, actor });
  revalidatePath("/admin/waitlist");
}

export async function removeFromWaitlistAction(artistId: string) {
  const actor = await requireAdmin();
  await removeFromWaitlist(artistId);
  await log({ artistId, kind: "waitlist", body: "Removed from waitlist", actor });
  revalidatePath("/admin", "layout");
}

// ---- Sandbox: a private scratch space per show. Nothing here is a decision. ----

export async function addToSandbox(showId: string, workId: string) {
  await requireAdmin();
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
  await requireAdmin();
  await db.delete(s.sandboxItems).where(and(eq(s.sandboxItems.showId, showId), eq(s.sandboxItems.workId, workId)));
  revalidatePath("/admin", "layout");
}

export async function reorderSandbox(showId: string, workIds: string[]) {
  await requireAdmin();
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
  await requireAdmin();
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
  const actor = await requireAdmin();
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
  const actor = await requireAdmin();
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
