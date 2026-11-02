import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { teamRoleFor } from "@/lib/team";
import { artistsForEmail } from "@/lib/artist-auth";
import { supabaseConfigured, supabaseForRequest } from "@/lib/supabase/server";

const MESSAGES: Record<string, string> = {
  sent: "If that email is on file with ARRAE, a sign-in link is on its way. Check your inbox.",
  "not-admin": "That email doesn't have access to the admin workspace.",
  "no-artist": "We couldn't find an artist profile for that email. Write to hello@arraegallery.com and we'll sort it out.",
  setup: "Sign-in isn't set up yet. Add the Supabase keys to the environment.",
};

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Only admins and artists on file get a link. Everyone sees the same message, so the
  // form never reveals whose email is on file.
  const known = email.includes("@") && (!!(await teamRoleFor(email)) || (await artistsForEmail(email)).length > 0);
  if (!known) redirect("/login?error=sent");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await supabaseForRequest();
  await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  redirect("/login?error=sent");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="h-12 w-auto" />
      </h1>
      <p className="mt-1 text-sm text-muted">Artists and ARRAE team: sign in with your email. We'll send you a link.</p>
      {error && MESSAGES[error] && <p className="mt-4 rounded-md bg-white p-3 text-sm ring-1 ring-line">{MESSAGES[error]}</p>}
      <form action={sendLink} className="mt-6 flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          disabled={!supabaseConfigured}
          placeholder="you@example.com"
          className="rounded-md border border-line bg-white px-3 py-2"
        />
        <button disabled={!supabaseConfigured} className="rounded-md bg-ink px-3 py-2 text-white disabled:opacity-40">
          Email me a link
        </button>
      </form>
    </main>
  );
}
