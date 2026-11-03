"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { arraeRecipients } from "@/lib/notify";
import { canStillSwap, galleryInstant, minutesOf, newId, requireAssistant, swapCutoffHours } from "@/lib/schedule";
import { announceSwap, announceSwapTaken } from "@/lib/schedule-mail";

const refresh = () => {
  revalidatePath("/schedule");
  revalidatePath("/admin/schedule");
};

async function me() {
  const r = await requireAssistant();
  if (!r.assistant) throw new Error("Only Gallery Assistants on the schedule can do this");
  return r.assistant;
}

export async function confirmMonth(month: string) {
  const a = await me();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Unknown month");
  await db
    .insert(s.scheduleConfirmations)
    .values({ email: a.email, month, confirmedAt: new Date() })
    .onConflictDoUpdate({ target: [s.scheduleConfirmations.email, s.scheduleConfirmations.month], set: { confirmedAt: new Date() } });
  refresh();
}

export async function requestSwap(shiftId: string, note: string) {
  const a = await me();
  const [sh] = await db.select().from(s.shifts).where(eq(s.shifts.id, shiftId));
  if (!sh || sh.assistantEmail !== a.email) throw new Error("That isn't your shift");
  const cutoff = await swapCutoffHours();
  if (!canStillSwap(sh, cutoff)) throw new Error(`Swaps close ${cutoff} hours before a shift starts. Please message ARRAE directly.`);
  const [open] = await db.select().from(s.shiftSwaps).where(and(eq(s.shiftSwaps.shiftId, shiftId), eq(s.shiftSwaps.status, "open")));
  if (open) throw new Error("You've already asked for a swap on this shift");
  const id = newId("swap");
  await db.insert(s.shiftSwaps).values({ id, shiftId, fromEmail: a.email, note: note.trim().slice(0, 500) || null });
  const emailed = await announceSwap(id);
  refresh();
  return { emailed };
}

export async function cancelSwap(swapId: string) {
  const a = await me();
  await db
    .update(s.shiftSwaps)
    .set({ status: "cancelled", resolvedAt: new Date() })
    .where(and(eq(s.shiftSwaps.id, swapId), eq(s.shiftSwaps.fromEmail, a.email), eq(s.shiftSwaps.status, "open")));
  refresh();
}

export async function acceptSwap(swapId: string) {
  const a = await me();
  const [sw] = await db.select().from(s.shiftSwaps).where(eq(s.shiftSwaps.id, swapId));
  if (!sw || sw.status !== "open") throw new Error("Someone already took this shift, or the swap was cancelled");
  if (sw.fromEmail === a.email) throw new Error("This is your own shift");
  const [sh] = await db.select().from(s.shifts).where(eq(s.shifts.id, sw.shiftId));
  if (!sh || sh.assistantEmail !== sw.fromEmail) throw new Error("This shift has changed since the swap was asked for");
  if (galleryInstant(sh.date, sh.startTime).getTime() < Date.now()) throw new Error("This shift has already started");
  // Only the first acceptance wins: the status check is part of the update.
  const won = await db
    .update(s.shiftSwaps)
    .set({ status: "taken", takenBy: a.email, resolvedAt: new Date() })
    .where(and(eq(s.shiftSwaps.id, swapId), eq(s.shiftSwaps.status, "open")))
    .returning({ id: s.shiftSwaps.id });
  if (!won.length) throw new Error("Someone just took this shift");
  await db.update(s.shifts).set({ assistantEmail: a.email, hoursReminderAt: null }).where(eq(s.shifts.id, sh.id));
  await announceSwapTaken(swapId, arraeRecipients());
  refresh();
}

export type LogInput = { id?: string; shiftId?: string | null; date: string; startTime: string; endTime: string; note: string; email?: string };

/** Saves hours worked. Assistants log their own; owners can log or fix anyone's. */
export async function saveHours(input: LogInput) {
  const r = await requireAssistant();
  const email = r.owner && input.email ? input.email : r.assistant?.email;
  if (!email) throw new Error("Only Gallery Assistants can log hours");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick the date");
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)) throw new Error("Enter when you started and finished");
  const minutes = minutesOf(input.endTime) - minutesOf(input.startTime);
  if (minutes <= 0) throw new Error("The finish time is before the start time");
  if (minutes > 16 * 60) throw new Error("That's more than 16 hours. Check the times");
  if (input.shiftId) {
    const [sh] = await db.select().from(s.shifts).where(eq(s.shifts.id, input.shiftId));
    if (!sh) throw new Error("That shift no longer exists");
    if (!r.owner && sh.assistantEmail !== email) throw new Error("That isn't your shift");
  }
  const row = {
    shiftId: input.shiftId || null,
    email,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    minutes,
    note: input.note.trim().slice(0, 1000) || null,
    loggedBy: r.email,
    updatedAt: new Date(),
  };
  let existing = input.id;
  if (!existing && input.shiftId) {
    const [prev] = await db.select({ id: s.hourLogs.id }).from(s.hourLogs).where(and(eq(s.hourLogs.shiftId, input.shiftId), eq(s.hourLogs.email, email)));
    existing = prev?.id;
  }
  if (existing) {
    const [prev] = await db.select().from(s.hourLogs).where(eq(s.hourLogs.id, existing));
    if (!prev || (!r.owner && prev.email !== email)) throw new Error("That isn't your log");
    await db.update(s.hourLogs).set(row).where(eq(s.hourLogs.id, existing));
  } else await db.insert(s.hourLogs).values({ id: newId("hrs"), ...row });
  refresh();
}

export async function deleteHours(id: string) {
  const r = await requireAssistant();
  const [prev] = await db.select().from(s.hourLogs).where(eq(s.hourLogs.id, id));
  if (!prev) return;
  if (!r.owner && prev.email !== r.assistant?.email) throw new Error("That isn't your log");
  await db.delete(s.hourLogs).where(eq(s.hourLogs.id, id));
  refresh();
}
