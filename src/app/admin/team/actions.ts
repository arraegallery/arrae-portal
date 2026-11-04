"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { adminEmails } from "@/lib/auth";
import { notifyEmail, portalUrl } from "@/lib/notify";
import { putOnSchedule, takeOffSchedule } from "@/lib/schedule-roster";
import { requireOwner } from "@/lib/team";
import { asResult } from "@/lib/action-result";

export async function addTeamMember(input: { email: string; name: string; preferredName?: string; welcome: boolean }) {
  const actor = await requireOwner();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That doesn't look like an email address");
  if (adminEmails().includes(email)) throw new Error("That email is already an owner");
  const name = input.name.trim().slice(0, 120) || null;
  await db
    .insert(s.teamMembers)
    .values({ email, name, role: "staff", addedBy: actor })
    .onConflictDoUpdate({ target: s.teamMembers.email, set: { name, revokedAt: null, addedBy: actor } });
  await putOnSchedule(email, name, input.preferredName);
  const emailed = input.welcome ? await welcomeEmail(email, input.preferredName?.trim() || name?.split(/\s+/)[0]) : false;
  revalidatePath("/admin/team");
  return { emailed };
}

function welcomeEmail(email: string, first: string | null | undefined) {
  return notifyEmail([email], {
    subject: "You've been added to the ARRAE team portal",
    heading: "Welcome to the ARRAE portal",
    body: `Hi ${first || "there"},\n\nYou now have team access to the ARRAE portal, where we keep artist messages, drop-offs and pick-ups, and your gallery shifts in one place. You can see your schedule and the team's, swap shifts, log your hours and add your shifts to your phone's calendar.\n\nSign in with this email address and we'll send you a link.`,
    buttonLabel: "Sign in",
    buttonUrl: portalUrl("/login"),
  });
}

/** Sends (or re-sends) the welcome note with the sign-in button to someone already on the team. */
export async function sendWelcome(email: string) {
  await requireOwner();
  const e = email.trim().toLowerCase();
  const [m] = await db.select().from(s.teamMembers).where(eq(s.teamMembers.email, e));
  if (!m || m.revokedAt) throw new Error("They're not on the team");
  const [a] = await db.select({ preferredName: s.assistants.preferredName }).from(s.assistants).where(eq(s.assistants.email, e));
  return welcomeEmail(e, a?.preferredName?.trim() || m.name?.split(/\s+/)[0]);
}

export async function setTeamAccess(email: string, active: boolean) {
  await requireOwner();
  await db
    .update(s.teamMembers)
    .set({ revokedAt: active ? null : new Date() })
    .where(eq(s.teamMembers.email, email.trim().toLowerCase()));
  const [m] = await db.select().from(s.teamMembers).where(eq(s.teamMembers.email, email.trim().toLowerCase()));
  if (m) await (active ? putOnSchedule(m.email, m.name) : takeOffSchedule(m.email));
  revalidatePath("/admin/team");
  revalidatePath("/admin/schedule");
}

/**
 * Fixes a mistyped email: moves the person (team access, schedule, shifts, swaps, hours,
 * monthly confirmations) to the new address, then optionally emails the invite there.
 */
export async function changeTeamEmail(oldEmail: string, newEmail: string, resend: boolean) {
  return asResult(async () => {
    await requireOwner();
    const from = oldEmail.trim().toLowerCase();
    const to = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("That doesn't look like an email address");
    if (to === from) throw new Error("That's the same email");
    if (adminEmails().includes(to)) throw new Error("That email is already an owner");
    const [m] = await db.select().from(s.teamMembers).where(eq(s.teamMembers.email, from));
    if (!m) throw new Error("They're not on the team");
    const [taken] = await db.select({ e: s.teamMembers.email }).from(s.teamMembers).where(eq(s.teamMembers.email, to));
    const [takenA] = await db.select({ e: s.assistants.email }).from(s.assistants).where(eq(s.assistants.email, to));
    if (taken || takenA) throw new Error(`${to} is already on the team`);

    await db.transaction(async (tx) => {
      await tx.insert(s.teamMembers).values({ ...m, email: to });
      await tx.delete(s.teamMembers).where(eq(s.teamMembers.email, from));
      const [a] = await tx.select().from(s.assistants).where(eq(s.assistants.email, from));
      if (a) {
        // Shifts point at the assistant row, so add the new one before moving them over.
        await tx.insert(s.assistants).values({ ...a, email: to });
        await tx.update(s.shifts).set({ assistantEmail: to }).where(eq(s.shifts.assistantEmail, from));
        await tx.delete(s.assistants).where(eq(s.assistants.email, from));
      }
      await tx.update(s.shiftSwaps).set({ fromEmail: to }).where(eq(s.shiftSwaps.fromEmail, from));
      await tx.update(s.shiftSwaps).set({ takenBy: to }).where(eq(s.shiftSwaps.takenBy, from));
      await tx.update(s.hourLogs).set({ email: to }).where(eq(s.hourLogs.email, from));
      await tx.update(s.scheduleConfirmations).set({ email: to }).where(eq(s.scheduleConfirmations.email, from));
    });

    let emailed = false;
    if (resend && !m.revokedAt) {
      const [a] = await db.select({ preferredName: s.assistants.preferredName }).from(s.assistants).where(eq(s.assistants.email, to));
      emailed = await welcomeEmail(to, a?.preferredName?.trim() || m.name?.split(/\s+/)[0]);
    }
    revalidatePath("/admin/team");
    revalidatePath("/admin/schedule");
    return { emailed };
  });
}
