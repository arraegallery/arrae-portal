import { and, eq, gte, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { portalUrl } from "@/lib/notify";
import { addDays, canStillSwap, galleryNow, nextMonth, requireAssistant, swapCutoffHours } from "@/lib/schedule";
import { calendarEvents, calendarShifts } from "@/lib/schedule-data";
import { callName, shiftEnds } from "@/lib/schedule-kinds";
import { MySchedule } from "./MySchedule";

export const metadata = { title: "My schedule · ARRAE" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ confirm?: string; swap?: string; log?: string }> }) {
  const { email, assistant } = await requireAssistant();
  const sp = await searchParams;
  const now = galleryNow();
  const today = now.date;
  const shifts = await calendarShifts(addDays(today, -90), addDays(today, 365));
  const events = await calendarEvents(addDays(today, -90), addDays(today, 365));
  const cutoff = await swapCutoffHours();
  const mine = shifts.filter((sh) => sh.assistantEmail === email);

  // Months with shifts that still need a confirm click.
  const thisMonth = today.slice(0, 7);
  const months = [thisMonth, nextMonth(thisMonth)];
  const rows = assistant
    ? await db.select().from(s.scheduleConfirmations).where(and(eq(s.scheduleConfirmations.email, email), inArray(s.scheduleConfirmations.month, months)))
    : [];
  const toConfirm = months
    .filter((m) => !rows.some((c) => c.month === m && c.confirmedAt) && mine.some((sh) => sh.date.startsWith(m)))
    // Next month only once its schedule email has gone out, or if they came from that email.
    .filter((m) => m === thisMonth || sp.confirm === m || rows.some((c) => c.month === m && c.sentAt));

  // Ended shifts without hours, from the last 45 days.
  const recent = mine.filter((sh) => sh.date >= addDays(today, -45) && shiftEnds(sh) <= now.stamp);
  const logged = recent.length
    ? new Set(
        (await db.select({ id: s.hourLogs.shiftId }).from(s.hourLogs).where(and(eq(s.hourLogs.email, email), inArray(s.hourLogs.shiftId, recent.map((r) => r.id))))).map((r) => r.id),
      )
    : new Set<string | null>();
  const needHours = recent.filter((sh) => !logged.has(sh.id));

  const swaps = await db
    .select({ sw: s.shiftSwaps, date: s.shifts.date })
    .from(s.shiftSwaps)
    .innerJoin(s.shifts, eq(s.shifts.id, s.shiftSwaps.shiftId))
    .where(and(eq(s.shiftSwaps.status, "open"), gte(s.shifts.date, today)));
  const swapByShift = new Map(swaps.map((r) => [r.sw.shiftId, { id: r.sw.id, from: r.sw.fromEmail, note: r.sw.note }]));
  const upcoming = mine
    .filter((sh) => shiftEnds(sh) > now.stamp)
    .map((sh) => ({ ...sh, swapId: swapByShift.get(sh.id)?.id ?? null, canSwap: canStillSwap(sh, cutoff) }));
  const offers = shifts
    .filter((sh) => swapByShift.has(sh.id) && sh.assistantEmail !== email && `${sh.date}T${sh.startTime}` > now.stamp)
    .map((sh) => ({ ...sh, swapId: swapByShift.get(sh.id)!.id, swapNote: swapByShift.get(sh.id)!.note }));

  return (
    <MySchedule
      today={today}
      email={email}
      name={assistant ? callName(assistant) : null}
      cutoff={cutoff}
      feed={assistant ? portalUrl(`/api/schedule/${assistant.calendarToken}.ics`) : null}
      shifts={shifts}
      events={events}
      upcoming={upcoming}
      offers={offers}
      needHours={needHours}
      toConfirm={toConfirm}
      focus={{ confirm: sp.confirm ?? null, swap: sp.swap ?? null, log: sp.log ?? null }}
    />
  );
}
