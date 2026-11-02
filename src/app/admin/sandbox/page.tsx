import { redirect } from "next/navigation";
import { getShows } from "@/lib/queries";

export default async function SandboxHome() {
  const shows = await getShows();
  const latest = shows.filter((s) => s.type === "Volume").at(-1) ?? shows[0];
  redirect(latest ? `/admin/sandbox/${latest.id}` : "/admin");
}
