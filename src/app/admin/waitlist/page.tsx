import { getWaitlist } from "@/lib/queries";
import { WaitlistBoard } from "./WaitlistBoard";

export default async function WaitlistPage() {
  const rows = await getWaitlist();
  return <WaitlistBoard rows={rows} />;
}
