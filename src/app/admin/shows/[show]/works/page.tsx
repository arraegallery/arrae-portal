import { notFound, redirect } from "next/navigation";
import { emailConfigured } from "@/lib/email";
import { getShowTracker } from "@/lib/show-tracker";
import { requireTeam } from "@/lib/team";
import { WorksTracker } from "./WorksTracker";

export const maxDuration = 60;

export default async function ShowWorksPage({ params }: { params: Promise<{ show: string }> }) {
  const me = await requireTeam();
  const { show } = await params;
  // Owners use the show's own page (Install step); the team keeps this page for checking works in.
  if (me.role === "owner") redirect(`/admin/s/${show}/install`);
  const data = await getShowTracker(show);
  if (!data) notFound();
  return <WorksTracker {...data} owner={false} emailReady={emailConfigured()} />;
}
