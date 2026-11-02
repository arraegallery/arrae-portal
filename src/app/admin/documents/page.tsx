import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { DOC_KINDS, kindLabel } from "@/lib/document-kinds";

const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await requireOwner();
  const { kind } = await searchParams;
  const valid = DOC_KINDS.some(([k]) => k === kind) ? kind! : null;
  const rows = await db
    .select({ d: s.documents, artist: s.artists.name, show: s.shows.name })
    .from(s.documents)
    .innerJoin(s.artists, eq(s.artists.id, s.documents.artistId))
    .leftJoin(s.shows, eq(s.shows.id, s.documents.showId))
    .where(valid ? eq(s.documents.kind, valid) : undefined)
    .orderBy(desc(s.documents.createdAt))
    .limit(300);
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-8">
      <h1 className="font-display text-4xl">Documents</h1>
      <p className="mt-1 text-sm text-muted">
        Every file kept for artists, newest first. To add one, open the artist&rsquo;s page and use Documents. Signed agreements are on the{" "}
        <Link href="/admin/agreements" className="underline">
          Agreements
        </Link>{" "}
        page.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Link href="/admin/documents" className={`rounded-full px-3 py-1 ring-1 ${!valid ? "bg-ink text-white ring-ink" : "ring-line"}`}>
          All
        </Link>
        {DOC_KINDS.map(([k, label]) => (
          <Link key={k} href={`/admin/documents?kind=${k}`} className={`rounded-full px-3 py-1 ring-1 ${valid === k ? "bg-ink text-white ring-ink" : "ring-line"}`}>
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No documents yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {rows.map(({ d, artist, show }) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] ring-1 ring-line">{kindLabel(d.kind)}</span>
              <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {d.title}
              </a>
              <Link href={`/admin/artists/${d.artistId}#documents`} className="text-muted hover:underline">
                {artist}
              </Link>
              <span className="ml-auto text-xs text-muted">
                {day(d.createdAt)}
                {show && ` · ${show}`}
                {d.uploadedByRole === "artist" ? " · from the artist" : ""}
                {!d.visibleToArtist && " · private"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
