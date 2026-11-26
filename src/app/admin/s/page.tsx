import { getAllShowOverviews } from "@/lib/show-stage";
import { requireOwner } from "@/lib/team";
import { ShowsList } from "./ShowsList";
import { ShowsNow } from "../ShowsNow";

/** Every show, each opening its one page on the step it's on now. */
export default async function ShowsHome() {
  await requireOwner();
  const all = await getAllShowOverviews();
  const rows = all.map(({ show, facts, current, past }) => ({
    id: show.id,
    name: show.name,
    type: show.type,
    opensOn: show.opensOn,
    closesOn: show.closesOn,
    open: show.openForSubmissions,
    facts,
    current,
    past,
  }));
  return <ShowsList shows={rows} now={<ShowsNow />} />;
}
