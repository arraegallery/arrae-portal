import { requireOwner } from "@/lib/team";
import { getShowsAdmin } from "@/lib/queries";
import { ShowsManager } from "./ShowsManager";

export default async function ShowsPage() {
  await requireOwner();
  return <ShowsManager shows={await getShowsAdmin()} />;
}
