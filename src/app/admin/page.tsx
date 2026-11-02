import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/team";

export default async function AdminHome() {
  const me = await requireTeam();
  redirect(me.role === "owner" ? "/admin/review/volume-iv" : "/admin/inbox");
}
