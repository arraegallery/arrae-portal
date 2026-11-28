"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { asResult } from "@/lib/action-result";
import { requireOwner } from "@/lib/team";
import {
  applyArtistShopify,
  createArtistCollection,
  createProducts,
  createShowCollection,
  linkArtistCollection,
  linkProduct,
  planArtistShopify,
  updateArtistCollection,
  updateProduct,
  type ArtistDiff,
  type WorkUpdate,
} from "@/lib/shopify/sync";

/** Ticks works as checked over and ready to go on Shopify. */
export async function setShopifyChecked(workIds: string[], checked: boolean) {
  await requireOwner();
  if (!workIds.length) return;
  await db
    .update(s.works)
    .set({ shopifyReviewedAt: checked ? new Date() : null })
    .where(inArray(s.works.id, workIds));
  revalidatePath("/admin/shopify", "layout");
}

// Everything below changes the LIVE Shopify store. Each one is a button Anai presses after
// reviewing what will be sent; nothing runs on its own.

export async function createCollectionAction(artistId: string, handle: string) {
  return asResult(async () => {
    const me = await requireOwner();
    const h = await createArtistCollection(artistId, handle, me);
    revalidatePath("/admin/shopify");
    return h;
  });
}

export async function linkCollectionAction(artistId: string, handle: string) {
  return asResult(async () => {
    const me = await requireOwner();
    await linkArtistCollection(artistId, handle, me);
    revalidatePath("/admin/shopify");
  });
}

export async function updateCollectionAction(artistId: string, fields: ArtistDiff[]) {
  return asResult(async () => {
    const me = await requireOwner();
    await updateArtistCollection(artistId, fields, me);
    revalidatePath("/admin/shopify");
  });
}

export async function createShowCollectionAction(showId: string) {
  return asResult(async () => {
    const me = await requireOwner();
    await createShowCollection(showId, me);
    revalidatePath("/admin/shopify");
  });
}

/** One small batch of products; the page calls this a few works at a time and shows progress. */
export async function createProductsAction(workIds: string[], showId: string) {
  return asResult(async () => {
    const me = await requireOwner();
    if (workIds.length > 5) throw new Error("Send at most 5 works at a time.");
    return createProducts(workIds, showId, me);
  });
}

export async function linkProductAction(workId: string, productId: string) {
  return asResult(async () => {
    const me = await requireOwner();
    await linkProduct(workId, productId, me);
    revalidatePath("/admin/shopify");
  });
}

export async function updateProductAction(workId: string, showId: string, fields: WorkUpdate[]) {
  return asResult(async () => {
    const me = await requireOwner();
    await updateProduct(workId, showId, fields, me);
  });
}

/** Artist page: what "Update Shopify" would change for this artist in this show (read only). */
export async function planArtistShopifyAction(artistId: string, showId: string) {
  return asResult(async () => {
    await requireOwner();
    return planArtistShopify(artistId, showId);
  });
}

/** Artist page: create / fix this artist's products for one show, after Anai has seen the plan. */
export async function applyArtistShopifyAction(artistId: string, showId: string) {
  return asResult(async () => {
    const me = await requireOwner();
    const res = await applyArtistShopify(artistId, showId, me);
    revalidatePath(`/admin/artists/${artistId}`);
    revalidatePath("/admin/shopify");
    return res;
  });
}
