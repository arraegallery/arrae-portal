"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { ensureApplication, logActivity } from "@/lib/applications";
import { DIRECT_EMAIL_KIND, directEmailBody } from "@/lib/direct-email";
import { personalize, renderEmail, renderText, sendEmails } from "@/lib/email";
import { portalUrl } from "@/lib/notify";
import { requireOwner, requireTeam } from "@/lib/team";
import { after } from "next/server";
import { fillArraeBios } from "@/lib/arrae-bio-auto";

/** The most works an artist can be asked to send in place of ones that fell through. */
const MAX_REPLACEMENTS = 5;

type Result = { ok: true; emailed: boolean } | { ok: false; error: string };

/** Server action errors read as gibberish in production, so hand back the message instead. */
async function asResult(fn: () => Promise<boolean>): Promise<Result> {
  try {
    return { ok: true, emailed: await fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Something went wrong" };
  }
}

function refresh(showId: string, artistId?: string | null) {
  revalidatePath(`/admin/shows/${showId}/works`);
  revalidatePath(`/admin/sandbox/${showId}`);
  revalidatePath("/admin/logistics");
  revalidatePath("/studio");
  if (artistId) revalidatePath(`/admin/artists/${artistId}`);
}

async function addToSandbox(showId: string, workId: string) {
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
}

async function emailOne(artist: { id: string; name: string; email: string }, showId: string, subject: string, message: string, actor: string, button?: { label: string; url: string }) {
  const to = artist.email.trim();
  if (!to.includes("@")) throw new Error(`${artist.name} has no email address on file, so nothing was sent`);
  const content = { subject: personalize(subject, artist.name), body: personalize(message, artist.name), ...(button ? { buttonLabel: button.label, buttonUrl: button.url } : {}) };
  const { sent, failures } = await sendEmails([{ to, subject: content.subject, html: renderEmail(content), text: renderText(content) }]);
  if (!sent) throw new Error(`The email didn't go out: ${failures[0]?.error ?? "unknown error"}`);
  await db.insert(s.activity).values({ artistId: artist.id, showId, kind: DIRECT_EMAIL_KIND, body: directEmailBody(content.subject, content.body, to), actor });
}

/**
 * A work the artist can no longer show. It becomes "Unavailable" (the artist sees "No longer
 * available") and comes out of the sandbox, which stays the single source of truth for the show.
 * With `ask`, the artist may add that many works to their application from their studio (their
 * application stays Selected) and gets the email written on the page.
 */
export async function markUnavailable(showId: string, workId: string, ask: { count: number; subject: string; message: string } | null) {
  return asResult(async () => {
    const actor = await requireOwner();
    const [row] = await db
      .select({ sw: s.showWorks, work: s.works })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
      .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)));
    if (!row) throw new Error("That work isn't part of this show");
    const artistId = row.work.artistId;
    if (ask && !artistId) throw new Error("This work has no artist on file, so there's no one to ask");
    const [artist] = artistId ? await db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email }).from(s.artists).where(eq(s.artists.id, artistId)) : [];
    // Send first: if the email fails, nothing has changed yet and it can simply be tried again.
    if (ask) {
      if (!artist) throw new Error("This work has no artist on file, so there's no one to ask");
      if (!ask.subject.trim() || !ask.message.trim()) throw new Error("Write a subject and a message for the artist, or untick the email");
      await emailOne(artist, showId, ask.subject.trim().slice(0, 200), ask.message.trim().slice(0, 10000), actor, { label: "Open my studio", url: portalUrl("/studio") });
    }
    await db.update(s.showWorks).set({ status: "Unavailable", decidedAt: new Date() }).where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)));
    await db.delete(s.sandboxItems).where(and(eq(s.sandboxItems.showId, showId), eq(s.sandboxItems.workId, workId)));
    await logActivity({ artistId, workId, showId, kind: "status", body: `"${row.work.title}" marked no longer available (taken out of the sandbox)`, actor });
    if (ask && artistId) {
      const count = Math.max(1, Math.min(MAX_REPLACEMENTS, Math.round(ask.count) || 1));
      const appId = await ensureApplication(artistId, showId);
      await db
        .update(s.applications)
        .set({ extraWorksLeft: sql`least(${s.applications.extraWorksLeft} + ${count}, ${MAX_REPLACEMENTS})` })
        .where(eq(s.applications.id, appId));
      await logActivity({ artistId, showId, kind: "status", body: `Asked for ${count === 1 ? "a replacement work" : `${count} replacement works`}: the artist can add ${count === 1 ? "one" : count} from their studio`, actor });
    }
    refresh(showId, artistId);
    return !!ask;
  });
}

