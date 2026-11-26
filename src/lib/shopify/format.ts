/**
 * How ARRAE lays out artist collections and artwork products on Shopify, matched to what's
 * already on the store (checked Nov 26, 2026):
 *  - Artist collection: manual, title = artist name, handle = name slug, template "artists",
 *    sorted Best selling, description = ARRAE bio, image = artist photo.
 *  - Artwork product: vendor = artist name, product type = category, tags = [year, artist handle,
 *    category lower case, show tag], one variant (price, SKU ART…, 1 in stock, don't sell when out),
 *    in the artist's collection. Show collections are smart ("tag is Volume III", or the takeover's
 *    handle as tag). "Artworks" is smart by price, so it fills itself.
 */

export function slugify(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → simple paragraphs for a collection description. */
export function bioHtml(bio: string) {
  return bio
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Text with markup and spacing differences ironed out, for "is this the same?" checks. */
export function sameText(a: string | null | undefined, b: string | null | undefined) {
  const norm = (t: string | null | undefined) =>
    (t ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;|&#8217;/g, "’")
      .replace(/'/g, "’")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  return norm(a) === norm(b);
}

export type ShowTagInfo = { id: string; name: string; type: string };

/** The tag that puts a work in its show's (smart) collection: Volumes use the name, other shows their handle. */
export function showTag(show: ShowTagInfo) {
  if (show.type === "Volume") return show.name;
  if (show.id === "arrae-finds") return "arrae finds";
  return show.id;
}

type SizeWork = { width: number | null; height: number | null; depth: number | null; unit: string; sizeAsEntered: string | null };

export function dimensions(w: SizeWork) {
  if (w.sizeAsEntered?.trim()) return w.sizeAsEntered.trim();
  if (!w.width || !w.height) return "";
  const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
  const mark = w.unit === "in" ? '"' : ` ${w.unit}`;
  return [w.height, w.width, w.depth].filter((x): x is number => !!x).map((x) => `${n(x)}${mark}`).join(" x ");
}

export type ProductWork = SizeWork & { title: string; year: string | null; medium: string | null; description: string | null; category: string | null };

/** The product description in ARRAE's usual layout. */
export function productDescriptionHtml(w: ProductWork) {
  const lines = [`Year: ${escapeHtml(w.year?.trim() || "")}`, `Dimensions: ${escapeHtml(dimensions(w))}`, `Medium: ${escapeHtml(w.medium?.trim() || "")}`].join("<br>\n");
  const about = w.description?.trim();
  return about ? `${lines}<p>\nArtist Description of Work: <br>${escapeHtml(about).replace(/\r?\n/g, "<br>")}</p>` : lines;
}

export function productTags(w: { year: string | null; category: string | null }, artistHandle: string, tags: string[]) {
  const out = [w.year?.trim(), artistHandle, w.category?.trim().toLowerCase(), ...tags].filter((t): t is string => !!t);
  return [...new Set(out)];
}

/** Next free SKU in the ART### series. */
export function nextSku(skus: (string | null | undefined)[], taken = new Set<string>()) {
  let max = 0;
  for (const s of skus) {
    const m = s?.trim().match(/^ART(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (const t of taken) {
    const m = t.match(/^ART(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ART${String(max + 1).padStart(3, "0")}`;
}

/** A handle not already used: "title-artist", then "title-artist-2", … */
export function freeHandle(base: string, used: Set<string>) {
  const clean = slugify(base) || "artwork";
  if (!used.has(clean)) return clean;
  for (let i = 2; ; i++) if (!used.has(`${clean}-${i}`)) return `${clean}-${i}`;
}

export function priceText(p: number | string | null | undefined) {
  if (p === null || p === undefined || p === "") return null;
  const n = Number(p);
  return Number.isFinite(n) ? n.toFixed(2) : null;
}
