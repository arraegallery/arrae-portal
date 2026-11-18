import { notFound } from "next/navigation";
import { emailConfigured } from "@/lib/email";
import { getShowTracker } from "@/lib/show-tracker";
import { requireTeam } from "@/lib/team";
import { WorksTracker } from "./WorksTracker";

export const maxDuration = 60;

export default async function ShowWorksPage({ params }: { params: Promise<{ show: string }> }) {
  const me = await requireTeam();
  const { show } = await params;
  const data = await getShowTracker(show);
  if (!data) notFound();
  return <WorksTracker {...data} owner={me.role === "owner"} emailReady={emailConfigured()} />;
}
