import { notFound } from "next/navigation";
import { emailConfigured } from "@/lib/email";
import { requireOwner } from "@/lib/team";
import { getWelcomeData } from "@/lib/welcome-data";
import { NotifyBoard } from "../../../shows/[show]/notify/NotifyBoard";

export const maxDuration = 60;

/** Step 4: preview and send the welcome emails. The first send releases the decisions. */
export default async function NotifyStep({ params }: { params: Promise<{ show: string }> }) {
  const me = await requireOwner();
  const { show } = await params;
  const data = await getWelcomeData(show);
  if (!data) notFound();
  return <NotifyBoard {...data} me={me} configured={emailConfigured()} embedded />;
}
