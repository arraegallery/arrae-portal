import Link from "next/link";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { getAllShowOverviews } from "@/lib/show-stage";
import { STAGES } from "@/lib/stages";

/** Home: the shows in motion, each with the step it's on and the one thing that needs doing there. */
export async function ShowsNow() {
  const all = (await getAllShowOverviews()).filter((o) => !o.past && (o.facts.works > 0 || o.show.openForSubmissions || o.facts.selected > 0));
  // Artists in a show that's installing who still haven't signed in the portal.
  const installing = all.filter((o) => o.current === "install").map((o) => o.show.id);
  const unsigned = new Map<string, number>();
  if (installing.length) {
    const rows = await db
      .selectDistinct({ showId: s.showWorks.showId, artistId: s.works.artistId })
      .from(s.showWorks)
      .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
      .where(and(inArray(s.showWorks.showId, installing), inArray(s.showWorks.status, ["Selected", "Requested"])));
    const signed = new Set(
      (await db.select({ artistId: s.agreements.artistId, signedAt: s.agreements.signedAt }).from(s.agreements).where(isNull(s.agreements.voidedAt))).filter((r) => r.signedAt).map((r) => r.artistId),
    );
    for (const r of rows) if (r.artistId && !signed.has(r.artistId)) unsigned.set(r.showId, (unsigned.get(r.showId) ?? 0) + 1);
  }
  if (!all.length) return null;
  const order = (k: string) => STAGES.findIndex((x) => x.key === k);
  all.sort((a, b) => order(b.current) - order(a.current));
  return (
    <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {all.map(({ show, facts: f, current }) => {
        const step = STAGES.find((x) => x.key === current)!;
        const todo =
          current === "install"
            ? `${f.selected - f.received} works still to come in${unsigned.get(show.id) ? ` · ${unsigned.get(show.id)} artists haven't signed` : ""}`
            : current === "notify"
              ? "Selected works are waiting: send the welcome emails"
              : current === "curate"
                ? `${f.sandbox} works in the sandbox`
                : current === "review"
                  ? `${f.works} works from ${f.applicants} applications`
                  : current === "close"
                    ? `On view · ${f.selected} works`
                    : show.openForSubmissions
                      ? "Open, waiting for submissions"
                      : "Set dates and open the call";
        return (
          <Link key={show.id} href={`/admin/s/${show.id}/${current}`} className="rounded-xl bg-white p-4 ring-1 ring-line transition hover:ring-ink/40">
            <p className="text-xs text-muted">
              {show.type} · step {order(current) + 1} of 6
            </p>
            <p className="font-display text-xl">
              {show.name} <span className="text-muted">· {step.label}</span>
            </p>
            <p className="mt-1 text-sm">{todo}</p>
          </Link>
        );
      })}
    </section>
  );
}
