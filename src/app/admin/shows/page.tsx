import { requireOwner } from "@/lib/team";
import { getShowsAdmin } from "@/lib/queries";
import { inviteUrl, listInvites } from "@/lib/apply-invites";
import { ShowsManager } from "./ShowsManager";

export default async function ShowsPage() {
  await requireOwner();
  const [shows, invites] = await Promise.all([getShowsAdmin(), listInvites()]);
  return <ShowsManager shows={shows} invites={invites.map((x) => ({ ...x, url: inviteUrl(x.token) }))} />;
}
