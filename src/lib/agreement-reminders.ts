import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { notifyEmail, portalUrl } from "./notify";
import { reminderDue } from "./agreement";

/** Emails one artist a reminder to sign. Returns false when there was no email to send to or it didn't go. */
export async function remindToSign(agreementId: string, actor: string) {
  const [row] = await db
    .select({ a: s.agreements, name: s.artists.name, email: s.artists.email })
    .from(s.agreements)
    .innerJoin(s.artists, eq(s.artists.id, s.agreements.artistId))
    .where(and(eq(s.agreements.id, agreementId), isNull(s.agreements.signedAt), isNull(s.agreements.voidedAt)));
  if (!row?.email) return false;
  const sent = await notifyEmail([row.email], {
    subject: "A reminder: your ARRAE Partnership Agreement is waiting",
    heading: "Your agreement is waiting",
    body: `Hi ${row.name.split(/\s+/)[0]},\n\nA friendly reminder that your ARRAE Artist Partnership Agreement is ready to sign in your studio. It only takes a couple of minutes. Write to hello@arraegallery.com if you have any questions.`,
    buttonLabel: "Read and sign",
    buttonUrl: portalUrl("/studio/agreement"),
  });
  if (!sent) return false;
  await db
    .update(s.agreements)
    .set({ remindersSent: sql`${s.agreements.remindersSent} + 1`, lastRemindedAt: new Date() })
    .where(eq(s.agreements.id, agreementId));
  await db.insert(s.activity).values({ artistId: row.a.artistId, kind: "note", body: "Reminded to sign the Partnership Agreement", actor });
  return true;
}

/** Sends every reminder that's due on the schedule. Used by the daily job. */
export async function sendDueReminders() {
  const open = await db.select().from(s.agreements).where(and(isNull(s.agreements.signedAt), isNull(s.agreements.voidedAt)));
  let sent = 0;
  for (const a of open.filter((x) => reminderDue(x))) if (await remindToSign(a.id, "automatic reminder")) sent++;
  return { checked: open.length, sent };
}
