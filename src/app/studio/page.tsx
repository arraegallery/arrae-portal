import { requireArtist } from "@/lib/artist-auth";
import { getStudio } from "@/lib/studio";
import { StudioHome } from "./StudioHome";

export default async function StudioPage() {
  const { artist, artistIds } = await requireArtist();
  const studio = await getStudio(artistIds);
  const unread = studio.messages.filter((m) => m.sender === "arrae" && !m.read).length;
  return <StudioHome name={artist.name} studio={studio} unread={unread} />;
}
