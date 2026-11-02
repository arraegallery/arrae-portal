import { notFound } from "next/navigation";
import { getArtistProfile } from "@/lib/queries";
import { markArtistMessagesRead } from "../../actions";
import { ArtistProfile } from "./ArtistProfile";
import { requireTeam } from "@/lib/team";
import { currentAgreement } from "@/lib/agreement";
import { listDocuments } from "@/lib/documents";

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireTeam();
  const { id } = await params;
  const profile = await getArtistProfile(decodeURIComponent(id));
  if (!profile) notFound();
  if (profile.messages.some((m) => m.sender === "artist" && !m.read)) await markArtistMessagesRead(profile.artist.id);
  const a = me.role === "owner" ? await currentAgreement([profile.artist.id]) : null;
  const agreement = a ? { id: a.id, sentAt: a.sentAt.toISOString(), signedAt: a.signedAt?.toISOString() ?? null, signedAs: a.artistName } : null;
  const documents = me.role === "owner" ? await listDocuments([profile.artist.id], { forArtist: false }) : null;
  return <ArtistProfile profile={profile} owner={me.role === "owner"} agreement={agreement} documents={documents} />;
}
