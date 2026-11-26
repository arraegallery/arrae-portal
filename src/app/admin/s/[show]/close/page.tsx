import { notFound } from "next/navigation";
import { getShowClosing } from "@/lib/show-close";
import { requireOwner } from "@/lib/team";
import { CloseStep } from "./CloseStep";

export const maxDuration = 60;

/** Step 6: on view and closing. Sold works, and unsold works going back to their artists. */
export default async function ClosePage({ params }: { params: Promise<{ show: string }> }) {
  await requireOwner();
  const { show } = await params;
  const data = await getShowClosing(show);
  if (!data) notFound();
  return <CloseStep {...data} />;
}
