import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/team";
import { defaultShow, getShows } from "@/lib/queries";

/** Shows → Reviews: opens the Volume taking submissions now. Switch shows from the dropdown on the board. */
export default async function ReviewsHome() {
  await requireOwner();
  const show = defaultShow(await getShows(), "Volume");
  redirect(show ? `/admin/review/${show.id}` : "/admin/shows");
}
