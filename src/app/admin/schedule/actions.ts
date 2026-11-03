"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { notifyEmail, portalUrl } from "@/lib/notify";
import { COLORS, STANDARD_HOURS, addDays, newId, weekday } from "@/lib/schedule";
import { SHIFT_KINDS } from "@/lib/schedule-kinds";
import { sendMonthlySchedules } from "@/lib/schedule-mail";
import { requireOwner } from "@/lib/team";

const refresh = () => {
  revalidatePath("/admin/schedule");
  revalidatePath("/schedule");
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: string) => /^\d{2}:\d{2}$/.test(v);

export type ShiftInput = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: string;
  title: string;
  notes: string;
  assistantEmail: string;
  /** New shifts only: also add the same shift on this many following weeks. */
  repeatWeeks?: number;
};

export async function saveShift(input: ShiftInput) {
  const actor = await requireOwner();
  if (!isDate(input.date)) throw new Error("Pick a date");
  if (!isTime(input.startTime) || !isTime(input.endTime)) throw new Error("Set the start and end times");
  if (input.endTime <= input.startTime) throw new Error("The shift ends before it starts");
  const row = {
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    kind: SHIFT_KINDS.some((k) => k.id === input.kind) ? input.kind : "standard",
    title: input.title.trim().slice(0, 200) || null,
    notes: input.notes.trim().slice(0, 2000) || null,
    assistantEmail: input.assistantEmail || null,
  };
  if (input.id) {
    const [prev] = await db.select().from(s.shifts).where(eq(s.shifts.id, input.id));
    if (!prev) throw new Error("That shift was deleted");
    const changed = prev.assistantEmail !== row.assistantEmail || prev.date !== row.date || prev.startTime !== row.startTime || prev.endTime !== row.endTime;
    await db
      .update(s.shifts)
      .set({ ...row, ...(changed ? { hoursReminderAt: null } : {}) })
      .where(eq(s.shifts.id, input.id));
    // A new person or time makes an open swap request moot.
    if (prev.assistantEmail !== row.assistantEmail)
      await db
        .update(s.shiftSwaps)
        .set({ status: "cancelled", resolvedAt: new Date() })
        .where(and(eq(s.shiftSwaps.shiftId, input.id), eq(s.shiftSwaps.status, "open")));
  } else {
    const weeks = Math.min(Math.max(Math.floor(input.repeatWeeks ?? 0), 0), 52);
    for (let w = 0; w <= weeks; w++) await db.insert(s.shifts).values({ id: newId("sh"), createdBy: actor, ...row, date: addDays(input.date, w * 7) });
  }
  refresh();
}

export async function deleteShift(id: string) {
  await requireOwner();
  await db.delete(s.shifts).where(eq(s.shifts.id, id));
  refresh();
}

/**
 * Adds the standard gallery-hours shifts (Wed–Fri 12:30–6, Sat 10:30–6) for every day in
 * the range that doesn't have one yet. Days marked "Gallery closed" on the calendar are skipped.
 */
export async function fillStandardHours(from: string, to: string, assistantEmail: string) {
  const actor = await requireOwner();
  if (!isDate(from) || !isDate(to) || to < from) throw new Error("Pick the dates to fill");
  const existing = await db
    .select({ date: s.shifts.date })
    .from(s.shifts)
    .where(and(eq(s.shifts.kind, "standard"), gte(s.shifts.date, from), lte(s.shifts.date, to)));
  const taken = new Set(existing.map((r) => r.date));
  const closed = await db.select().from(s.galleryEvents).where(and(eq(s.galleryEvents.kind, "closed"), lte(s.galleryEvents.startsOn, to)));
  const isClosed = (d: string) => closed.some((e) => e.startsOn <= d && (e.endsOn ?? e.startsOn) >= d);
  let added = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const hours = STANDARD_HOURS[weekday(d)];
    if (!hours || taken.has(d) || isClosed(d)) continue;
    await db.insert(s.shifts).values({ id: newId("sh"), date: d, startTime: hours.start, endTime: hours.end, kind: "standard", assistantEmail: assistantEmail || null, createdBy: actor });
    added++;
  }
  refresh();
  return { added };
}

/** Removes every shift nobody has been assigned to in the range (to undo a fill). */
export async function clearOpenShifts(from: string, to: string) {
  await requireOwner();
  const rows = await db.select().from(s.shifts).where(and(gte(s.shifts.date, from), lte(s.shifts.date, to)));
  const ids = rows.filter((r) => !r.assistantEmail).map((r) => r.id);
  if (ids.length) await db.delete(s.shifts).where(inArray(s.shifts.id, ids));
  refresh();
  return { removed: ids.length };
}

export async function addAssistant(input: { name: string; email: string; phone: string; welcome: boolean }) {
  const actor = await requireOwner();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Add their name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That doesn't look like an email address");
  const used = (await db.select({ c: s.assistants.color }).from(s.assistants)).map((r) => r.c);
  const color = COLORS.find((c) => !used.includes(c)) ?? COLORS[used.length % COLORS.length];
  await db
    .insert(s.assistants)
    .values({ email, name, phone: input.phone.trim() || null, color, calendarToken: crypto.randomUUID().replace(/-/g, ""), addedBy: actor })
    .onConflictDoUpdate({ target: s.assistants.email, set: { name, phone: input.phone.trim() || null, removedAt: null } });
  let emailed = false;
  if (input.welcome)
    emailed = await notifyEmail([email], {
      subject: "Your ARRAE Gallery schedule is online",
      heading: "Welcome to the ARRAE schedule",
      body: `Hi ${name.split(/\s+/)[0]},\n\nYour gallery shifts now live in the ARRAE portal. There you can see your own schedule and the whole team's, ask a teammate to swap a shift, log the hours you worked, and add your shifts to your phone's calendar.\n\nSign in with this email address and we'll send you a link.`,
      buttonLabel: "Open my schedule",
      buttonUrl: portalUrl("/login"),
    });
  refresh();
  return { emailed };
}

export async function updateAssistant(email: string, input: { name: string; phone: string; color: string }) {
  await requireOwner();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Add their name");
  await db
    .update(s.assistants)
    .set({ name, phone: input.phone.trim() || null, color: (COLORS as readonly string[]).includes(input.color) ? input.color : "violet" })
    .where(eq(s.assistants.email, email));
  refresh();
}

/** Takes someone off the schedule. Their past shifts and hours stay for the report; future shifts become open. */
export async function removeAssistant(email: string) {
  await requireOwner();
  await db.update(s.assistants).set({ removedAt: new Date() }).where(eq(s.assistants.email, email));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  await db
    .update(s.shifts)
    .set({ assistantEmail: null })
    .where(and(eq(s.shifts.assistantEmail, email), gte(s.shifts.date, today)));
  refresh();
}

export async function sendMonthNow(month: string, again: boolean) {
  await requireOwner();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Unknown month");
  const r = await sendMonthlySchedules(month, { again });
  refresh();
  return r;
}

export async function setSwapCutoff(hours: number) {
  await requireOwner();
  const n = Math.min(Math.max(Math.round(hours), 0), 24 * 14);
  await db
    .insert(s.appSettings)
    .values({ key: "schedule_swap_cutoff_hours", value: String(n) })
    .onConflictDoUpdate({ target: s.appSettings.key, set: { value: String(n) } });
  refresh();
}
