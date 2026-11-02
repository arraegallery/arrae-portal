import { getArtistDirectory } from "@/lib/queries";
import { requireTeam } from "@/lib/team";
import { ArtistDirectory } from "./ArtistDirectory";

export default async function ArtistsPage() {
  const me = await requireTeam();
  return <ArtistDirectory artists={await getArtistDirectory()} owner={me.role === "owner"} />;
}
