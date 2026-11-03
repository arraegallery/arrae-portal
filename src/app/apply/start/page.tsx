import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { artistsForEmail, signedInEmail } from "@/lib/artist-auth";
import { getTerms } from "@/lib/terms";
import { Prose } from "@/components/Prose";
import { agreeToTerms } from "../actions";
import { ApplicationForm } from "./ApplicationForm";

export default async function StartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const email = await signedInEmail();
  if (!email) redirect("/apply");
  const { error } = await searchParams;
  const terms = await getTerms();
  let [signup] = await db.select().from(s.applicantSignups).where(eq(s.applicantSignups.email, email));
  if (!signup) [signup] = await db.insert(s.applicantSignups).values({ email }).onConflictDoNothing().returning();
  const agreed = !!signup?.termsAgreedAt && signup.termsVersion === terms.version;

  if (!agreed)
    return (
      <main className="mx-auto max-w-3xl px-4 pb-10 pt-20">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Step 2 of 3</p>
        <h1 className="font-display text-4xl">How we work with artists</h1>
        <p className="mt-1 text-sm text-muted">Please read this before you apply, so you know how we work if you&rsquo;re selected. This isn&rsquo;t a contract: if we select your work, we&rsquo;ll send you our partnership agreement to review and sign then.</p>
        <article className="mt-6 rounded-lg bg-white p-6 ring-1 ring-line">
          <Prose text={terms.text} />
        </article>
        <form action={agreeToTerms} className="mt-6 rounded-lg bg-white p-4 ring-1 ring-line">
          <input type="hidden" name="version" value={terms.version} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="agree" value="yes" required className="mt-1" />
            <span>I&rsquo;ve read how ARRAE works with artists.</span>
          </label>
          {error === "agree" && <p className="mt-2 text-sm text-rose-700">Please tick the box to confirm you&rsquo;ve read this before continuing.</p>}
          {error === "changed" && <p className="mt-2 text-sm text-rose-700">This page was just updated. Please read it again before continuing.</p>}
          <button className="mt-3 rounded-md bg-ink px-4 py-2 text-sm text-white">Continue to my application</button>
          <p className="mt-3 text-xs text-muted">
            Not quite ready yet? Go back to{" "}
            <a href="https://arraegallery.com" className="underline">
              arraegallery.com
            </a>{" "}
            and sign up for gallery updates, open-call reminders and artist opportunities.
          </p>
        </form>
      </main>
    );

  const shows = await db
    .select({ id: s.shows.id, name: s.shows.name, description: s.shows.description, deadline: s.shows.applicationDeadline })
    .from(s.shows)
    .where(eq(s.shows.openForSubmissions, true))
    .orderBy(asc(s.shows.name));
  const existing = (await artistsForEmail(email))[0];
  if (!shows.length)
    return (
      <main className="mx-auto max-w-xl px-4 pb-12 pt-20">
        <h1 className="font-display text-3xl">Applications are closed right now</h1>
        <p className="mt-2 text-sm text-muted">Thank you for your interest. We&rsquo;ll email {email} when the next open call starts.</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-20">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Step 3 of 3</p>
      <h1 className="font-display text-4xl">Your application</h1>
      <p className="mt-1 text-sm text-muted">
        Applying as {email}.{" "}
        {existing && (
          <>
            You&rsquo;re already on file with ARRAE, so we&rsquo;ve filled in what we have. You can also{" "}
            <Link href="/studio" className="underline">
              put past works forward from your studio
            </Link>
            .
          </>
        )}
      </p>
      <ApplicationForm
        shows={shows}
        prefill={{
          name: existing?.name ?? "",
          phone: existing?.phone ?? "",
          bio: existing?.bio ?? "",
          social: existing?.social ?? "",
          website: existing?.website ?? "",
          education: existing?.education ?? "",
        }}
        draft={signup?.formDraft ?? null}
      />
    </main>
  );
}
