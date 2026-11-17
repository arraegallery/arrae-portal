"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { renderEmail, renderText, sendEmails } from "@/lib/email";
import { requireOwner } from "@/lib/team";
import { buildWelcome, readTemplates, type WelcomeGroup, type WelcomeTemplates } from "@/lib/welcome";
import { getWelcomeData, templateKey, WELCOME_KIND } from "@/lib/welcome-data";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(t: WelcomeTemplates): WelcomeTemplates {
  const r = readTemplates(t);
  const cut = (x: string, n: number) => x.slice(0, n);
  for (const g of ["returning", "new"] as const)
    r[g] = { subject: cut(r[g].subject, 200), heading: cut(r[g].heading, 200), intro: cut(r[g].intro, 6000), closing: cut(r[g].closing, 6000), buttonLabel: cut(r[g].buttonLabel, 60) };
  r.requirements = cut(r.requirements, 3000);
  return r;
}

export async function saveWelcomeTemplates(showId: string, templates: WelcomeTemplates) {
  await requireOwner();
  const value = JSON.stringify(clean(templates));
  await db.insert(s.appSettings).values({ key: templateKey(showId), value }).onConflictDoUpdate({ target: s.appSettings.key, set: { value } });
}

/** One copy to the signed-in owner, written as the chosen artist would get it. */
export async function sendWelcomeTest(showId: string, group: WelcomeGroup, templates: WelcomeTemplates, sampleArtistId?: string) {
  const me = await requireOwner();
  await saveWelcomeTemplates(showId, templates);
  const data = await getWelcomeData(showId);
  if (!data) throw new Error("Unknown show");
  const t = clean(templates);
  const sample = data.artists.find((a) => a.id === sampleArtistId) ?? data.artists.find((a) => a.group === group);
  if (!sample) throw new Error("Nobody in this group yet");
  const c = buildWelcome(t[group], t.requirements, data.show, sample, data.dropoff, data.studioUrl);
  const { failures } = await sendEmails([{ to: me, subject: `[Test] ${c.subject}`, html: renderEmail(c), text: renderText(c) }]);
  if (failures.length) throw new Error(`Test didn't send: ${failures[0].error}`);
  return me;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
/** Errors come back as text: production hides thrown messages, and a vague failure here is risky. */
async function attempt<T>(f: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await f() };
  } catch (e) {
    // Let Next's own redirects (sign-in, owner-only) through.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error("notify artists:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveWelcome(showId: string, templates: WelcomeTemplates) {
  return attempt(async () => {
    await saveWelcomeTemplates(showId, templates);
    return true;
  });
}

export async function testWelcome(showId: string, group: WelcomeGroup, templates: WelcomeTemplates, sampleArtistId?: string) {
  return attempt(() => sendWelcomeTest(showId, group, templates, sampleArtistId));
}

/**
 * Sends one small batch of welcome emails (the page sends a few at a time, so a slow moment can't
 * time out the whole send). The first batch releases the show's decisions if they aren't already.
 * Everything is worked out again on the server, so only artists with selected works in this show can
 * be emailed, each with the email for their group, and anyone already sent is skipped.
 */
export async function sendWelcomeBatch(showId: string, group: WelcomeGroup, artistIds: string[], templates: WelcomeTemplates) {
  return attempt(async () => {
    const actor = await requireOwner();
    if (artistIds.length > 10) throw new Error("Send at most 10 at a time");
    const data = await getWelcomeData(showId);
    if (!data) throw new Error("Unknown show");
    if (!data.dropoff) throw new Error("Set up the drop-off times on Logistics first");
    const t = clean(templates);
    const chosen = new Set(artistIds);
    const targets = data.artists.filter((a) => chosen.has(a.id) && a.group === group);
    const already = targets.filter((a) => a.sentAt).map((a) => a.name);
    const skipped = targets.filter((a) => !a.sentAt && !EMAIL_RE.test(a.email)).map((a) => a.name);
    const sending = targets.filter((a) => !a.sentAt && EMAIL_RE.test(a.email));

    if (!data.released && sending.length) {
      await db.update(s.shows).set({ decisionsReleased: true }).where(eq(s.shows.id, showId));
      await db.insert(s.activity).values({ showId, kind: "show", body: "Show decisions released to artists (with the welcome emails)", actor });
    }
    if (!sending.length) return { sent: [] as string[], failed: [] as string[], skipped, already, firstError: null as string | null };

    const out = sending.map((a) => {
      const c = buildWelcome(t[group], t.requirements, data.show, a, data.dropoff, data.studioUrl);
      return { to: a.email, subject: c.subject, html: renderEmail(c), text: renderText(c) };
    });
    const { failures } = await sendEmails(out);
    const failedTo = new Set(failures.map((f) => f.to.toLowerCase()));
    const delivered = sending.filter((a) => !failedTo.has(a.email.toLowerCase()));
    if (delivered.length) {
      await db.insert(s.activity).values(
        delivered.map((a) => ({ artistId: a.id, showId, kind: WELCOME_KIND, body: `${group === "new" ? "Welcome" : "Welcome back"} email sent for ${data.show.name}`, actor })),
      );
      await db
        .update(s.applications)
        .set({ artistNotifiedAt: new Date() })
        .where(and(eq(s.applications.showId, showId), inArray(s.applications.artistId, delivered.map((a) => a.id))));
    }
    return {
      sent: delivered.map((a) => a.name),
      failed: sending.filter((a) => failedTo.has(a.email.toLowerCase())).map((a) => a.name),
      skipped,
      already,
      firstError: failures[0]?.error ?? null,
    };
  });
}

/** After the last batch: one line in the show history, and fresh pages. */
export async function finishWelcome(showId: string, group: WelcomeGroup, sent: number, failed: number) {
  return attempt(async () => {
    const actor = await requireOwner();
    const [show] = await db.select({ name: s.shows.name }).from(s.shows).where(eq(s.shows.id, showId));
    await db.insert(s.activity).values({
      showId,
      kind: "email-batch",
      body: `${group === "new" ? "Welcome" : "Welcome back"} emails for ${show?.name ?? showId} sent to ${sent} artist${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`,
      actor,
    });
    revalidatePath("/admin", "layout");
    revalidatePath("/studio", "layout");
    return true;
  });
}
