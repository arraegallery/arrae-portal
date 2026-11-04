"use server";

import { revalidatePath } from "next/cache";
import { saveLayoutFor } from "@/lib/dashboard";
import { requireOwner } from "@/lib/team";

/** Saves which card goes in each dashboard slot, for the signed-in owner. */
export async function saveDashboardLayout(layout: (string | null)[]) {
  const email = await requireOwner();
  await saveLayoutFor(email, layout);
  revalidatePath("/admin");
}
