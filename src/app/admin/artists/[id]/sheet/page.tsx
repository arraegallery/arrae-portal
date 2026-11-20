import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/team";
import { getArtistSheet } from "@/lib/artist-sheet";
import { ProfileSheet } from "./ProfileSheet";

export const metadata = { title: "Artist profile" };

export default async function ArtistSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireTeam();
  const { id } = await params;
  const data = await getArtistSheet(decodeURIComponent(id));
  if (!data) notFound();
  return <ProfileSheet data={data} owner={me.role === "owner"} />;
}
