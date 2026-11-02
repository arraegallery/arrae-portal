import { getArtistDirectory } from "@/lib/queries";
import { ArtistDirectory } from "./ArtistDirectory";

export default async function ArtistsPage() {
  return <ArtistDirectory artists={await getArtistDirectory()} />;
}
