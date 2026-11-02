import { notFound } from "next/navigation";
import { getSandbox, getShows } from "@/lib/queries";
import { SandboxBoard } from "./SandboxBoard";

// The sandbox loads every work in the collection; give it room on Vercel.
export const maxDuration = 60;

export default async function SandboxPage({ params }: { params: Promise<{ show: string }> }) {
  const { show } = await params;
  const started = Date.now();
  const [data, shows] = await Promise.all([getSandbox(show), getShows()]);
  console.log(`sandbox ${show}: data ready in ${Date.now() - started}ms, ${data?.works.length ?? 0} works`);
  if (!data) notFound();
  return (
    <SandboxBoard
      show={{ id: data.show.id, name: data.show.name, type: data.show.type }}
      shows={shows.map((s) => ({ id: s.id, name: s.name, type: s.type }))}
      sandbox={data.sandbox}
      works={data.works}
    />
  );
}
