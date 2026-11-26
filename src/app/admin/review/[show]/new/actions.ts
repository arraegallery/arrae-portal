"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { personalize, renderEmail, renderText, sendEmails } from "@/lib/email";
import { DIRECT_EMAIL_KIND, directEmailBody } from "@/lib/direct-email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DeclineEmail = { subject: string; message: string };
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Errors come back as text: production hides thrown messages, and a vague failure here is risky. */
async function attempt<T>(f: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await f() };
  } catch (e) {
    // Let Next's own redirects (sign-in, owner-only) through.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error("decline applicants:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function cleanEmail(e: DeclineEmail): DeclineEmail {
  const subject = e.subject.trim().slice(0, 200);
  const message = e.message.trim().slice(0, 10000);
  if (!subject) throw new Error("Add a subject");
  if (!message) throw new Error("Write a message first");
  return { subject, message };
}

function build(e: DeclineEmail, name: string) {
  const c = { subject: personalize(e.subject, name), body: personalize(e.message, name) };
  return { subject: c.subject, body: c.body, html: renderEmail(c), text: renderText(c) };
}

/** One copy to the signed-in owner, written as the first ticked artist would get it. */
export async function sendDeclineTest(email: DeclineEmail, sampleArtistId?: string) {
  return attempt(async () => {
    const me = await requireOwner();
    const e = cleanEmail(email);
    const [sample] = sampleArtistId ? await db.select({ name: s.artists.name }).from(s.artists).where(eq(s.artists.id, sampleArtistId)) : [];
    const c = build(e, sample?.name ?? "Artist");
    const { failures } = await sendEmails([{ to: me, subject: `[Test] ${c.subject}`, html: c.html, text: c.text }]);
    if (failures.length) throw new Error(`Test didn't send: ${failures[0].error}`);
    return me;
  });
}

/**
 * One small batch (the page sends a few at a time, so a slow moment can't time out the whole run).
 * For each ticked application in this show: optionally move it to Not selected, and optionally email
 * the artist. An artist who already got an email with this same subject for this show is not emailed
 * twice, so pressing the button again after a hiccup is safe.
 */
export async function declineBatch(showId: string, applicationIds: string[], decline: boolean, email: DeclineEmail | null) {
  return attempt(async () => {
    const actor = await requireOwner();
    if (applicationIds.length > 10) throw new Error("Send at most 10 at a time");
    if (!decline && !email) throw new Error("Choose to decline, email, or both");
    const e = email ? cleanEmail(email) : null;
    const apps = await db
      .select({ id: s.applications.id, artistId: s.applications.artistId, status: s.applications.status, name: s.artists.name, email: s.artists.email })
      .from(s.applications)
      .innerJoin(s.artists, eq(s.artists.id, s.applications.artistId))
      .where(and(eq(s.applications.showId, showId), inArray(s.applications.id, applicationIds.length ? applicationIds : ["-"])));

    const declined: string[] = [];
    if (decline) {
      const moving = apps.filter((a) => a.status !== "Not selected");
      if (moving.length) {
        await db
          .update(s.applications)
          .set({ status: "Not selected", decidedAt: new Date(), extraWorksLeft: 0 })
          .where(inArray(s.applications.id, moving.map((a) => a.id)));
        // Same as declining one by one: they come off the waitlist, and the history says so.
        const artistIds = moving.map((a) => a.artistId);
        const onList = await db.select({ artistId: s.waitlist.artistId }).from(s.waitlist).where(inArray(s.waitlist.artistId, artistIds));
        if (onList.length) {
          await db.delete(s.waitlist).where(inArray(s.waitlist.artistId, onList.map((w) => w.artistId)));
          // Close the gaps in the ranking.
          const rest = await db.select({ artistId: s.waitlist.artistId, rank: s.waitlist.rank }).from(s.waitlist).orderBy(s.waitlist.rank);
          for (const [i, w] of rest.entries())
            if (w.rank !== i + 1) await db.update(s.waitlist).set({ rank: i + 1 }).where(eq(s.waitlist.artistId, w.artistId));
        }
        await db.insert(s.activity).values(moving.map((a) => ({ artistId: a.artistId, showId, kind: "status", body: "Application set to Not selected", actor })));
        declined.push(...moving.map((a) => a.name));
      }
    }

    const sent: string[] = [];
    const already: string[] = [];
    const noEmail: string[] = [];
    const failed: string[] = [];
    let firstError: string | null = null;
    if (e) {
      const before = await db
        .select({ artistId: s.activity.artistId, body: s.activity.body })
        .from(s.activity)
        .where(and(eq(s.activity.showId, showId), eq(s.activity.kind, DIRECT_EMAIL_KIND), inArray(s.activity.artistId, apps.map((a) => a.artistId))));
      const sending: (typeof apps[number] & { c: ReturnType<typeof build>; to: string })[] = [];
      const seen = new Set<string>();
      for (const a of apps) {
        const to = a.email.trim();
        const c = build(e, a.name);
        if (before.some((b) => b.artistId === a.artistId && b.body.startsWith(`Emailed “${c.subject}”`))) already.push(a.name);
        else if (!EMAIL_RE.test(to) || seen.has(to.toLowerCase())) noEmail.push(a.name);
        else {
          seen.add(to.toLowerCase());
          sending.push({ ...a, c, to });
        }
      }
      if (sending.length) {
        const { failures } = await sendEmails(sending.map((a) => ({ to: a.to, subject: a.c.subject, html: a.c.html, text: a.c.text })));
        const failedTo = new Set(failures.map((f) => f.to.toLowerCase()));
        firstError = failures[0]?.error ?? null;
        const delivered = sending.filter((a) => !failedTo.has(a.to.toLowerCase()));
        failed.push(...sending.filter((a) => failedTo.has(a.to.toLowerCase())).map((a) => a.name));
        if (delivered.length)
          await db
            .insert(s.activity)
            .values(delivered.map((a) => ({ artistId: a.artistId, showId, kind: DIRECT_EMAIL_KIND, body: directEmailBody(a.c.subject, a.c.body, a.to), actor })));
        sent.push(...delivered.map((a) => a.name));
      }
    }
    return { declined, sent, already, noEmail, failed, firstError };
  });
}

/** After the last batch: one line in the show history, and fresh pages. */
export async function finishDecline(showId: string, declined: number, emailed: number) {
  const actor = await requireOwner();
  const parts = [declined ? `${declined} first-time applicant${declined === 1 ? "" : "s"} declined` : null, emailed ? `${emailed} emailed` : null].filter(Boolean);
  if (parts.length) await db.insert(s.activity).values({ showId, kind: "show", body: `In bulk: ${parts.join(", ")}`, actor });
  revalidatePath("/admin", "layout");
  revalidatePath("/studio");
}
