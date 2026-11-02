import Link from "next/link";

export default async function DonePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-4xl">Thank you for applying</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        We received your application{show ? ` for ${show}` : ""}, and we&rsquo;ve emailed you a copy. We review every application carefully; decisions are made a few weeks before the
        show opens.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted">In the meantime, your studio is where you can see your application, update your works, and message us.</p>
      <Link href="/studio" className="mt-6 inline-block rounded-md bg-ink px-4 py-2 text-sm text-white">
        Open my studio
      </Link>
    </main>
  );
}
