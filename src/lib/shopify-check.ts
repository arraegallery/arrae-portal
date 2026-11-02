import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { signedImageUrls } from "./images";

export type Issue = { key: string; label: string; artist?: boolean };

/** The selected works of a show with everything Shopify needs, and what's still missing. */
export async function getShopifyCheck(showId: string | undefined) {
  const shows = await db.select({ id: s.shows.id, name: s.shows.name, type: s.shows.type, opensOn: s.shows.opensOn }).from(s.shows).orderBy(desc(s.shows.opensOn));
  const show = shows.find((x) => x.id === showId) ?? shows.find((x) => x.id === "volume-iv") ?? shows[0];
  if (!show) return { shows, show: null, rows: [] };
  const rows = await db
    .select({ sw: s.showWorks, work: s.works, artist: s.artists })
    .from(s.showWorks)
    .innerJoin(s.works, eq(s.works.id, s.showWorks.workId))
    .leftJoin(s.artists, eq(s.artists.id, s.works.artistId))
    .where(and(eq(s.showWorks.showId, show.id), eq(s.showWorks.status, "Selected")));
  const ids = rows.map((r) => r.work.id);
  const images = ids.length ? await db.select().from(s.workImages).where(inArray(s.workImages.workId, ids)) : [];
  const mains = ids.map((id) => images.filter((i) => i.workId === id).sort((a, b) => a.position - b.position)[0] ?? null);
  const thumbs = await signedImageUrls(mains.map((m) => m?.thumbPath ?? m?.storagePath ?? null));
  const out = rows.map((r, i) => {
    const w = r.work;
    const a = r.artist;
    const issues: Issue[] = [];
    const count = images.filter((x) => x.workId === w.id).length;
    if (!count) issues.push({ key: "photo", label: "No photo" });
    if (w.photosRequestedAt) issues.push({ key: "photoRequest", label: "Waiting on better photos" });
    if (w.priceUsd === null) issues.push({ key: "price", label: "No price" });
    if (!w.width || !w.height) issues.push({ key: "size", label: "No size" });
    if (!w.medium?.trim()) issues.push({ key: "medium", label: "No medium" });
    if (!w.year?.trim()) issues.push({ key: "year", label: "No year" });
    if (!a) issues.push({ key: "artist", label: "No artist", artist: true });
    else {
      if (!a.arraeBio?.trim()) issues.push({ key: "bio", label: "Artist has no ARRAE bio", artist: true });
      if (!a.shopifyCollectionHandle?.trim()) issues.push({ key: "collection", label: "Artist has no Shopify collection", artist: true });
    }
    return {
      id: w.id,
      title: w.title,
      year: w.year,
      medium: w.medium,
      description: w.description,
      price: w.priceUsd === null ? null : Number(w.priceUsd),
      width: w.width,
      height: w.height,
      depth: w.depth,
      unit: w.unit,
      sizeAsEntered: w.sizeAsEntered,
      photos: count,
      image: mains[i] ? { id: mains[i]!.id, thumb: thumbs[i], full: null as string | null, w: mains[i]!.widthPx, h: mains[i]!.heightPx } : null,
      artist: a ? { id: a.id, name: a.name, collection: a.shopifyCollectionHandle } : null,
      received: !!r.sw.receivedAt,
      checked: !!w.shopifyReviewedAt,
      onShopify: !!w.shopifyProductId,
      issues,
    };
  });
  out.sort((x, y) => (x.artist?.name ?? "").localeCompare(y.artist?.name ?? "") || x.title.localeCompare(y.title));
  return { shows, show, rows: out };
}
