import { NextResponse, type NextRequest } from "next/server";
import { supabaseForRequest } from "@/lib/supabase/server";

// Finishes the email-link sign-in and sends the user on to the admin.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseForRequest();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/admin", url.origin));
}
