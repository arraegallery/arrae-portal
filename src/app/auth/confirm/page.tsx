import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { signedInEmail } from "@/lib/artist-auth";
import { homeFor } from "@/lib/after-sign-in";
import { supabaseForRequest } from "@/lib/supabase/server";

async function confirm(formData: FormData) {
  "use server";
  const token_hash = String(formData.get("token_hash") ?? "");
  const type = (String(formData.get("type") ?? "magiclink") || "magiclink") as EmailOtpType;
  const supabase = await supabaseForRequest();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
  const email = data.user?.email?.toLowerCase();
  if (error || !email) {
    // Opening an old or already-used link while still signed in: just go in.
    const already = await signedInEmail();
    redirect(already ? await homeFor(already) : "/auth/confirm?error=1");
  }
  redirect(await homeFor(email));
}

/**
 * The page a sign-in email links to. It asks for one click instead of signing in on
 * load, because mail scanners open links in emails and would use up the one-time token.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; error?: string }> }) {
  const { token_hash, type, error } = await searchParams;
  const already = error || !token_hash ? await signedInEmail() : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="mx-auto h-12 w-auto" />
      {already ? (
        <>
          <p className="mt-6 text-sm">You&rsquo;re already signed in.</p>
          <a href={await homeFor(already)} className="mt-4 block w-full rounded-md bg-ink px-4 py-2.5 text-white">Continue</a>
        </>
      ) : error || !token_hash ? (
        <>
          <p className="mt-6 text-sm">That link has expired or was already used.</p>
          <p className="mt-2 text-sm text-muted">Each link works once, for an hour. Ask for a new one and use the newest email. The email also has a 6-digit code you can type on the sign-in page.</p>
          <div className="mt-6 flex justify-center gap-3 text-sm">
            <a href="/apply" className="rounded-md bg-ink px-4 py-2 text-white">Apply</a>
            <a href="/login" className="rounded-md bg-white px-4 py-2 ring-1 ring-line">Sign in</a>
          </div>
        </>
      ) : (
        <form action={confirm} className="mt-6">
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type ?? "magiclink"} />
          <p className="text-sm text-muted">You&rsquo;re almost in.</p>
          <button className="mt-4 w-full rounded-md bg-ink px-4 py-2.5 text-white">Continue</button>
        </form>
      )}
    </main>
  );
}
