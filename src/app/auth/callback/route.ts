import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { teamRoleFor } from "@/lib/team";
import { supabaseForRequest } from "@/lib/supabase/server";

// Finishes the email-link sign-in: the ARRAE team goes to the admin, artists to their studio.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  let email: string | undefined;
  if (code) {
    const supabase = await supabaseForRequest();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    email = data.user?.email?.toLowerCase();
  }
  let home = "/admin";
  if (email && !(await teamRoleFor(email))) {
    // Someone who asked for a link from the application page goes back to their application.
    const [signup] = await db.select().from(s.applicantSignups).where(eq(s.applicantSignups.email, email));
    const applying = signup && !signup.submittedAt && signup.lastLinkAt && Date.now() - signup.lastLinkAt.getTime() < 24 * 3600 * 1000;
    home = applying ? "/apply/start" : "/studio";
  }
  return NextResponse.redirect(new URL(home, url.origin));
}
