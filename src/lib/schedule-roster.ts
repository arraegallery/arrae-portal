import { and, eq, gte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { COLORS, galleryNow } from "./schedule";

/**
 * The Team page is the one list of people: every active team member is a Gallery
 * Assistant on the schedule. These keep the schedule's roster in step with it.
 */
export async function putOnSchedule(email: string, name: string | null) {
  const used = (await db.select({ c: s.assistants.color }).from(s.assistants)).map((r) => r.c);
  const color = COLORS.find((c) => !used.includes(c)) ?? COLORS[used.length % COLORS.length];
  const display = name?.trim() || email.split("@")[0];
  await db
    .insert(s.assistants)
    .values({ email, name: display, color, calendarToken: crypto.randomUUID().replace(/-/g, "") })
    .onConflictDoUpdate({ target: s.assistants.email, set: { removedAt: null, ...(name?.trim() ? { name: display } : {}) } });
}

/** Off the schedule: past shifts and hours stay for the report; their upcoming shifts become open. */
export async function takeOffSchedule(email: string) {
  await db.update(s.assistants).set({ removedAt: new Date() }).where(eq(s.assistants.email, email));
  await db
    .update(s.shifts)
    .set({ assistantEmail: null })
    .where(and(eq(s.shifts.assistantEmail, email), gte(s.shifts.date, galleryNow().date)));
}
