"use client";

import { createClient } from "@supabase/supabase-js";
import type { UploadedPhoto, UploadSlot } from "./photos";

/** Shrinks a photo in the browser to a JPEG no wider or taller than `max` pixels. */
export async function shrink(file: File, max: number): Promise<{ blob: Blob; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't read that photo"))), "image/jpeg", 0.86));
  return { blob, w: bitmap.width, h: bitmap.height };
}

/** Uploads photos into signed slots: a 2400px copy and a 700px copy for grids. */
export async function uploadPhotos(files: File[], slots: UploadSlot[], onProgress?: (text: string) => void): Promise<UploadedPhoto[]> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const bucket = supabase.storage.from("artworks");
  const images: UploadedPhoto[] = [];
  for (let i = 0; i < files.length && i < slots.length; i++) {
    onProgress?.(`Uploading photo ${i + 1} of ${files.length}…`);
    const full = await shrink(files[i], 2400);
    const thumb = await shrink(files[i], 700);
    const a = await bucket.uploadToSignedUrl(slots[i].full.path, slots[i].full.token, full.blob, { contentType: "image/jpeg" });
    if (a.error) throw new Error(`Photo ${i + 1} didn't upload: ${a.error.message}`);
    const b = await bucket.uploadToSignedUrl(slots[i].thumb.path, slots[i].thumb.token, thumb.blob, { contentType: "image/jpeg" });
    images.push({ path: slots[i].full.path, thumbPath: b.error ? null : slots[i].thumb.path, w: full.w, h: full.h });
  }
  return images;
}
