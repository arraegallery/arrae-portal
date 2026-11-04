import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { optOut, unsubscribeUrl, validUnsubscribe } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

async function confirm(formData: FormData) {
  "use server";
  const e = String(formData.get("e") ?? "");
  const t = String(formData.get("t") ?? "");
  if (!validUnsubscribe(e, t)) redirect("/unsubscribe");
  await optOut(e, "link");
  redirect(`${new URL(unsubscribeUrl(e)).pathname}${new URL(unsubscribeUrl(e)).search}`);
}

async function resubscribe(formData: FormData) {
  "use server";
  const e = String(formData.get("e") ?? "");
  const t = String(formData.get("t") ?? "");
  if (!validUnsubscribe(e, t)) redirect("/unsubscribe");
  await db.delete(s.emailOptOuts).where(eq(s.emailOptOuts.email, e.trim().toLowerCase()));
  redirect(`${new URL(unsubscribeUrl(e)).pathname}${new URL(unsubscribeUrl(e)).search}&back=1`);
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ e?: string; t?: string; back?: string }> }) {
  const { e = "", t = "", back } = await searchParams;
  const ok = !!e && validUnsubscribe(e, t);
  const [row] = ok ? await db.select().from(s.emailOptOuts).where(eq(s.emailOptOuts.email, e.trim().toLowerCase())) : [];
  return (
    <main className="mx-auto max-w-md px-4 pb-12 pt-24 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/arrae-logo.png" alt="ARRAE" width={858} height={310} className="mx-auto h-7 w-auto" />
      {!ok ? (
        <>
          <h1 className="mt-8 font-display text-3xl">This link doesn&rsquo;t work</h1>
          <p className="mt-2 text-sm text-muted">
            Please use the Unsubscribe link at the bottom of one of our emails, or write to{" "}
            <a href="mailto:hello@arraegallery.com" className="underline">hello@arraegallery.com</a>.
          </p>
        </>
      ) : row ? (
        <>
          <h1 className="mt-8 font-display text-3xl">You&rsquo;re unsubscribed</h1>
          <p className="mt-2 text-sm text-muted">
            {e} won&rsquo;t get ARRAE announcements or application reminders. You&rsquo;ll still get emails about your own account, like sign-in links, messages
            and agreements.
          </p>
          <form action={resubscribe} className="mt-6">
            <input type="hidden" name="e" value={e} />
            <input type="hidden" name="t" value={t} />
            <button className="text-sm underline">Changed your mind? Subscribe again</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-8 font-display text-3xl">{back ? "You’re subscribed again" : "Unsubscribe from ARRAE emails?"}</h1>
          <p className="mt-2 text-sm text-muted">
            {back
              ? `Welcome back. ${e} will get ARRAE announcements again.`
              : `${e} will stop getting ARRAE announcements and application reminders. Emails about your own account, like sign-in links, messages and agreements, still come through.`}
          </p>
          {!back && (
            <form action={confirm} className="mt-6">
              <input type="hidden" name="e" value={e} />
              <input type="hidden" name="t" value={t} />
              <button className="rounded-md bg-ink px-4 py-2 text-sm text-white">Unsubscribe</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
