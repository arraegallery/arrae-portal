import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdmin, supabaseConfigured } from "./supabase/server";

export const IMAGE_BUCKET = "artworks";

/**
 * Image links used to be Supabase signed links made while the page rendered. They expired, so a
 * page left open lost its pictures, and one failed batch blanked dozens of works. Now every
 * picture gets a stable link on our own site, /img/<path>?e=…&s=…, which stays the same for a week.
 * Opening it makes a fresh storage link right then (see src/app/img/[...path]/route.ts).
 * The signature means only links this site handed out work.
 */
const WEEK = 7 * 24 * 3600;

function secret() {
  return process.env.IMAGE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function signature(path: string, expires: number) {
  return createHmac("sha256", secret()).update(`${path}\n${expires}`).digest("base64url").slice(0, 22);
}

/** Checks a link from imageLink(). */
export function validImageLink(path: string, expires: number, sig: string) {
  if (!secret() || !Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
  const want = Buffer.from(signature(path, expires));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** A stable link to a stored image, good for one to two weeks. */
export function imageLink(path: string) {
  // Same expiry for everyone within a week, so the browser can reuse what it already loaded.
  const expires = (Math.floor(Date.now() / 1000 / WEEK) + 2) * WEEK;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `/img/${encoded}?e=${expires}&s=${signature(path, expires)}`;
}

/** Links for stored images (see above). Missing copies map to null. */
export async function signedImageUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  if (!supabaseConfigured || !secret()) return paths.map(() => null);
  return paths.map((p) => (p ? imageLink(p) : null));
}

/** A real Supabase signed link, made now. A failure is retried once. */
export async function freshStorageLink(path: string, seconds: number): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await supabaseAdmin().storage.from(IMAGE_BUCKET).createSignedUrl(path, seconds);
    if (r.data?.signedUrl) return r.data.signedUrl;
    console.error(`image link for ${path} failed (attempt ${attempt + 1}):`, r.error?.message);
  }
  return null;
}
