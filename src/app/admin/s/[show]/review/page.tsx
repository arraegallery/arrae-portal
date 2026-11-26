import { notFound } from "next/navigation";
import { getArtistList, getBoard, getSandboxWorkIds, getShows } from "@/lib/queries";
import { requireOwner } from "@/lib/team";
import { ReviewBoard } from "../../../review/[show]/ReviewBoard";

export const maxDuration = 60;

/** Step 2: everything submitted, one gallery. Per work: put it in the sandbox, or pass. */
export default async function ReviewStep({ params, searchParams }: { params: Promise<{ show: string }>; searchParams: Promise<{ artist?: string; work?: string }> }) {
  await requireOwner();
  const { show } = await params;
  const { artist, work } = await searchParams;
  const [board, sandboxIds, shows, artists] = await Promise.all([getBoard(show), getSandboxWorkIds(show), getShows(), getArtistList()]);
  if (!board) notFound();
  return (
    <ReviewBoard
      embedded
      show={{ id: board.show.id, name: board.show.name, type: board.show.type }}
      entries={board.entries}
      sandboxIds={sandboxIds}
      shows={shows.map((x) => ({ id: x.id, name: x.name }))}
      sameType={[]}
      artists={artists}
      focusArtist={artist}
      focusWork={work}
    />
  );
}
