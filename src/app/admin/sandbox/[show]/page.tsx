import { notFound } from "next/navigation";
import { getSandbox, getShows } from "@/lib/queries";
import { SandboxBoard } from "./SandboxBoard";

export default async function SandboxPage({ params }: { params: Promise<{ show: string }> }) {
  const { show } = await params;
  const [data, shows] = await Promise.all([getSandbox(show), getShows()]);
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
