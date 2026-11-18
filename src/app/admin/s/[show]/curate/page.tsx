import { notFound } from "next/navigation";
import { getSandbox, getSandboxLayout, getShows, getWallSetup } from "@/lib/queries";
import { requireOwner } from "@/lib/team";
import { SandboxBoard } from "../../../sandbox/[show]/SandboxBoard";

export const maxDuration = 60;

/** Step 3: the sandbox and walls. What's in the sandbox when you Finalize is the show. */
export default async function CurateStep({ params }: { params: Promise<{ show: string }> }) {
  await requireOwner();
  const { show } = await params;
  const [data, shows, walls, layout] = await Promise.all([getSandbox(show), getShows(), getWallSetup(), getSandboxLayout(show)]);
  if (!data) notFound();
  return (
    <SandboxBoard
      embedded
      show={{ id: data.show.id, name: data.show.name, type: data.show.type }}
      shows={shows.map((x) => ({ id: x.id, name: x.name, type: x.type }))}
      sandbox={data.sandbox}
      works={data.works}
      walls={walls}
      layout={layout}
      collectionArtists={data.collectionArtists}
    />
  );
}
