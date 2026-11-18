import { notFound } from "next/navigation";
import { emailConfigured } from "@/lib/email";
import { getShowTracker } from "@/lib/show-tracker";
import { requireOwner } from "@/lib/team";
import { WorksTracker } from "../../../shows/[show]/works/WorksTracker";

export const maxDuration = 60;

/** Step 5: the Show board. Every selected work with its icon: nothing yet, drop-off booked, dropped off. */
export default async function InstallStep({ params }: { params: Promise<{ show: string }> }) {
  await requireOwner();
  const { show } = await params;
  const data = await getShowTracker(show);
  if (!data) notFound();
  return <WorksTracker {...data} owner emailReady={emailConfigured()} embedded />;
}
