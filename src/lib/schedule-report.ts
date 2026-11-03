import { and, asc, gte, lte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { galleryNow, shiftMinutes } from "./schedule";
import { shiftEnds } from "./schedule-kinds";

/** Semester presets for the hours report. */
export function semesters(today: string) {
  const y = Number(today.slice(0, 4));
  return [
    { label: `Fall ${y}`, from: `${y}-08-01`, to: `${y}-12-31` },
    { label: `Spring ${y}`, from: `${y}-01-01`, to: `${y}-05-31` },
    { label: `Summer ${y}`, from: `${y}-06-01`, to: `${y}-07-31` },
    { label: `Spring ${y + 1}`, from: `${y + 1}-01-01`, to: `${y + 1}-05-31` },
  ];
}

export type ReportRow = {
  email: string;
  name: string;
  removed: boolean;
  shifts: number;
  scheduledMinutes: number;
  loggedMinutes: number;
  missing: { id: string; date: string; startTime: string; endTime: string }[];
  logs: { id: string; date: string; startTime: string; endTime: string; minutes: number; note: string | null; shiftId: string | null }[];
};

/** Scheduled vs. logged hours per Gallery Assistant between two dates. */
export async function hoursReport(from: string, to: string): Promise<ReportRow[]> {
  const now = galleryNow();
  const people = await db.select().from(s.assistants).orderBy(asc(s.assistants.name));
  const shifts = await db.select().from(s.shifts).where(and(gte(s.shifts.date, from), lte(s.shifts.date, to)));
  const logs = await db
    .select()
    .from(s.hourLogs)
    .where(and(gte(s.hourLogs.date, from), lte(s.hourLogs.date, to)))
    .orderBy(asc(s.hourLogs.date), asc(s.hourLogs.startTime));
  const loggedShift = new Set(logs.map((l) => l.shiftId).filter(Boolean));
  const rows = people.map((p) => {
    // Only shifts that have already ended count as "scheduled" for the report.
    const done = shifts.filter((sh) => sh.assistantEmail === p.email && shiftEnds(sh) <= now.stamp);
    const mine = logs.filter((l) => l.email === p.email);
    return {
      email: p.email,
      name: p.name,
      removed: !!p.removedAt,
      shifts: done.length,
      scheduledMinutes: done.reduce((n, sh) => n + (sh.timeTbd && sh.maxHours ? sh.maxHours * 60 : shiftMinutes(sh.startTime, sh.endTime)), 0),
      loggedMinutes: mine.reduce((n, l) => n + l.minutes, 0),
      missing: done.filter((sh) => !loggedShift.has(sh.id)).map((sh) => ({ id: sh.id, date: sh.date, startTime: sh.startTime, endTime: sh.endTime })),
      logs: mine.map((l) => ({ id: l.id, date: l.date, startTime: l.startTime, endTime: l.endTime, minutes: l.minutes, note: l.note, shiftId: l.shiftId })),
    };
  });
  return rows.filter((r) => !r.removed || r.shifts || r.logs.length);
}

export const hrs = (m: number) => Math.round((m / 60) * 100) / 100;
