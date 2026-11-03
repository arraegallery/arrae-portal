import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { staffHomeFor } from "@/lib/team";
import { artistsForEmail } from "@/lib/artist-auth";
import { supabaseConfigured, supabaseForRequest } from "@/lib/supabase/server";
import { sendSignInLink } from "@/lib/sign-in-link";

const MESSAGES: Record<string, string> = {
  sent: "If that email is on file with ARRAE, a sign-in link is on its way. Check your inbox.",
  "not-admin": "That email doesn't have access to the admin workspace.",
  "not-assistant": "That email isn't on the Gallery Assistant schedule. Ask ARRAE to add you.",
  "no-artist": "We couldn't find an artist profile for that email. Write to hello@arraegallery.com and we'll sort it out.",
  setup: "Sign-in isn't set up yet. Add the Supabase keys to the environment.",
  password: "That email and password didn't match. Try again, or use the email link and set a new password under My account.",
};

/** Password sign-in, for the ARRAE team only. Artists always use the email link. */
async function signInWithPassword(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const home = email.includes("@") ? await staffHomeFor(email) : null;
  if (!home || !password) redirect("/login?error=password&team=1");
  const supabase = await supabaseForRequest();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/login?error=password&team=1");
  redirect(home);
}

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Only admins and artists on file get a link. Everyone sees the same message, so the
  // form never reveals whose email is on file.
  const known = email.includes("@") && (!!(await staffHomeFor(email)) || (await artistsForEmail(email)).length > 0);
  if (!known) redirect("/login?error=sent");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  try {
    await sendSignInLink(email, origin, { purpose: "signin" });
  } catch (e) {
    console.error("sign-in link failed", e);
  }
  redirect("/login?error=sent");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; team?: string }> }) {
  const { error, team } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 text-center">
      <h1 className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="mx-auto h-12 w-auto" />
      </h1>
      <p className="mt-6 text-sm text-muted">Artists, ARRAE team and Gallery Assistants: sign in with your email. We'll send you a link.</p>
      {error && MESSAGES[error] && <p className="mt-4 rounded-md bg-white p-3 text-sm ring-1 ring-line">{MESSAGES[error]}</p>}
      <form action={sendLink} className="mt-8 flex text-left flex-col gap-3">
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
      <details open={!!team} className="mt-10 text-left text-sm">
        <summary className="cursor-pointer text-center text-muted">ARRAE team and Gallery Assistants: sign in with a password</summary>
        <form action={signInWithPassword} className="mt-4 flex flex-col gap-3">
          <input name="email" type="email" required autoComplete="username" placeholder="hello@arraegallery.com" className="rounded-md border border-line bg-white px-3 py-2" />
          <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className="rounded-md border border-line bg-white px-3 py-2" />
          <button disabled={!supabaseConfigured} className="rounded-md bg-white px-3 py-2 ring-1 ring-line disabled:opacity-40">
            Sign in
          </button>
          <p className="text-xs text-muted">No password yet? Sign in with the email link once, then choose one under My account (Account in the top menu).</p>
        </form>
      </details>
    </main>
  );
}
