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

/**
 * Releases the show's decisions (if they aren't already) and sends each chosen artist their own
 * welcome email. Everything is worked out again on the server, so only artists with selected works
 * in this show can be emailed, each with the email for their group.
 */
export async function sendWelcome(showId: string, group: WelcomeGroup, artistIds: string[], templates: WelcomeTemplates) {
  const actor = await requireOwner();
  await saveWelcomeTemplates(showId, templates);
  const data = await getWelcomeData(showId);
  if (!data) throw new Error("Unknown show");
  const t = clean(templates);
  const chosen = new Set(artistIds);
  const targets = data.artists.filter((a) => chosen.has(a.id) && a.group === group);
  if (!targets.length) throw new Error("Choose at least one artist");
  const skipped = targets.filter((a) => !EMAIL_RE.test(a.email)).map((a) => a.name);
  const sending = targets.filter((a) => EMAIL_RE.test(a.email));

  if (!data.released) {
    await db.update(s.shows).set({ decisionsReleased: true }).where(eq(s.shows.id, showId));
    await db.insert(s.activity).values({ showId, kind: "show", body: `Show decisions released to artists (with the welcome emails)`, actor });
  }

  const out = sending.map((a) => {
    const c = buildWelcome(t[group], t.requirements, data.show, a, data.dropoff, data.studioUrl);
    return { to: a.email, subject: c.subject, html: renderEmail(c), text: renderText(c) };
  });
  const { sent, failures } = await sendEmails(out);
  const failed = new Set(failures.map((f) => f.to.toLowerCase()));
  const delivered = sending.filter((a) => !failed.has(a.email.toLowerCase()));
  const now = new Date();
  if (delivered.length) {
    await db.insert(s.activity).values(
      delivered.map((a) => ({ artistId: a.id, showId, kind: WELCOME_KIND, body: `${group === "new" ? "Welcome" : "Welcome back"} email sent for ${data.show.name}`, actor })),
    );
    await db
      .update(s.applications)
      .set({ artistNotifiedAt: now })
      .where(and(eq(s.applications.showId, showId), inArray(s.applications.artistId, delivered.map((a) => a.id))));
  }
  await db.insert(s.activity).values({
    showId,
    kind: "email-batch",
    body: `${group === "new" ? "Welcome" : "Welcome back"} emails for ${data.show.name} sent to ${sent} artist${sent === 1 ? "" : "s"}${failures.length ? `, ${failures.length} failed` : ""}`,
    actor,
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/studio", "layout");
  return { sent, failed: failures.length, firstError: failures[0]?.error ?? null, skipped };
}
