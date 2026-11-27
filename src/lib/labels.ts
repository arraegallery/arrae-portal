import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { shopifyConfigured, shopifyGql } from "@/lib/shopify/admin";

/**
 * Wall labels for a show, as rows for the Niimbot label app (one row per artwork).
 *
 * Same rules as the old Airtable label sheet:
 *  - columns Artist, Title, Materials, Year, QR, SKU, Notes (QR = the artwork's page on arraegallery.com)
 *  - Artist with each word capitalized; Title and Materials as written, only spaces tidied
 *  - sorted by Artist, then SKU
 *  - nothing is ever dropped: anything to check before printing goes in Notes
 * Read-only: never changes the portal or Shopify.
 */

export const LABEL_COLUMNS = ["Artist", "Title", "Materials", "Year", "QR", "SKU", "Notes"] as const;
export const LABEL_WIDTHS = [26, 40, 45, 8, 70, 10, 60];
export type LabelRow = Record<(typeof LABEL_COLUMNS)[number], string>;

const STORE_URL = "https://arraegallery.com/products/";
const SMALL_WORDS = new Set(["of", "de", "del", "la", "las", "los", "y", "and", "the", "van", "von", "da", "di"]);

const tidy = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const key = (v: string | null | undefined) =>
  tidy(v)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"'’‘]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "Ivette lopez" → "Ivette Lopez". Leaves the artist's own capitals ("DiBartolomeo", "ManD'oh") alone. */
