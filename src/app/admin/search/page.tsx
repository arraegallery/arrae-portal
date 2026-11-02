import Link from "next/link";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireTeam } from "@/lib/team";
import { signedImageUrls } from "@/lib/images";

const when = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { role } = await requireTeam();
  const owner = role === "owner";
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  if (!q)
    return (
      <main className="mx-auto max-w-4xl px-4 pb-24 pt-8">
        <h1 className="font-display text-4xl">Search</h1>
        <p className="mt-2 text-sm text-muted">Type a name, email, phone number, work title, medium or show in the search box at the top.</p>
      </main>
    );

  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digits = q.replace(/\D/g, "");
  const [artists, works, shows, messages] = await Promise.all([
    db
      .select({ id: s.artists.id, name: s.artists.name, email: s.artists.email, phone: s.artists.phone })
      .from(s.artists)
      .where(or(ilike(s.artists.name, like), ilike(s.artists.email, like), ilike(s.artists.social, like), ilike(s.artists.website, like), digits.length >= 4 ? sql`regexp_replace(coalesce(${s.artists.phone}, ''), '[^0-9]', '', 'g') like ${`%${digits}%`}` : undefined))
      .orderBy(asc(s.artists.name))
      .limit(30),
    db
      .select({ id: s.works.id, title: s.works.title, medium: s.works.medium, year: s.works.year, artistId: s.works.artistId, artist: s.artists.name })
      .from(s.works)
      .leftJoin(s.artists, eq(s.artists.id, s.works.artistId))
      .where(or(ilike(s.works.title, like), ilike(s.works.medium, like), ilike(s.works.category, like), ilike(s.artists.name, like)))
      .orderBy(desc(s.works.submittedOn))
      .limit(48),
    db.select({ id: s.shows.id, name: s.shows.name, type: s.shows.type }).from(s.shows).where(ilike(s.shows.name, like)).limit(10),
    db
      .select({ id: s.artistMessages.id, body: s.artistMessages.body, at: s.artistMessages.createdAt, artistId: s.artistMessages.artistId, artist: s.artists.name, sender: s.artistMessages.sender })
      .from(s.artistMessages)
      .innerJoin(s.artists, eq(s.artists.id, s.artistMessages.artistId))
      .where(ilike(s.artistMessages.body, like))
      .orderBy(desc(s.artistMessages.createdAt))
      .limit(15),
  ]);
  const imgs = works.length
    ? await db
        .select({ workId: s.workImages.workId, path: s.workImages.thumbPath, full: s.workImages.storagePath })
        .from(s.workImages)
        .where(and(inArray(s.workImages.workId, works.map((w) => w.id)), eq(s.workImages.position, 0)))
    : [];
  const urls = await signedImageUrls(imgs.map((i) => i.path ?? i.full));
  const thumb = new Map(imgs.map((i, n) => [i.workId, urls[n]]));
  const total = artists.length + works.length + shows.length + messages.length;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-8">
      <h1 className="font-display text-4xl">Results for &ldquo;{q}&rdquo;</h1>
      {total === 0 && <p className="mt-2 text-sm text-muted">Nothing matched. Try part of a name or title.</p>}

      {artists.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-muted">Artists ({artists.length})</h2>
          <ul className="mt-2 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
            {artists.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/artists/${a.id}`} className="flex flex-wrap gap-x-3 px-4 py-2.5 text-sm hover:bg-paper">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-muted">{[a.email, a.phone].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shows.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-muted">Shows ({shows.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {shows.map((x) =>
              owner ? (
                <li key={x.id}>
                  <Link href={`/admin/review/${x.id}`} className="inline-block rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line hover:bg-paper">
                    {x.name} <span className="text-muted">· {x.type}</span>
                  </Link>
                </li>
              ) : (
                <li key={x.id} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-line">
                  {x.name}
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {works.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-muted">Works ({works.length})</h2>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {works.map((w) => (
              <li key={w.id}>
                <Link href={w.artistId ? `/admin/artists/${w.artistId}` : "#"} className="block overflow-hidden rounded-lg bg-white ring-1 ring-line hover:ring-ink">
                  {thumb.get(w.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb.get(w.id)!} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center text-xs text-muted">No photo</div>
                  )}
                  <div className="p-2 text-xs">
                    <p className="truncate font-medium">{w.title}</p>
                    <p className="truncate text-muted">{w.artist ?? "No artist"}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {messages.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-wider text-muted">Messages ({messages.length})</h2>
          <ul className="mt-2 divide-y divide-line rounded-lg bg-white ring-1 ring-line">
            {messages.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/artists/${m.artistId}`} className="block px-4 py-2.5 text-sm hover:bg-paper">
                  <span className="font-medium">{m.artist}</span>
                  <span className="text-muted">
                    {" "}
                    · {m.sender === "artist" ? "from artist" : "from ARRAE"} · {when(m.at)}
                  </span>
                  <p className="line-clamp-2 text-muted">{m.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
