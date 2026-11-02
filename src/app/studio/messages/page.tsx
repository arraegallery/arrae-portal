import { requireArtist } from "@/lib/artist-auth";
import { getStudio } from "@/lib/studio";
import { markStudioMessagesRead } from "../actions";
import { StudioThread } from "./StudioThread";

export default async function StudioMessagesPage() {
  const { artistIds } = await requireArtist();
  const { messages } = await getStudio(artistIds);
  await markStudioMessagesRead();
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24">
      <section className="py-6">
        <h1 className="font-display text-4xl">Messages</h1>
        <p className="mt-1 text-sm text-muted">Questions, updates and anything else about your work with ARRAE, all in one place. We'll email you when we reply.</p>
      </section>
      <StudioThread initial={messages} />
    </main>
  );
}
