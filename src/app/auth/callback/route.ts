import { NextResponse, type NextRequest } from "next/server";
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
  const home = email && !(await teamRoleFor(email)) ? "/studio" : "/admin";
  return NextResponse.redirect(new URL(home, url.origin));
}
