import { redirect } from "next/navigation";
import { requireTeam } from "@/lib/team";
import { MODULES, getDashboardData, getLayout } from "@/lib/dashboard";
import { Dashboard } from "./Dashboard";
import { ShowsNow } from "./ShowsNow";

export const metadata = { title: "Home · ARRAE" };

export default async function AdminHome() {
  const me = await requireTeam();
  if (me.role !== "owner") redirect("/admin/inbox");
  const [layout, data] = await Promise.all([getLayout(me.email), getDashboardData(me.email)]);
  return <Dashboard layout={layout} data={data} modules={MODULES.map((m) => ({ id: m.id, label: m.label, href: m.href }))} top={<ShowsNow />} />;
}
