import { requireOwner } from "@/lib/team";
import { getWaitlist } from "@/lib/queries";
import { WaitlistBoard } from "./WaitlistBoard";

export default async function WaitlistPage() {
  await requireOwner();
  const rows = await getWaitlist();
  return <WaitlistBoard rows={rows} />;
}
