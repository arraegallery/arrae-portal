import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminEmails } from "@/lib/auth";
import { supabaseConfigured, supabaseForRequest } from "@/lib/supabase/server";

const MESSAGES: Record<string, string> = {
  sent: "Check your email for a sign-in link.",
  "not-admin": "That email doesn't have access to the admin workspace.",
  setup: "Sign-in isn't set up yet. Add the Supabase keys to the environment.",
};

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!adminEmails().includes(email)) redirect("/login?error=not-admin");
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
      <h1 className="font-display text-3xl">ARRAE</h1>
      <p className="mt-1 text-sm text-muted">Sign in with your gallery email. We'll send you a link.</p>
      {error && MESSAGES[error] && <p className="mt-4 rounded-md bg-white p-3 text-sm ring-1 ring-line">{MESSAGES[error]}</p>}
      <form action={sendLink} className="mt-6 flex flex-col gap-3">
        <input
          name="email"
          type="email"
          required
          disabled={!supabaseConfigured}
          placeholder="you@arraegallery.com"
          className="rounded-md border border-line bg-white px-3 py-2"
        />
        <button disabled={!supabaseConfigured} className="rounded-md bg-ink px-3 py-2 text-white disabled:opacity-40">
          Email me a link
        </button>
      </form>
    </main>
  );
}
