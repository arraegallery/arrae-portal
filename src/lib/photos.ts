import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { IMAGE_BUCKET, signedImageUrls } from "./images";
import { supabaseAdmin } from "./supabase/server";

/** Server-only helpers behind both the ARRAE and the artist photo tools. Callers check who may touch the work. */

const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);

export type UploadSlot = { full: { path: string; token: string }; thumb: { path: string; token: string } };
export type UploadedPhoto = { path: string; thumbPath: string | null; w: number | null; h: number | null };
export type Photo = { id: string; position: number; thumb: string | null; full: string | null; w: number | null; h: number | null };

/** Signed upload slots (full image + small copy) inside the work's own folder. */
export async function createPhotoSlots(workId: string, count: number): Promise<UploadSlot[]> {
  const n = Math.min(Math.max(1, Math.floor(count)), 5);
  const storage = supabaseAdmin().storage.from(IMAGE_BUCKET);
  const slots: UploadSlot[] = [];
  for (let i = 0; i < n; i++) {
    const base = `works/${workId}/${rand()}`;
    const [full, thumb] = await Promise.all([storage.createSignedUploadUrl(`${base}.jpg`), storage.createSignedUploadUrl(`${base}-thumb.jpg`)]);
    if (full.error || thumb.error) throw new Error(`Couldn't prepare the upload: ${(full.error ?? thumb.error)?.message}`);
    slots.push({ full: { path: full.data.path, token: full.data.token }, thumb: { path: thumb.data.path, token: thumb.data.token } });
  }
  return slots;
}

export async function listPhotos(workId: string): Promise<Photo[]> {
  const rows = await db.select().from(s.workImages).where(eq(s.workImages.workId, workId)).orderBy(asc(s.workImages.position));
  const thumbs = await signedImageUrls(rows.map((r) => r.thumbPath ?? r.storagePath));
  const fulls = await signedImageUrls(rows.map((r) => r.storagePath));
  return rows.map((r, i) => ({ id: r.id, position: r.position, thumb: thumbs[i], full: fulls[i], w: r.widthPx, h: r.heightPx }));
}

/** Rewrites positions 0..n in the given order. Position 0 is the main image everywhere. */
async function setOrder(workId: string, ids: string[]) {
  for (let i = 0; i < ids.length; i++) await db.update(s.workImages).set({ position: i }).where(and(eq(s.workImages.id, ids[i]), eq(s.workImages.workId, workId)));
}

/** Saves newly uploaded photos. With `asMain`, the first new photo becomes the main image. */
export async function attachPhotos(workId: string, images: UploadedPhoto[], asMain: boolean) {
  const prefix = `works/${workId}/`;
  if (!images.length) throw new Error("Add at least one photo");
  if (images.some((i) => !i.path.startsWith(prefix) || (i.thumbPath && !i.thumbPath.startsWith(prefix)))) throw new Error("Those photos don't belong to this work");
  const existing = await db.select({ id: s.workImages.id }).from(s.workImages).where(eq(s.workImages.workId, workId)).orderBy(asc(s.workImages.position));
  const fresh = images.map((img) => ({ id: `img_${rand()}`, workId, position: 1000, storagePath: img.path, thumbPath: img.thumbPath, widthPx: img.w, heightPx: img.h }));
  await db.insert(s.workImages).values(fresh);
  const ids = asMain ? [...fresh.map((f) => f.id), ...existing.map((e) => e.id)] : [...existing.map((e) => e.id), ...fresh.map((f) => f.id)];
  await setOrder(workId, ids);
}

export async function makeMainPhoto(workId: string, imageId: string) {
  const rows = await db.select({ id: s.workImages.id }).from(s.workImages).where(eq(s.workImages.workId, workId)).orderBy(asc(s.workImages.position));
  if (!rows.some((r) => r.id === imageId)) throw new Error("That photo isn't on this work");
  await setOrder(workId, [imageId, ...rows.map((r) => r.id).filter((id) => id !== imageId)]);
}

/** Removes a photo and its stored files. `keepOne` stops the last photo from being removed. */
export async function removePhoto(workId: string, imageId: string, keepOne: boolean) {
  const rows = await db.select().from(s.workImages).where(eq(s.workImages.workId, workId)).orderBy(asc(s.workImages.position));
  const target = rows.find((r) => r.id === imageId);
  if (!target) throw new Error("That photo isn't on this work");
  if (keepOne && rows.length <= 1) throw new Error("Upload a new photo first, then remove this one. Every work needs at least one.");
  await db.delete(s.workImages).where(eq(s.workImages.id, imageId));
  await setOrder(workId, rows.map((r) => r.id).filter((id) => id !== imageId));
  const paths = [target.storagePath, target.thumbPath].filter((p): p is string => !!p && p.startsWith(`works/${workId}/`));
  if (paths.length) await supabaseAdmin().storage.from(IMAGE_BUCKET).remove(paths).catch(() => undefined);
}

export async function worksByIds(ids: string[]) {
  return ids.length ? db.select().from(s.works).where(inArray(s.works.id, ids)) : [];
}
