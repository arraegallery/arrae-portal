import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { CalEvent, CalShift } from "@/components/ScheduleCalendar";

export type ShiftRow = typeof s.shifts.$inferSelect;

export async function activeAssistants() {
  return db.select().from(s.assistants).where(isNull(s.assistants.removedAt)).orderBy(asc(s.assistants.name));
}

/** Shifts between two dates (inclusive), with who has them and whether a swap is open. */
export async function calendarShifts(from: string, to: string): Promise<CalShift[]> {
  const rows = await db
    .select({ sh: s.shifts, name: s.assistants.name, color: s.assistants.color })
    .from(s.shifts)
    .leftJoin(s.assistants, eq(s.assistants.email, s.shifts.assistantEmail))
    .where(and(gte(s.shifts.date, from), lte(s.shifts.date, to)))
    .orderBy(asc(s.shifts.date), asc(s.shifts.startTime));
  const ids = rows.map((r) => r.sh.id);
  const open = ids.length
    ? new Set(
        (await db.select({ id: s.shiftSwaps.shiftId }).from(s.shiftSwaps).where(and(eq(s.shiftSwaps.status, "open"), inArray(s.shiftSwaps.shiftId, ids)))).map((r) => r.id),
      )
    : new Set<string>();
  return rows.map(({ sh, name, color }) => ({
    id: sh.id,
    date: sh.date,
    startTime: sh.startTime,
    endTime: sh.endTime,
    kind: sh.kind,
    title: sh.title,
    notes: sh.notes,
    assistantEmail: sh.assistantEmail,
    assistantName: name,
    color,
    swapOpen: open.has(sh.id),
  }));
}

/** Gallery calendar events (openings, closures, installs) in the range, as context for staffing. */
export async function calendarEvents(from: string, to: string): Promise<CalEvent[]> {
  const rows = await db
    .select()
    .from(s.galleryEvents)
    .where(lte(s.galleryEvents.startsOn, to))
    .orderBy(asc(s.galleryEvents.startsOn));
  return rows
    .map((e) => ({ id: e.id, title: e.title, start: e.startsOn, end: e.endsOn && e.endsOn > e.startsOn ? e.endsOn : e.startsOn, startTime: e.startTime, endTime: e.endTime }))
    .filter((e) => e.end >= from);
}
