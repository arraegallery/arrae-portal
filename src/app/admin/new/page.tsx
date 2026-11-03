import Link from "next/link";
import { requireOwner } from "@/lib/team";
import { getRecentSubmissions, markSubmissionsSeen } from "@/lib/queries";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Row = Awaited<ReturnType<typeof getRecentSubmissions>>[number];

export default async function NewSubmissions({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const email = await requireOwner();
  const tab = (await searchParams).tab === "artworks" ? "artworks" : "artists";
  const rows = await getRecentSubmissions(email);
  // Opening this page clears the red dot.
  await markSubmissionsSeen(email);
  const artists = rows.filter((r) => r.isApplication);
  const artworks = rows.filter((r) => !r.isApplication);
  const shown = tab === "artists" ? artists : artworks;
  const unseen = shown.filter((r) => r.unseen).length;

  const tabLink = (id: "artists" | "artworks", label: string, list: Row[]) => {
    const n = list.filter((r) => r.unseen).length;
    const active = tab === id;
    return (
      <Link
        href={`/admin/new${id === "artworks" ? "?tab=artworks" : ""}`}
        className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm ring-1 ${active ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:bg-paper"}`}
      >
        {label}
        {n > 0 && <span className={`rounded-full px-1.5 text-xs ${active ? "bg-white text-red-700" : "bg-red-600 text-white"}`}>{n}</span>}
      </Link>
    );
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
      <h1 className="font-display text-4xl">New</h1>
      <div className="mt-4 flex gap-2">
        {tabLink("artists", "Artists", artists)}
        {tabLink("artworks", "Artworks", artworks)}
      </div>
      <p className="mt-3 text-sm text-muted">
        {tab === "artists"
          ? "People who applied through the apply page. Click a name to open their application."
          : "Works that artists sent, put forward or withdrew from their studio."}{" "}
        {unseen ? `${unseen} new since you last looked, marked with a red dot.` : "Nothing new since you last looked."}
      </p>
      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{tab === "artists" ? "No applications yet." : "No artworks yet."}</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {shown.map((r) => {
            const application = r.showId && r.artistId ? `/admin/review/${r.showId}?artist=${r.artistId}` : null;
            const work = r.showId && r.workId ? `/admin/review/${r.showId}?work=${r.workId}` : null;
            const main = tab === "artists" ? application : work;
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.unseen ? "bg-red-600" : "bg-transparent"}`} aria-label={r.unseen ? "New" : undefined} />
                <div className="min-w-0 flex-1">
                  <p>
                    {main ? (
                      <Link href={main} className="font-medium hover:underline">
                        {r.artist}
                      </Link>
                    ) : r.artistId ? (
                      <Link href={`/admin/artists/${r.artistId}`} className="font-medium hover:underline">
                        {r.artist}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.artist}</span>
                    )}
                    <span className="text-muted"> · {r.body}</span>
                  </p>
                  <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{when(r.at)}</span>
                    {main && (
                      <Link href={main} className="underline">
                        {tab === "artists" ? "Open application" : "Open work"}
                      </Link>
                    )}
                    {r.artistId && (
                      <Link href={`/admin/artists/${r.artistId}`} className="underline">
                        Profile
                      </Link>
                    )}
                    {r.showId && (
                      <Link href={`/admin/review/${r.showId}`} className="underline">
                        Review {r.show ?? "show"}
                      </Link>
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
