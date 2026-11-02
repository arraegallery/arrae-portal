"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { adminEmails } from "@/lib/auth";
import { notifyEmail, portalUrl } from "@/lib/notify";
import { requireOwner } from "@/lib/team";

export async function addTeamMember(input: { email: string; name: string; welcome: boolean }) {
  const actor = await requireOwner();
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That doesn't look like an email address");
  if (adminEmails().includes(email)) throw new Error("That email is already an owner");
  const name = input.name.trim().slice(0, 120) || null;
  await db
    .insert(s.teamMembers)
    .values({ email, name, role: "staff", addedBy: actor })
    .onConflictDoUpdate({ target: s.teamMembers.email, set: { name, revokedAt: null, addedBy: actor } });
  let emailed = false;
  if (input.welcome)
    emailed = await notifyEmail([email], {
      subject: "You've been added to the ARRAE team portal",
      heading: "Welcome to the ARRAE portal",
      body: `Hi ${name?.split(/\s+/)[0] ?? "there"},\n\nYou now have team access to the ARRAE portal, where we keep artist messages, drop-offs and pick-ups in one place.\n\nSign in with this email address and we'll send you a link.`,
      buttonLabel: "Sign in",
      buttonUrl: portalUrl("/login"),
    });
  revalidatePath("/admin/team");
  return { emailed };
}

export async function setTeamAccess(email: string, active: boolean) {
  await requireOwner();
  await db
    .update(s.teamMembers)
    .set({ revokedAt: active ? null : new Date() })
    .where(eq(s.teamMembers.email, email.trim().toLowerCase()));
  revalidatePath("/admin/team");
}