/** Undo "no longer available": the work is Selected again and goes back in the sandbox. */
export async function markAvailableAgain(showId: string, workId: string) {
  return asResult(async () => {
    const actor = await requireOwner();
    const [row] = await db
      .update(s.showWorks)
      .set({ status: "Selected", decidedAt: new Date() })
      .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId), eq(s.showWorks.status, "Unavailable")))
      .returning();
    if (!row) throw new Error("That work isn't marked unavailable for this show");
    await addToSandbox(showId, workId);
    const [w] = await db.select({ title: s.works.title, artistId: s.works.artistId }).from(s.works).where(eq(s.works.id, workId));
    await logActivity({ artistId: w?.artistId, workId, showId, kind: "status", body: `"${w?.title}" available again: back in the show and the sandbox`, actor });
    refresh(showId, w?.artistId);
    return false;
  });
}

/**
 * Put a work in the show in place of one that fell through: Selected, into the sandbox, and one
 * less work left on the artist's invitation. With `tell`, the artist gets a short email.
 */
export async function pickReplacement(showId: string, workId: string, tell: { subject: string; message: string } | null) {
  return asResult(async () => {
    const actor = await requireOwner();
    const [row] = await db
      .select({ sw: s.showWorks, work: s.works })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
      .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)));
    if (!row) throw new Error("That work isn't part of this show");
    if (row.sw.status === "Selected") throw new Error("That work is already in the show");
    const artistId = row.work.artistId;
    if (tell) {
      if (!artistId) throw new Error("This work has no artist on file");
      const [artist] = await db.select({ id: s.artists.id, name: s.artists.name, email: s.artists.email }).from(s.artists).where(eq(s.artists.id, artistId));
      if (!artist) throw new Error("This work has no artist on file");
      await emailOne(artist, showId, tell.subject.trim().slice(0, 200), tell.message.trim().slice(0, 10000), actor, { label: "Open my studio", url: portalUrl("/studio") });
    }
    await db.update(s.showWorks).set({ status: "Selected", decidedAt: new Date() }).where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)));
    await addToSandbox(showId, workId);
    if (artistId) {
      await db
        .update(s.applications)
        .set({ extraWorksLeft: sql`greatest(${s.applications.extraWorksLeft} - 1, 0)` })
        .where(and(eq(s.applications.showId, showId), eq(s.applications.artistId, artistId)));
      await db.update(s.applications).set({ status: "Selected" }).where(and(eq(s.applications.showId, showId), eq(s.applications.artistId, artistId), inArray(s.applications.status, ["New", "In review", "Shortlist", "Request other works"])));
      after(() => fillArraeBios([artistId]));
    }
    await logActivity({ artistId, workId, showId, kind: "status", body: `"${row.work.title}" selected as a replacement (added to the sandbox)`, actor });
    refresh(showId, artistId);
    return !!tell;
  });
}

/** A work the artist sent in that won't be used as a replacement. */
export async function passOnWork(showId: string, workId: string) {
  return asResult(async () => {
    const actor = await requireOwner();
    const [row] = await db
      .update(s.showWorks)
      .set({ status: "Not included", decidedAt: new Date() })
      .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId), inArray(s.showWorks.status, ["Submitted", "In review", "Shortlist"])))
      .returning();
    if (!row) throw new Error("That work has already been decided");
    const [w] = await db.select({ title: s.works.title, artistId: s.works.artistId }).from(s.works).where(eq(s.works.id, workId));
    await logActivity({ artistId: w?.artistId, workId, showId, kind: "status", body: `"${w?.title}" not used as a replacement (Not included)`, actor });
    refresh(showId, w?.artistId);
    return false;
  });
}

/** Stop letting the artist add replacement works from their studio. */
export async function stopReplacementInvite(showId: string, artistId: string) {
  return asResult(async () => {
    const actor = await requireOwner();
    await db.update(s.applications).set({ extraWorksLeft: 0 }).where(and(eq(s.applications.showId, showId), eq(s.applications.artistId, artistId)));
    await logActivity({ artistId, showId, kind: "status", body: "Stopped the invitation to add replacement works", actor });
    refresh(showId, artistId);
    return false;
  });
}

/** Note any damage seen on a work at drop-off. An empty note clears it. Anyone on the team can do this. */
export async function saveDamageNote(showId: string, workId: string, note: string) {
  return asResult(async () => {
    const actor = (await requireTeam()).email;
    const text = note.trim().slice(0, 2000);
    const [row] = await db
      .update(s.showWorks)
      .set({ damageNote: text || null, damageNotedAt: text ? new Date() : null, damageNotedBy: text ? actor : null })
      .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.workId, workId)))
      .returning();
    if (!row) throw new Error("That work isn't part of this show");
    const [w] = await db.select({ title: s.works.title, artistId: s.works.artistId }).from(s.works).where(eq(s.works.id, workId));
    await logActivity({ artistId: w?.artistId, workId, showId, kind: "logistics", body: text ? `Damage noted on "${w?.title}": ${text}` : `Damage note cleared on "${w?.title}"`, actor });
    refresh(showId, w?.artistId);
    return false;
  });
}
