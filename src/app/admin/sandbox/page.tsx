import { requireOwner } from "@/lib/team";
import { redirect } from "next/navigation";
import { getShows } from "@/lib/queries";

export default async function SandboxHome() {
  await requireOwner();
  const shows = await getShows();
  const latest = shows.filter((s) => s.type === "Volume").at(-1) ?? shows[0];
  redirect(latest ? `/admin/sandbox/${latest.id}` : "/admin");
}
