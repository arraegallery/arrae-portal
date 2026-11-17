import { supabaseAdmin, supabaseConfigured } from "./supabase/server";

export const IMAGE_BUCKET = "artworks";

/** How long signed image links last. Long enough that a sandbox or review board left open all day keeps its pictures. */
const LINK_SECONDS = 12 * 3600;

/** Signed links for stored images. Missing copies map to null. A batch that fails is retried once. */
export async function signedImageUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  const real = paths.filter((p): p is string => !!p);
  if (!real.length || !supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return paths.map(() => null);
  // The API takes at most 1000 paths per call
  const unique = [...new Set(real)];
  const chunks = Array.from({ length: Math.ceil(unique.length / 1000) }, (_, i) => unique.slice(i * 1000, i * 1000 + 1000));
  const sign = async (c: string[]) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await supabaseAdmin().storage.from(IMAGE_BUCKET).createSignedUrls(c, LINK_SECONDS);
      if (!r.error && r.data) return r.data;
      console.error(`signing ${c.length} image links failed (attempt ${attempt + 1}):`, r.error?.message);
    }
    return [];
  };
  const results = await Promise.all(chunks.map(sign));
  const byPath = new Map(results.flat().flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])));
  return paths.map((p) => (p ? (byPath.get(p) ?? null) : null));
}
