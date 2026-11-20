import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { signedImageUrls } from "./images";

const STORE = process.env.SHOPIFY_STORE_URL || "https://arraegallery.com";

export type SheetWork = {
  id: string;
  title: string;
  year: string | null;
  medium: string | null;
  category: string | null;
  price: number | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  unit: string;
  sizeAsEntered: string | null;
  sold: boolean;
  onShopify: boolean;
  /** Shows this work was Selected for, newest first. */
  shows: string[];
  /** Ticked when the page opens: available works that are on Shopify or were Selected for a show. */
  suggested: boolean;
  full: string | null;
  thumb: string | null;
  w: number | null;
  h: number | null;
};

export type SheetData = {
  artist: {
    id: string;
    name: string;
    website: string | null;
    social: string | null;
    arraeBio: string;
    ownBio: string;
    collection: string | null;
  };
  headshot: { src: string; from: "portal" | "shopify" } | null;
  exhibited: string[];
  works: SheetWork[];
};

/** The artist collection's picture on the shop (their headshot), when the portal has none. */
async function shopifyCollectionImage(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`${STORE}/collections/${encodeURIComponent(handle)}.json`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { collection?: { image?: { src?: string | null } | null } };
    const src = data.collection?.image?.src;
    return src ? (src.startsWith("//") ? `https:${src}` : src) : null;
  } catch {
    return null;
  }
}

/** Everything the printable one-page artist profile needs. */
export async function getArtistSheet(artistId: string): Promise<SheetData | null> {
  const [artist] = await db.select().from(s.artists).where(eq(s.artists.id, artistId));
  if (!artist) return null;
  const works = await db.select().from(s.works).where(eq(s.works.artistId, artistId));
  const live = works.filter((w) => !w.archivedAt && !w.duplicateOf);
  const ids = live.map((w) => w.id);
  const shows = await db.select({ id: s.shows.id, name: s.shows.name, opensOn: s.shows.opensOn }).from(s.shows);
  const showOrder = [...shows].sort((a, b) => (a.opensOn ?? "").localeCompare(b.opensOn ?? ""));
  const rank = new Map(showOrder.map((x, i) => [x.id, i]));
  const showName = new Map(shows.map((x) => [x.id, x.name]));
  const images = ids.length ? await db.select().from(s.workImages).where(and(inArray(s.workImages.workId, ids), eq(s.workImages.position, 0))) : [];
  const selected = ids.length
    ? await db
        .select({ workId: s.showWorks.workId, showId: s.showWorks.showId })
        .from(s.showWorks)
        .where(and(inArray(s.showWorks.workId, ids), eq(s.showWorks.status, "Selected")))
    : [];
  const apps = await db
    .select({ showId: s.applications.showId })
    .from(s.applications)
    .where(and(eq(s.applications.artistId, artistId), eq(s.applications.status, "Selected")))
    .orderBy(asc(s.applications.submittedOn));

  const fulls = await signedImageUrls(images.map((i) => i.storagePath ?? i.thumbPath));
  const thumbs = await signedImageUrls(images.map((i) => i.thumbPath ?? i.storagePath));
  const imageOf = new Map(images.map((img, i) => [img.workId, { full: fulls[i], thumb: thumbs[i], w: img.widthPx, h: img.heightPx }]));

  const exhibitedIds = new Set<string>([...selected.map((x) => x.showId), ...apps.map((a) => a.showId).filter((x): x is string => !!x)]);
  const exhibited = [...exhibitedIds].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)).map((id) => showName.get(id) ?? id);

  const list: SheetWork[] = live.map((w) => {
    const inShows = selected
      .filter((x) => x.workId === w.id)
      .sort((a, b) => (rank.get(b.showId) ?? 0) - (rank.get(a.showId) ?? 0))
      .map((x) => showName.get(x.showId) ?? x.showId);
    const img = imageOf.get(w.id);
    return {
      id: w.id,
      title: w.title,
      year: w.year,
      medium: w.medium,
      category: w.category,
      price: w.priceUsd === null ? null : Number(w.priceUsd),
      width: w.width,
      height: w.height,
      depth: w.depth,
      unit: w.unit,
      sizeAsEntered: w.sizeAsEntered,
      sold: !!w.soldAt,
      onShopify: !!w.shopifyProductId,
      shows: inShows,
      suggested: false,
      full: img?.full ?? null,
      thumb: img?.thumb ?? null,
      w: img?.w ?? null,
      h: img?.h ?? null,
    };
  });
  // Newest show first, then works on the shop, then the rest by newest submission.
  const newest = (w: SheetWork) => Math.max(-1, ...selected.filter((x) => x.workId === w.id).map((x) => rank.get(x.showId) ?? 0));
  const submitted = new Map(live.map((w) => [w.id, w.submittedOn ?? ""]));
  list.sort((a, b) => newest(b) - newest(a) || Number(b.onShopify) - Number(a.onShopify) || (submitted.get(b.id) ?? "").localeCompare(submitted.get(a.id) ?? ""));
  const available = list.filter((w) => !w.sold && (w.full || w.thumb));
  const shown = available.filter((w) => w.shows.length || w.onShopify);
  // Up to 6: works that were shown first, topped up with other available works.
  for (const w of [...shown, ...available.filter((w) => !shown.includes(w))].slice(0, 6)) w.suggested = true;

  let headshot: SheetData["headshot"] = null;
  if (artist.photoPath) {
    const [src] = await signedImageUrls([artist.photoPath]);
    if (src) headshot = { src, from: "portal" };
  }
  if (!headshot && artist.shopifyCollectionHandle) {
    const src = await shopifyCollectionImage(artist.shopifyCollectionHandle);
    if (src) headshot = { src, from: "shopify" };
  }

  return {
    artist: {
      id: artist.id,
      name: artist.name,
      website: artist.website,
      social: artist.social,
      arraeBio: artist.arraeBio ?? "",
      ownBio: artist.bio ?? "",
      collection: artist.shopifyCollectionHandle,
    },
    headshot,
    exhibited,
    works: list,
  };
}
