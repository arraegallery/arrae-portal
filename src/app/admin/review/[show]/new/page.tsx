import { requireOwner } from "@/lib/team";
import { notFound } from "next/navigation";
import { getBoard, getOtherApplications, getSandboxWorkIds } from "@/lib/queries";
import { NewApplicants } from "./NewApplicants";

export const maxDuration = 60;

/** First-time applicants to a show (never selected before), one at a time, sorted into lists. */
export default async function NewApplicantsPage({ params, searchParams }: { params: Promise<{ show: string }>; searchParams: Promise<{ list?: string; artist?: string }> }) {
  await requireOwner();
  const { show } = await params;
  const { list, artist } = await searchParams;
  const [board, sandboxIds] = await Promise.all([getBoard(show), getSandboxWorkIds(show)]);
  if (!board) notFound();
  const entries = board.entries.filter((e) => e.group === "New applicant" && e.application && e.application.status !== "Withdrawn");
  const before = await getOtherApplications(
    entries.map((e) => e.artist.id),
    show,
  );
  return (
    <NewApplicants
      show={{ id: board.show.id, name: board.show.name, type: board.show.type, open: board.show.openForSubmissions, deadline: board.show.applicationDeadline }}
      entries={entries}
      before={before}
      sandboxCount={sandboxIds.length}
      initialList={list}
      initialArtist={artist}
    />
  );
}
