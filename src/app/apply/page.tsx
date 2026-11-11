import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { signedInEmail } from "@/lib/artist-auth";
import { applyWithCode, startApplication } from "./actions";

const ERRORS: Record<string, string> = {
  email: "That doesn't look like an email address. Please check it and try again.",
  send: "We couldn't send the email just now. Please try again in a minute.",
  code: "That code didn't work. Codes work once, for an hour. Use the code in the newest email, or ask for a new one.",
  setup: "Applications aren't set up yet. Please write to hello@arraegallery.com.",
};

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; email?: string }> }) {
  const { sent, error, email: sentTo } = await searchParams;
  const email = await signedInEmail();
  const open = await db.select({ id: s.shows.id, name: s.shows.name, deadline: s.shows.applicationDeadline }).from(s.shows).where(eq(s.shows.openForSubmissions, true)).orderBy(asc(s.shows.name));
  return (
    <main className="mx-auto max-w-xl px-4 pb-12 pt-20">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">ARRAE Gallery · Coconut Grove</p>
      <h1 className="mt-1 font-display text-4xl">Apply to show with ARRAE</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        We welcome emerging and established artists working in painting, sculpture, ceramics, fiber, print and beyond, with original work priced between $100 and $10,000. You can
        apply with up to 3 works.
      </p>
      <p className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-900 ring-1 ring-emerald-200">There is no application fee. It&rsquo;s free to apply.</p>
      {open.length > 0 ? (
        <p className="mt-3 text-sm">
          Now taking applications for <strong>{open.map((x) => x.name).join(", ")}</strong>.
        </p>
      ) : (
        <p className="mt-3 rounded-md bg-white p-3 text-sm ring-1 ring-line">We aren&rsquo;t taking applications right now. Leave your email and we&rsquo;ll let you know when the next open call starts.</p>
      )}

      <ol className="mt-6 space-y-1 text-sm text-muted">
        <li>
          <span className="font-medium text-ink">1. Your email.</span> We&rsquo;ll send you a link to start.
        </li>
        <li>
          <span className="font-medium text-ink">2. How we work.</span> A quick read on how we work with artists. Nothing to sign yet.
        </li>
        <li>
          <span className="font-medium text-ink">3. Your application.</span> Your details and up to 3 works with photos.
        </li>
      </ol>

      {email && !sent ? (
        <div className="mt-8 rounded-lg bg-white p-4 ring-1 ring-line">
          <p className="text-sm">
            You&rsquo;re signed in as <strong>{email}</strong>.
          </p>
          <Link href="/apply/start" className="mt-3 inline-block rounded-md bg-ink px-4 py-2 text-sm text-white">
            Continue my application →
          </Link>
        </div>
      ) : sent ? (
        <div className="mt-8 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <p className="font-medium">Check your email.</p>
          <p className="mt-1">We sent you a link to continue your application. It can take a minute to arrive; check your spam folder if you don&rsquo;t see it.</p>
          {sentTo?.includes("@") && (
            <form action={applyWithCode} className="mt-4 rounded-md bg-white p-3 text-ink ring-1 ring-emerald-200">
              <label htmlFor="code" className="block text-sm">
                Link not working? Type the 6-digit code from the email.
              </label>
              <input type="hidden" name="email" value={sentTo} />
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={8}
                required
                placeholder="123456"
                className="mt-2 w-full rounded-md bg-white px-3 py-2 text-center text-lg tracking-widest ring-1 ring-line"
              />
              {error === "code" && <p className="mt-2 text-sm text-rose-700">{ERRORS.code}</p>}
              <button className="mt-2 w-full rounded-md bg-ink px-4 py-2 text-sm text-white">Continue with code</button>
            </form>
          )}
          <Link href="/apply" className="mt-2 inline-block underline">
            Use a different email
          </Link>
        </div>
      ) : (
        <form action={startApplication} className="mt-8 rounded-lg bg-white p-4 ring-1 ring-line">
          <label className="block text-sm font-medium">
            Your email
            <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="mt-1 w-full rounded-md bg-white px-3 py-2 text-sm font-normal ring-1 ring-line" />
          </label>
          {error && ERRORS[error] && <p className="mt-2 text-sm text-rose-700">{ERRORS[error]}</p>}
          <button className="mt-3 w-full rounded-md bg-ink px-4 py-2 text-sm text-white">Email me a link to start</button>
          <p className="mt-2 text-xs text-muted">We&rsquo;ll only use your email for your application and ARRAE updates.</p>
        </form>
      )}
    </main>
  );
}
