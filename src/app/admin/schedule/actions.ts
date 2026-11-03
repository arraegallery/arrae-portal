"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { COLORS, STANDARD_HOURS, addDays, newId, weekday } from "@/lib/schedule";
import { EVENT_KIND_FOR_SHIFT, SHIFT_KINDS } from "@/lib/schedule-kinds";
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
  /** Hours not set yet: the assistant works them out with `coordinateWith`, up to `maxHours`. */
  timeTbd?: boolean;
  maxHours?: number | null;
  coordinateWith?: string;
  /** Set up, break down, openings and events also go on the gallery calendar. */
  onCalendar?: boolean;
  /** New shifts only: also add the same shift on this many following weeks. */
  repeatWeeks?: number;
};

export async function saveShift(input: ShiftInput) {
  const actor = await requireOwner();
  if (!isDate(input.date)) throw new Error("Pick a date");
  const tbd = !!input.timeTbd;
  const maxHours = input.maxHours && Number(input.maxHours) > 0 ? Math.min(Number(input.maxHours), 16) : null;
  let { startTime, endTime } = input;
  if (tbd) {
    // A placeholder so the shift has a place on the week view; the real hours get worked out.
    startTime = "10:00";
    const end = Math.min(10 * 60 + Math.round((maxHours ?? 6) * 60), 23 * 60 + 59);
    endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  } else {
    if (!isTime(startTime) || !isTime(endTime)) throw new Error("Set the start and end times, or tick Hours TBD");
    if (endTime <= startTime) throw new Error("The shift ends before it starts");
  }
  const kind = SHIFT_KINDS.some((k) => k.id === input.kind) ? input.kind : "standard";
  const row = {
    date: input.date,
    startTime,
    endTime,
    kind,
    title: input.title.trim().slice(0, 200) || null,
    notes: input.notes.trim().slice(0, 2000) || null,
    assistantEmail: input.assistantEmail || null,
    timeTbd: tbd,
    maxHours: tbd ? maxHours : null,
    coordinateWith: input.coordinateWith?.trim().slice(0, 200) || null,
  };
  const weeks = input.id ? 0 : Math.min(Math.max(Math.floor(input.repeatWeeks ?? 0), 0), 52);
  const dates = Array.from({ length: weeks + 1 }, (_, w) => addDays(input.date, w * 7));
  if (input.id) {
    const [prev] = await db.select().from(s.shifts).where(eq(s.shifts.id, input.id));
    if (!prev) throw new Error("That shift was deleted");
    const changed = prev.assistantEmail !== row.assistantEmail || prev.date !== row.date || prev.startTime !== row.startTime || prev.endTime !== row.endTime;
    const eventId = input.onCalendar && EVENT_KIND_FOR_SHIFT[kind] ? await calendarEventFor(row, prev.eventId, actor) : null;
    await db
      .update(s.shifts)
      .set({ ...row, eventId, ...(changed ? { hoursReminderAt: null } : {}) })
      .where(eq(s.shifts.id, input.id));
    // A new person makes an open swap request moot.
    if (prev.assistantEmail !== row.assistantEmail)
      await db
        .update(s.shiftSwaps)
        .set({ status: "cancelled", resolvedAt: new Date() })
        .where(and(eq(s.shiftSwaps.shiftId, input.id), eq(s.shiftSwaps.status, "open")));
  } else {
    for (const date of dates) {
      const r = { ...row, date };
      const eventId = input.onCalendar && EVENT_KIND_FOR_SHIFT[kind] ? await calendarEventFor(r, null, actor) : null;
      await db.insert(s.shifts).values({ id: newId("sh"), createdBy: actor, ...r, eventId });
    }
  }
  revalidatePath("/admin/calendar");
  refresh();
}

/**
 * The gallery calendar event a set up, break down, opening or event shift belongs to.
 * Reuses the linked event or one with the same name on that day (several people often
 * work one event), and creates it otherwise.
 */
async function calendarEventFor(
  sh: { date: string; kind: string; title: string | null; timeTbd: boolean; startTime: string; endTime: string },
  linked: string | null,
  actor: string,
) {
  const title = sh.title || SHIFT_KINDS.find((k) => k.id === sh.kind)?.label || "Event";
  const covers = (e: typeof s.galleryEvents.$inferSelect) => e.startsOn <= sh.date && (e.endsOn ?? e.startsOn) >= sh.date;
  if (linked) {
    const [e] = await db.select().from(s.galleryEvents).where(eq(s.galleryEvents.id, linked));
    if (e && covers(e)) return e.id;
  }
  const sameDay = await db.select().from(s.galleryEvents).where(lte(s.galleryEvents.startsOn, sh.date));
  const match = sameDay.find((e) => covers(e) && e.title.trim().toLowerCase() === title.trim().toLowerCase());
  if (match) return match.id;
  const id = newId("evt");
  await db.insert(s.galleryEvents).values({
    id,
    title,
    kind: EVENT_KIND_FOR_SHIFT[sh.kind] ?? "event",
    startsOn: sh.date,
    startTime: sh.timeTbd ? null : sh.startTime,
    endTime: sh.timeTbd ? null : sh.endTime,
    createdBy: actor,
  });
  return id;
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

export async function updateAssistant(email: string, input: { name: string; preferredName: string; phone: string; color: string }) {
  await requireOwner();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Add their name");
  await db
    .update(s.assistants)
    .set({ name, preferredName: input.preferredName.trim().slice(0, 60) || null, phone: input.phone.trim() || null, color: (COLORS as readonly string[]).includes(input.color) ? input.color : "violet" })
    .where(eq(s.assistants.email, email));
  await db.update(s.teamMembers).set({ name }).where(eq(s.teamMembers.email, email));
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
