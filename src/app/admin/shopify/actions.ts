"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";

/** Ticks works as checked over and ready to go on Shopify. */
export async function setShopifyChecked(workIds: string[], checked: boolean) {
  await requireOwner();
  if (!workIds.length) return;
  await db
    .update(s.works)
    .set({ shopifyReviewedAt: checked ? new Date() : null })
    .where(inArray(s.works.id, workIds));
  revalidatePath("/admin/shopify");
}
