import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { notifyEmail, portalUrl } from "./notify";
import { addDays, galleryNow, kindLabel, longDate, monthEnd, monthName, shortDate, timeRange, weekday } from "./schedule";
import { activeAssistants } from "./schedule-data";

type Shift = typeof s.shifts.$inferSelect;
type Assistant = typeof s.assistants.$inferSelect;

const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const line = (sh: Shift) => `• ${shortDate(sh.date)} · ${timeRange(sh.startTime, sh.endTime)}${sh.kind !== "standard" ? ` · ${sh.title || kindLabel(sh.kind)}` : ""}`;

async function shiftsFor(email: string, from: string, to: string) {
  return db
    .select()
    .from(s.shifts)
    .where(and(eq(s.shifts.assistantEmail, email), gte(s.shifts.date, from), lte(s.shifts.date, to)))
    .orderBy(asc(s.shifts.date), asc(s.shifts.startTime));
}

/**
 * Emails each assistant their shifts for the month with a Confirm button. With `again`,
 * people who already confirmed are asked again (use it after changing the schedule).
 * Without it, anyone already emailed for that month is skipped.
 */
export async function sendMonthlySchedules(month: string, opts: { again?: boolean; only?: string } = {}) {
  const people = (await activeAssistants()).filter((a) => !opts.only || a.email === opts.only);
  const done = await db.select().from(s.scheduleConfirmations).where(eq(s.scheduleConfirmations.month, month));
  let sent = 0;
  let skipped = 0;
  for (const a of people) {
    const prior = done.find((d) => d.email === a.email);
    if (prior?.sentAt && !opts.again) {
      skipped++;
      continue;
    }
    const list = await shiftsFor(a.email, `${month}-01`, monthEnd(month));
    if (!list.length) {
      skipped++;
      continue;
    }
    const total = list.reduce((n, sh) => n + (Number(sh.endTime.slice(0, 2)) * 60 + Number(sh.endTime.slice(3)) - Number(sh.startTime.slice(0, 2)) * 60 - Number(sh.startTime.slice(3))), 0);
    const ok = await notifyEmail([a.email], {
      subject: `Your ARRAE schedule for ${monthName(month)}: please confirm`,
      heading: `Your ${monthName(month).split(" ")[0]} schedule`,
      body: `Hi ${first(a.name)},\n\nHere are your gallery shifts for ${monthName(month)} (${list.length} ${list.length === 1 ? "shift" : "shifts"}, ${Math.round((total / 60) * 10) / 10} hours):\n\n${list.map(line).join("\n")}\n\nPlease click the button to confirm you can work these. If something doesn't work, you can ask a teammate to swap from your schedule page.`,
      buttonLabel: "Confirm my schedule",
      buttonUrl: portalUrl(`/schedule?confirm=${month}`),
    });
    if (!ok) continue;
    sent++;
    await db
      .insert(s.scheduleConfirmations)
      .values({ email: a.email, month, sentAt: new Date() })
      .onConflictDoUpdate({
        target: [s.scheduleConfirmations.email, s.scheduleConfirmations.month],
        set: opts.again ? { sentAt: new Date(), confirmedAt: null } : { sentAt: new Date() },
      });
  }
  return { sent, skipped };
}

/** Sunday email: the shifts in the week ahead (Monday to Sunday), plus any shifts teammates want to swap. */
export async function sendWeeklyReminders(today: string) {
  const from = addDays(today, 1);
  const to = addDays(today, 7);
  const openSwaps = await openSwapLines();
  let sent = 0;
  for (const a of await activeAssistants()) {
    const list = await shiftsFor(a.email, from, to);
    if (!list.length) continue;
    const others = openSwaps.filter((o) => o.fromEmail !== a.email).map((o) => o.text);
    const ok = await notifyEmail([a.email], {
      subject: `Your ARRAE shifts this week`,
      heading: "Your week at the gallery",
      body: `Hi ${first(a.name)},\n\nHere's your week:\n\n${list.map(line).join("\n")}${others.length ? `\n\nTeammates are looking for someone to take these shifts:\n${others.join("\n")}` : ""}\n\nSee you at the gallery!`,
      buttonLabel: "Open my schedule",
      buttonUrl: portalUrl("/schedule"),
    });
    if (ok) sent++;
  }
  return { sent };
}

async function openSwapLines() {
  const rows = await db
    .select({ sw: s.shiftSwaps, sh: s.shifts, name: s.assistants.name })
    .from(s.shiftSwaps)
    .innerJoin(s.shifts, eq(s.shifts.id, s.shiftSwaps.shiftId))
    .leftJoin(s.assistants, eq(s.assistants.email, s.shiftSwaps.fromEmail))
    .where(and(eq(s.shiftSwaps.status, "open"), gte(s.shifts.date, galleryNow().date)));
  return rows.map((r) => ({ fromEmail: r.sw.fromEmail, text: `${line(r.sh)} (${r.name ? first(r.name) : "a teammate"})` }));
}

