import { redirect } from "next/navigation";
import { supabaseConfigured, supabaseForRequest } from "./supabase/server";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const devBypass = () => process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "true";

/** Returns the signed-in admin's email, or sends the visitor to the login page. */
export async function requireAdmin(): Promise<string> {
  if (devBypass()) return "dev@localhost";
  if (!supabaseConfigured) redirect("/login?error=setup");
  const supabase = await supabaseForRequest();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) redirect("/login");
  if (!adminEmails().includes(email)) redirect("/login?error=not-admin");
  return email;
}
