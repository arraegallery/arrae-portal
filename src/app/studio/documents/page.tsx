import { requireArtist } from "@/lib/artist-auth";
import { listDocuments } from "@/lib/documents";
import { StudioDocuments } from "./StudioDocuments";

export default async function DocumentsPage() {
  const { artistIds } = await requireArtist();
  const docs = await listDocuments(artistIds, { forArtist: true });
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10">
      <h1 className="font-display text-4xl">Your documents</h1>
      <p className="mt-1 text-sm text-muted">
        Your signed agreement, invoices and payment statements from ARRAE live here. You can also upload your W-9, invoices or certificates of authenticity for us.
      </p>
      <div className="mt-6">
        <StudioDocuments initial={docs} />
      </div>
    </main>
  );
}
