import Link from "next/link";
import { getInbox } from "@/lib/queries";

export default async function InboxPage() {
  const threads = await getInbox();
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24">
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Private to ARRAE</p>
        <h1 className="font-display text-4xl">Inbox</h1>
        <p className="mt-1 text-sm text-muted">
          Conversations with artists from their studio. To start one, open an artist&apos;s profile and write under Messages. For one email to many artists, use{" "}
          <Link href="/admin/messages" className="underline">
            Messages
          </Link>
          .
        </p>
      </section>
      {threads.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-muted ring-1 ring-line">No conversations yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {threads.map((t) => (
            <li key={t.artistId}>
              <Link href={`/admin/artists/${t.artistId}#messages`} className="flex items-start gap-4 px-4 py-3 hover:bg-paper">
                <div className="min-w-0 flex-1">
                  <p className={`font-display text-lg ${t.unread ? "font-semibold" : ""}`}>{t.name}</p>
                  <p className="truncate text-sm text-muted">
                    {t.last.sender === "arrae" ? "You: " : ""}
                    {t.last.body}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <p>{new Date(t.last.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                  {t.unread > 0 && <p className="mt-1 inline-block rounded-full bg-ink px-2 py-0.5 text-white">{t.unread} new</p>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
