import { notFound, redirect } from "next/navigation";
import { getShowOverview } from "@/lib/show-stage";

/** Opening a show lands on the step it's on now. */
export default async function ShowHome({ params }: { params: Promise<{ show: string }> }) {
  const { show } = await params;
  const o = await getShowOverview(show);
  if (!o) notFound();
  redirect(`/admin/s/${show}/${o.current}`);
}
