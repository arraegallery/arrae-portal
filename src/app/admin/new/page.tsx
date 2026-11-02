import Link from "next/link";
import { requireOwner } from "@/lib/team";
import { getRecentSubmissions, markSubmissionsSeen } from "@/lib/queries";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default async function NewSubmissions() {
  const email = await requireOwner();
  const rows = await getRecentSubmissions(email);
  // Opening this page clears the red dot.
  await markSubmissionsSeen(email);
  const unseen = rows.filter((r) => r.unseen).length;
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
      <h1 className="font-display text-4xl">New applications</h1>
      <p className="mt-1 text-sm text-muted">
        {unseen ? `${unseen} new since you last looked, marked with a red dot.` : "Nothing new since you last looked."} Applications from the apply page and works artists send from
        their studio both show here.
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No applications yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3 text-sm">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.unseen ? "bg-red-600" : "bg-transparent"}`} aria-label={r.unseen ? "New" : undefined} />
              <div className="min-w-0 flex-1">
                <p>
                  {r.artistId ? (
                    <Link href={`/admin/artists/${r.artistId}`} className="font-medium hover:underline">
                      {r.artist}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.artist}</span>
                  )}
                  <span className="text-muted"> · {r.body}</span>
                </p>
                <p className="text-xs text-muted">
                  {when(r.at)}
                  {r.showId && (
                    <>
                      {" · "}
                      <Link href={`/admin/review/${r.showId}`} className="underline">
                        Review {r.show ?? "show"}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
