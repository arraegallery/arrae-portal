import { notFound } from "next/navigation";
import { getArtistProfile } from "@/lib/queries";
import { markArtistMessagesRead } from "../../actions";
import { ArtistProfile } from "./ArtistProfile";
import { requireTeam } from "@/lib/team";

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireTeam();
  const { id } = await params;
  const profile = await getArtistProfile(decodeURIComponent(id));
  if (!profile) notFound();
  if (profile.messages.some((m) => m.sender === "artist" && !m.read)) await markArtistMessagesRead(profile.artist.id);
  return <ArtistProfile profile={profile} owner={me.role === "owner"} />;
}
