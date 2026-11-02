import { supabaseAdmin, supabaseConfigured } from "./supabase/server";

export const IMAGE_BUCKET = "artworks";

/** Signed links for stored images, valid for an hour. Missing copies map to null. */
export async function signedImageUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  const real = paths.filter((p): p is string => !!p);
  if (!real.length || !supabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return paths.map(() => null);
  const { data } = await supabaseAdmin().storage.from(IMAGE_BUCKET).createSignedUrls(real, 3600);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return paths.map((p) => (p ? (byPath.get(p) ?? null) : null));
}
