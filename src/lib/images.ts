import { supabaseAdmin, supabaseConfigured } from "./supabase/server";

export const IMAGE_BUCKET = "artworks";

/** Signed links for stored images, valid for an hour. Missing copies map to null. */
export async function signedImageUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  const real = paths.filter((p): p is string => !!p);
  if (!real.length || !supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return paths.map(() => null);
  // The API takes at most 1000 paths per call
  const unique = [...new Set(real)];
  const chunks = Array.from({ length: Math.ceil(unique.length / 1000) }, (_, i) => unique.slice(i * 1000, i * 1000 + 1000));
  const results = await Promise.all(chunks.map((c) => supabaseAdmin().storage.from(IMAGE_BUCKET).createSignedUrls(c, 3600)));
  const byPath = new Map(results.flatMap((r) => r.data ?? []).map((d) => [d.path, d.signedUrl]));
  return paths.map((p) => (p ? (byPath.get(p) ?? null) : null));
}
