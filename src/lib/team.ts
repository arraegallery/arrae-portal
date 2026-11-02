import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { adminEmails } from "./auth";
import { supabaseConfigured, supabaseForRequest } from "./supabase/server";

/**
 * Owners are the emails in ADMIN_EMAILS and can do everything. Staff (interns) are
 * added on the Team page and get artists, messages and logistics, but none of the
 * curation, decisions, mass email, Shopify or team settings.
 */
export type TeamRole = "owner" | "staff";

const devBypass = () => process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";

export async function teamRoleFor(email: string | null | undefined): Promise<TeamRole | null> {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  if (adminEmails().includes(e)) return "owner";
  const [m] = await db
    .select({ role: s.teamMembers.role })
    .from(s.teamMembers)
    .where(and(eq(s.teamMembers.email, e), isNull(s.teamMembers.revokedAt)));
  return m ? "staff" : null;
}

/** The signed-in ARRAE team member (owner or staff), or a trip to the login page. */
export async function requireTeam(): Promise<{ email: string; role: TeamRole }> {
  if (devBypass()) return { email: "dev@localhost", role: process.env.DEV_TEAM_ROLE === "staff" ? "staff" : "owner" };
  if (!supabaseConfigured) redirect("/login?error=setup");
  const supabase = await supabaseForRequest();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) redirect("/login");
  const role = await teamRoleFor(email);
  if (!role) redirect("/login?error=not-admin");
  return { email, role };
}

/** For owner-only pages and actions: staff are sent to the inbox. */
export async function requireOwner(): Promise<string> {
  const me = await requireTeam();
  if (me.role !== "owner") redirect("/admin/inbox?error=owner-only");
  return me.email;
}
