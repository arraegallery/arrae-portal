import { notFound } from "next/navigation";
import { getBoard } from "@/lib/queries";
import { ReviewBoard } from "./ReviewBoard";

export default async function ReviewPage({ params }: { params: Promise<{ show: string }> }) {
  const { show } = await params;
  const board = await getBoard(show);
  if (!board) notFound();
  return <ReviewBoard show={{ id: board.show.id, name: board.show.name, type: board.show.type }} entries={board.entries} />;
}
