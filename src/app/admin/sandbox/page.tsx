import { requireOwner } from "@/lib/team";
import { redirect } from "next/navigation";
import { defaultShow, getShows } from "@/lib/queries";

export default async function SandboxHome() {
  await requireOwner();
  const latest = defaultShow(await getShows(), "Volume");
  redirect(latest ? `/admin/sandbox/${latest.id}` : "/admin");
}
