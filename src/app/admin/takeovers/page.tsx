import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/team";
import { defaultShow, getShows } from "@/lib/queries";

/** Shows → Takeovers: opens the current Takeover. Switch from the dropdown on the board. */
export default async function TakeoversHome() {
  await requireOwner();
  const show = defaultShow(await getShows(), "Takeover");
  redirect(show ? `/admin/review/${show.id}` : "/admin/shows");
}
