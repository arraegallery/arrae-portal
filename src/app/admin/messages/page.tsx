import { getMessageRecipients } from "@/lib/queries";
import { emailConfigured } from "@/lib/email";
import { requireOwner } from "@/lib/team";
import { MessageComposer } from "./MessageComposer";

export const maxDuration = 60;

export default async function MessagesPage() {
  const me = await requireOwner();
  const data = await getMessageRecipients();
  return <MessageComposer {...data} me={me} configured={emailConfigured()} />;
}