/** After a shift ends, ask its assistant to log the hours they actually worked. */
export async function sendHoursReminders(now = galleryNow()) {
  const due = await db
    .select({ sh: s.shifts, a: s.assistants })
    .from(s.shifts)
    .innerJoin(s.assistants, eq(s.assistants.email, s.shifts.assistantEmail))
    .where(and(isNull(s.shifts.hoursReminderAt), isNotNull(s.shifts.assistantEmail), gte(s.shifts.date, addDays(now.date, -2)), lte(s.shifts.date, now.date)));
  const ended = due.filter(({ sh }) => `${sh.date}T${sh.endTime}` <= now.stamp);
  if (!ended.length) return { sent: 0 };
  const logged = new Set(
    (await db.select({ id: s.hourLogs.shiftId }).from(s.hourLogs).where(inArray(s.hourLogs.shiftId, ended.map((e) => e.sh.id)))).map((r) => r.id),
  );
  let sent = 0;
  for (const { sh, a } of ended) {
    if (!logged.has(sh.id)) {
      const ok = await notifyEmail([a.email], {
        subject: `Log your hours for ${shortDate(sh.date)}`,
        heading: "Thanks for today!",
        body: `Hi ${first(a.name)},\n\nYour shift on ${longDate(sh.date)} (${timeRange(sh.startTime, sh.endTime)}) is over. Please log the hours you actually worked. It takes a few seconds, and we use it for your hours report at the end of the semester.`,
        buttonLabel: "Log my hours",
        buttonUrl: portalUrl(`/schedule?log=${sh.id}`),
      });
      if (ok) sent++;
      else continue;
    }
    await db.update(s.shifts).set({ hoursReminderAt: new Date() }).where(eq(s.shifts.id, sh.id));
  }
  return { sent };
}

/** Tells the rest of the team that a shift is up for grabs. */
export async function announceSwap(swapId: string) {
  const [row] = await db
    .select({ sw: s.shiftSwaps, sh: s.shifts, from: s.assistants })
    .from(s.shiftSwaps)
    .innerJoin(s.shifts, eq(s.shifts.id, s.shiftSwaps.shiftId))
    .leftJoin(s.assistants, eq(s.assistants.email, s.shiftSwaps.fromEmail))
    .where(eq(s.shiftSwaps.id, swapId));
  if (!row) return 0;
  const who = row.from?.name ?? row.sw.fromEmail;
  const others = (await activeAssistants()).filter((a: Assistant) => a.email !== row.sw.fromEmail);
  let sent = 0;
  for (const a of others) {
    const ok = await notifyEmail([a.email], {
      subject: `Can you take ${first(who)}'s shift on ${shortDate(row.sh.date)}?`,
      heading: "A shift is up for grabs",
      body: `Hi ${first(a.name)},\n\n${who} is looking for someone to take this shift:\n\n${line(row.sh)}${row.sw.note ? `\n\n"${row.sw.note}"` : ""}\n\nIf you can work it, click the button and accept. The first person to accept gets the shift.`,
      buttonLabel: "See the shift",
      buttonUrl: portalUrl(`/schedule?swap=${swapId}`),
    });
    if (ok) sent++;
  }
  return sent;
}

/** Lets the person who asked, and ARRAE, know the shift has a new owner. */
export async function announceSwapTaken(swapId: string, arrae: string[]) {
  const [row] = await db
    .select({ sw: s.shiftSwaps, sh: s.shifts })
    .from(s.shiftSwaps)
    .innerJoin(s.shifts, eq(s.shifts.id, s.shiftSwaps.shiftId))
    .where(eq(s.shiftSwaps.id, swapId));
  if (!row?.sw.takenBy) return;
  const people = await db.select().from(s.assistants).where(inArray(s.assistants.email, [row.sw.fromEmail, row.sw.takenBy]));
  const from = people.find((p) => p.email === row.sw.fromEmail);
  const taker = people.find((p) => p.email === row.sw.takenBy);
  const takerName = taker?.name ?? row.sw.takenBy;
  await notifyEmail([row.sw.fromEmail], {
    subject: `${first(takerName)} is taking your shift on ${shortDate(row.sh.date)}`,
    heading: "Your swap is done",
    body: `Hi ${from ? first(from.name) : "there"},\n\n${takerName} accepted your shift:\n\n${line(row.sh)}\n\nIt's off your schedule now.`,
    buttonLabel: "Open my schedule",
    buttonUrl: portalUrl("/schedule"),
  });
  await notifyEmail(arrae, {
    subject: `Shift swap: ${first(takerName)} is covering ${shortDate(row.sh.date)}`,
    body: `${takerName} took ${from?.name ?? row.sw.fromEmail}'s shift:\n\n${line(row.sh)}`,
    buttonLabel: "Open the schedule",
    buttonUrl: portalUrl("/admin/schedule"),
  });
}

/**
 * Everything the schedule sends on its own. Safe to run several times a day: each email
 * is recorded so nobody gets the same one twice.
 */
export async function runScheduleJobs() {
  const now = galleryNow();
  const out: Record<string, unknown> = { at: now.stamp };
  if (now.date.endsWith("-01")) out.monthly = await sendMonthlySchedules(now.date.slice(0, 7));
  if (weekday(now.date) === 0) {
    const key = `schedule_weekly_sent:${now.date}`;
    const [done] = await db.select().from(s.appSettings).where(eq(s.appSettings.key, key));
    if (!done) {
      out.weekly = await sendWeeklyReminders(now.date);
      await db.insert(s.appSettings).values({ key, value: new Date().toISOString() }).onConflictDoNothing();
    }
  }
  out.hours = await sendHoursReminders(now);
  // Swaps nobody took before the shift started quietly close.
  const stale = await db
    .select({ id: s.shiftSwaps.id })
    .from(s.shiftSwaps)
    .innerJoin(s.shifts, eq(s.shifts.id, s.shiftSwaps.shiftId))
    .where(and(eq(s.shiftSwaps.status, "open"), lte(s.shifts.date, addDays(now.date, -1))));
  if (stale.length)
    await db
      .update(s.shiftSwaps)
      .set({ status: "expired", resolvedAt: new Date() })
      .where(and(inArray(s.shiftSwaps.id, stale.map((r) => r.id)), ne(s.shiftSwaps.status, "taken")));
  return out;
}
