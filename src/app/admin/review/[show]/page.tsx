import { requireOwner } from "@/lib/team";
import { notFound } from "next/navigation";
import { getArtistList, getBoard, getSandboxWorkIds, getShows } from "@/lib/queries";
import { ReviewBoard } from "./ReviewBoard";

// Fail within a minute rather than spin for Vercel's five-minute ceiling.
export const maxDuration = 60;

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ show: string }>; searchParams: Promise<{ artist?: string; work?: string }> }) {
  await requireOwner();
  const { show } = await params;
  const { artist: focusArtist, work: focusWork } = await searchParams;
  const [board, sandboxIds, shows, artists] = await Promise.all([getBoard(show), getSandboxWorkIds(show), getShows(), getArtistList()]);
  if (!board) notFound();
  return <ReviewBoard show={{ id: board.show.id, name: board.show.name, type: board.show.type }} entries={board.entries} sandboxIds={sandboxIds}
      shows={shows.map((x) => ({ id: x.id, name: x.name }))}
      artists={artists}
      focusArtist={focusArtist}
      focusWork={focusWork}
    />;
}
