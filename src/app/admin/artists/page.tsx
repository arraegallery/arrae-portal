import { getArtistDirectory } from "@/lib/queries";
import { requireTeam } from "@/lib/team";
import { ArtistDirectory } from "./ArtistDirectory";

export default async function ArtistsPage() {
  const me = await requireTeam();
  const owner = me.role === "owner";
  const artists = await getArtistDirectory();
  // The team (staff) sees the roster: artists selected for a show at least once.
  return <ArtistDirectory artists={owner ? artists : artists.filter((a) => a.everSelected)} owner={owner} />;
}