export function labelArtist(name: string) {
  return tidy(name)
    .split(" ")
    .map((w, i) => (w && /^[a-zà-ÿ]/.test(w) && !(i > 0 && SMALL_WORDS.has(w)) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function quotesUneven(title: string) {
  const apostrophes = (title.match(/\w'\w/g) ?? []).length;
  return (
    (title.match(/"/g) ?? []).length % 2 === 1 ||
    ((title.match(/'/g) ?? []).length - apostrophes) % 2 === 1 ||
    (title.match(/“/g) ?? []).length !== (title.match(/”/g) ?? []).length
  );
}

type StoreVariant = { sku: string | null; product: { id: string; handle: string; title: string; vendor: string; status: string } | null };

/** Every product variant on the store with its product: SKU, link and title, for matching. */
async function loadStoreVariants(): Promise<StoreVariant[]> {
  const out: StoreVariant[] = [];
  let after: string | null = null;
  for (let i = 0; i < 100; i++) {
    const data: { productVariants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: StoreVariant[] } } = await shopifyGql(
      `query($after: String) { productVariants(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { sku product { id handle title vendor status } } } }`,
      { after },
    );
    out.push(...data.productVariants.nodes);
    if (!data.productVariants.pageInfo.hasNextPage) break;
    after = data.productVariants.pageInfo.endCursor;
  }
  return out;
}

export type ShowLabels = { showName: string; rows: LabelRow[]; shopifyChecked: boolean; source: "selected" | "sandbox" };

export async function buildShowLabels(showId: string): Promise<ShowLabels | null> {
  const [show] = await db.select({ id: s.shows.id, name: s.shows.name }).from(s.shows).where(eq(s.shows.id, showId));
  if (!show) return null;

  // The show's works: everything Selected for it. Before Finalize nothing is Selected yet, so use the sandbox.
  let source: ShowLabels["source"] = "selected";
  let workIds = (
    await db
      .select({ id: s.showWorks.workId })
      .from(s.showWorks)
      .where(and(eq(s.showWorks.showId, showId), eq(s.showWorks.status, "Selected")))
  ).map((r) => r.id);
  if (workIds.length === 0) {
    source = "sandbox";
    workIds = (await db.select({ id: s.sandboxItems.workId }).from(s.sandboxItems).where(eq(s.sandboxItems.showId, showId))).map((r) => r.id);
  }
  if (workIds.length === 0) return { showName: show.name, rows: [], shopifyChecked: false, source };

  const works = await db
    .select({
      id: s.works.id,
      title: s.works.title,
      year: s.works.year,
      medium: s.works.medium,
      width: s.works.width,
      height: s.works.height,
      price: s.works.priceUsd,
      soldAt: s.works.soldAt,
      shopifyProductId: s.works.shopifyProductId,
      shopifyHandle: s.works.shopifyHandle,
      artistName: s.artists.name,
    })
    .from(s.works)
    .leftJoin(s.artists, eq(s.artists.id, s.works.artistId))
    .where(inArray(s.works.id, workIds));

  const earlier = await db
    .select({ workId: s.showWorks.workId, show: s.shows.name })
    .from(s.showWorks)
    .innerJoin(s.shows, eq(s.shows.id, s.showWorks.showId))
    .where(and(inArray(s.showWorks.workId, workIds), eq(s.showWorks.status, "Selected"), ne(s.showWorks.showId, showId)));
  const earlierShows = new Map<string, Set<string>>();
  for (const e of earlier) (earlierShows.get(e.workId) ?? earlierShows.set(e.workId, new Set()).get(e.workId)!).add(e.show);

  // Shopify: the real page link and SKU for every work. If it can't be reached, fall back to the portal's saved link.
  let variants: StoreVariant[] | null = null;
  if (shopifyConfigured()) {
    try {
      variants = await loadStoreVariants();
    } catch (e) {
      console.error("labels: Shopify lookup failed", e);
    }
  }
  const byProduct = new Map<string, StoreVariant>();
  const byTitle = new Map<string, StoreVariant[]>();
  const productsBySku = new Map<string, Set<string>>();
  for (const v of variants ?? []) {
    if (!v.product) continue;
    if (!byProduct.has(v.product.id)) byProduct.set(v.product.id, v);
    const t = key(v.product.title);
    byTitle.set(t, [...(byTitle.get(t) ?? []), v]);
    if (v.sku) (productsBySku.get(v.sku) ?? productsBySku.set(v.sku, new Set()).get(v.sku)!).add(v.product.id);
  }

  const rows: (LabelRow & { _size: string; _price: string })[] = works.map((w) => {
    const notes: string[] = [];
    const title = tidy(w.title);
    const materials = tidy(w.medium);
    const year = tidy(w.year);
    const artist = labelArtist(w.artistName ?? "");

    let match: StoreVariant | undefined;
    if (variants) {
      if (w.shopifyProductId) match = byProduct.get(w.shopifyProductId);
      if (!match) {
        const sameTitle = (byTitle.get(key(w.title)) ?? []).filter((v) => key(v.product!.vendor) === key(w.artistName));
        const live = sameTitle.filter((v) => v.product!.status === "ACTIVE");
        const pick = live.length ? live : sameTitle;
        if (pick.length === 1) {
          match = pick[0];
          notes.push(w.shopifyProductId ? "Linked Shopify product is gone; found another by title." : "Found on Shopify by title; not linked in the portal yet.");
        } else if (pick.length > 1) notes.push("More than one Shopify product has this title. Check.");
      }
    }
    const handle = match?.product?.handle ?? (variants ? null : w.shopifyHandle);
    const sku = match?.sku ?? "";

    if (!title) notes.push("Title missing in the portal.");
    if (!materials) notes.push("Medium missing in the portal.");
    if (!year) notes.push("Year missing in the portal.");
    else if (!/^\d{4}$/.test(year)) notes.push(`Year is "${year}". Check.`);
    if (/\(framed\)/i.test(title)) notes.push('Title includes "(framed)". Remove for the label?');
    if (quotesUneven(title)) notes.push("Quote marks in the title don't match. Check.");
    if (!handle) notes.push("Not on the website yet.");
    else if (!variants) notes.push("Shopify wasn't checked; link from the portal.");
    if (match?.product && match.product.status !== "ACTIVE") notes.push(`On Shopify as ${match.product.status.toLowerCase()}, so the QR page won't open.`);
    if (sku && (productsBySku.get(sku)?.size ?? 0) > 1) {
      const others = [...productsBySku.get(sku)!].filter((id) => id !== match?.product?.id).map((id) => byProduct.get(id)?.product);
      notes.push(`SKU ${sku} is also used by another Shopify product (${others.map((p) => `${p?.title}, ${p?.vendor}`).join("; ")}). Check.`);
    }
    if (match?.product && key(match.product.title) !== key(w.title)) notes.push(`Shopify title is "${match.product.title}".`);
    const before = earlierShows.get(w.id);
    if (before?.size) notes.push(`Existing product from an earlier show (${[...before].sort().join(", ")}).`);
    if (w.soldAt) notes.push("Marked sold in the portal.");

    return {
      Artist: artist,
      Title: title,
      Materials: materials,
      Year: year,
      QR: handle ? STORE_URL + handle : "",
      SKU: sku,
      Notes: notes.join(" "),
      _size: w.width && w.height ? `${w.width}x${w.height}` : "",
      _price: w.price ?? "",
    };
  });

  // Same title twice for one artist; same title, size and price under two artists.
  const addNote = (r: LabelRow, n: string) => (r.Notes = r.Notes ? `${r.Notes} ${n}` : n);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${key(r.Artist)}|${key(r.Title)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const g of groups.values()) if (g.length > 1) for (const r of g) addNote(r, `Listed twice (${g.map((x) => x.SKU || "no SKU").join(" and ")}). Check.`);
  const copies = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r._size) continue;
    const k = `${key(r.Title)}|${r._size}|${r._price}`;
    copies.set(k, [...(copies.get(k) ?? []), r]);
  }
  for (const g of copies.values()) {
    if (new Set(g.map((x) => key(x.Artist))).size < 2) continue;
    for (const r of g) {
      const o = g.find((x) => key(x.Artist) !== key(r.Artist))!;
      addNote(r, `Looks like a copy of ${o.Artist} "${o.Title}" (${o.SKU || "no SKU"}). Check artist.`);
    }
  }

  const skuNumber = (v: string) => Number(v.match(/\d+/)?.[0] ?? Number.MAX_SAFE_INTEGER);
  rows.sort(
    (a, b) =>
      a.Artist.localeCompare(b.Artist, "en", { sensitivity: "base" }) ||
      skuNumber(a.SKU) - skuNumber(b.SKU) ||
      a.Title.localeCompare(b.Title, "en", { sensitivity: "base" }),
  );
  return {
    showName: show.name,
    rows: rows.map(({ _size, _price, ...r }) => r),
    shopifyChecked: !!variants,
    source,
  };
}
