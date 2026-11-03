import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { EmailOtpType } from "@supabase/supabase-js";
import { db, schema as s } from "@/db";
import { teamRoleFor } from "@/lib/team";
import { artistsForEmail } from "@/lib/artist-auth";
import { supabaseForRequest } from "@/lib/supabase/server";

/** Where a freshly signed-in person goes: the team to the admin, applicants back to their application, artists to their studio. */
async function homeFor(email: string) {
  if (await teamRoleFor(email)) return "/admin";
  const [signup] = await db.select().from(s.applicantSignups).where(eq(s.applicantSignups.email, email));
  if (signup && !signup.submittedAt) {
    const isArtist = (await artistsForEmail(email)).length > 0;
    if (!isArtist || (signup.lastLinkAt && Date.now() - signup.lastLinkAt.getTime() < 24 * 3600 * 1000)) return "/apply/start";
  }
  return "/studio";
}

async function confirm(formData: FormData) {
  "use server";
  const token_hash = String(formData.get("token_hash") ?? "");
  const type = (String(formData.get("type") ?? "magiclink") || "magiclink") as EmailOtpType;
  const supabase = await supabaseForRequest();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
  const email = data.user?.email?.toLowerCase();
  if (error || !email) redirect("/auth/confirm?error=1");
  redirect(await homeFor(email));
}

/**
 * The page a sign-in email links to. It asks for one click instead of signing in on
 * load, because mail scanners open links in emails and would use up the one-time token.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; error?: string }> }) {
  const { token_hash, type, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="mx-auto h-12 w-auto" />
      {error || !token_hash ? (
        <>
          <p className="mt-6 text-sm">That link has expired or was already used.</p>
          <p className="mt-2 text-sm text-muted">Each link works once, for an hour. Ask for a new one and use the newest email.</p>
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
