import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { emailConfigured } from "@/lib/email";
import { portalUrl } from "@/lib/notify";
import { addDays, galleryNow, nextMonth, swapCutoffHours } from "@/lib/schedule";
import { activeAssistants, calendarEvents, calendarShifts } from "@/lib/schedule-data";
import { requireOwner } from "@/lib/team";
import { ScheduleAdmin } from "./ScheduleAdmin";

export const metadata = { title: "Team schedule · ARRAE" };

export default async function SchedulePage() {
  await requireOwner();
  const today = galleryNow().date;
  const from = addDays(today, -180);
  const to = addDays(today, 365);
  const people = await activeAssistants();
  const shifts = await calendarShifts(from, to);
  const events = await calendarEvents(from, to);
  const thisMonth = today.slice(0, 7);
  const months = [thisMonth, nextMonth(thisMonth)];
  const confirmations = await db.select().from(s.scheduleConfirmations).where(inArray(s.scheduleConfirmations.month, months));
  const swaps = await db
    .select({ sw: s.shiftSwaps, date: s.shifts.date, startTime: s.shifts.startTime, endTime: s.shifts.endTime })
    .from(s.shiftSwaps)
    .innerJoin(s.shifts, eq(s.shifts.id, s.shiftSwaps.shiftId))
    .where(and(gte(s.shifts.date, addDays(today, -14))));
  return (
    <ScheduleAdmin
      today={today}
      months={months}
      emailOn={emailConfigured()}
      cutoff={await swapCutoffHours()}
      people={people.map((p) => ({ email: p.email, name: p.name, preferredName: p.preferredName, phone: p.phone, color: p.color, feed: portalUrl(`/api/schedule/${p.calendarToken}.ics`) }))}
      shifts={shifts}
      events={events}
      confirmations={confirmations.map((c) => ({ email: c.email, month: c.month, sent: !!c.sentAt, confirmed: !!c.confirmedAt }))}
      swaps={swaps
        .sort((a, b) => b.sw.createdAt.getTime() - a.sw.createdAt.getTime())
        .slice(0, 20)
        .map((r) => ({ id: r.sw.id, status: r.sw.status, from: r.sw.fromEmail, takenBy: r.sw.takenBy, note: r.sw.note, date: r.date, startTime: r.startTime, endTime: r.endTime }))}
    />
  );
}
