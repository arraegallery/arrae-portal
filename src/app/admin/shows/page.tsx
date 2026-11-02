import { getShowsAdmin } from "@/lib/queries";
import { ShowsManager } from "./ShowsManager";

export default async function ShowsPage() {
  return <ShowsManager shows={await getShowsAdmin()} />;
}
