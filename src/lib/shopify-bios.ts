/** Reads ARRAE's public Shopify collections and matches them to artist records by name. */

export type StoreCollection = { title: string; handle: string; bio: string };

const STORE = process.env.SHOPIFY_STORE_URL || "https://arraegallery.com";

export function htmlToText(html: string) {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchStoreCollections(): Promise<StoreCollection[]> {
  const all: StoreCollection[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(`${STORE}/collections.json?limit=250&page=${page}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`The shop answered ${res.status} for its collection list`);
    const data = (await res.json()) as { collections?: { title: string; handle: string; body_html?: string | null }[] };
    const list = data.collections ?? [];
    all.push(...list.map((c) => ({ title: c.title, handle: c.handle, bio: htmlToText(c.body_html ?? "") })));
    if (list.length < 250) break;
  }
  return all;
}

/** "Gianna DiBartolomeo (Gianna D)" → ["gianna dibartolomeo gianna d", "gianna dibartolomeo", "gianna d"] */
export function nameKeys(name: string) {
  const norm = (t: string) =>
    t
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const keys = new Set<string>([norm(name)]);
  const paren = name.match(/^(.*?)\((.*?)\)/);
  if (paren) {
    keys.add(norm(paren[1]));
    keys.add(norm(paren[2]));
  }
  if (name.includes("@")) keys.add(norm(name.split("@")[0]));
  if (name.includes(":")) keys.add(norm(name.split(":")[0]));
  keys.delete("");
  return [...keys];
}

export function matchCollections<A extends { id: string; name: string }>(artists: A[], collections: StoreCollection[]) {
  const byKey = new Map<string, A[]>();
  for (const a of artists) for (const k of nameKeys(a.name)) byKey.set(k, [...(byKey.get(k) ?? []), a]);
  const matches: { artist: A; collection: StoreCollection }[] = [];
  const unmatched: StoreCollection[] = [];
  for (const c of collections) {
    if (!c.bio) continue;
    const keys = [...nameKeys(c.title), c.handle.replace(/-/g, " ")];
    const hit = keys.map((k) => byKey.get(k)).find((list) => list && list.length === 1)?.[0];
    if (hit) matches.push({ artist: hit, collection: c });
    else unmatched.push(c);
  }
  return { matches, unmatched };
}
