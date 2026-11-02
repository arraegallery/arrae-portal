import { notFound } from "next/navigation";
import { getArtistProfile } from "@/lib/queries";
import { ArtistProfile } from "./ArtistProfile";

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getArtistProfile(decodeURIComponent(id));
  if (!profile) notFound();
  return <ArtistProfile profile={profile} />;
}
