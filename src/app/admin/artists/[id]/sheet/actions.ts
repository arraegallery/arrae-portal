"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { IMAGE_BUCKET, signedImageUrls } from "@/lib/images";
import { supabaseAdmin } from "@/lib/supabase/server";

const folder = (artistId: string) => `artists/headshots/${artistId}/`;

/** A signed slot to upload a new headshot for this artist. */
export async function prepareHeadshotUpload(artistId: string) {
  await requireOwner();
  const path = `${folder(artistId)}${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}.jpg`;
  const r = await supabaseAdmin().storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
  if (r.error || !r.data) throw new Error(`Couldn't prepare the upload: ${r.error?.message ?? "no slot"}`);
  return { path: r.data.path, token: r.data.token };
}

/** Saves an uploaded headshot as the artist's photo. Returns its link. */
export async function saveHeadshot(artistId: string, path: string) {
  const actor = await requireOwner();
  if (!path.startsWith(folder(artistId))) throw new Error("That photo doesn't belong to this artist");
  const [artist] = await db.select({ name: s.artists.name }).from(s.artists).where(eq(s.artists.id, artistId));
  if (!artist) throw new Error("Artist not found");
  await db.update(s.artists).set({ photoPath: path }).where(eq(s.artists.id, artistId));
  await db.insert(s.activity).values({ artistId, kind: "edit", body: "Changed the artist's headshot", actor });
  revalidatePath(`/admin/artists/${artistId}`);
  revalidatePath(`/admin/artists/${artistId}/sheet`);
  const [src] = await signedImageUrls([path]);
  return src;
}
