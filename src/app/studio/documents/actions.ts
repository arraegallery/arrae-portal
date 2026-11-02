"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireArtist } from "@/lib/artist-auth";
import { createDocumentSlot, deleteDocumentRow, listDocuments, saveDocument } from "@/lib/documents";
import { ARTIST_UPLOAD_KINDS, kindLabel } from "@/lib/document-kinds";
import { arraeRecipients, notifyEmail, portalUrl } from "@/lib/notify";

export async function prepareMyDocument(fileName: string, size: number) {
  const me = await requireArtist();
  return createDocumentSlot(me.artist.id, fileName, size);
}

/** An artist adds a file (a W-9, an invoice, a certificate). ARRAE gets an email. */
export async function addMyDocument(input: { path: string; fileName: string; contentType: string | null; sizeBytes: number | null; kind: string; title: string; note: string }) {
  const me = await requireArtist();
  const kind = ARTIST_UPLOAD_KINDS.includes(input.kind as never) ? input.kind : "other";
  const row = await saveDocument({ ...input, kind, artistId: me.artist.id, visibleToArtist: true, uploadedBy: me.email, role: "artist" });
  await db.insert(s.activity).values({ artistId: me.artist.id, kind: "note", body: `Artist uploaded ${kindLabel(kind).toLowerCase()} "${row.title}"`, actor: me.email });
  await notifyEmail(arraeRecipients(), {
    subject: `${me.artist.name} uploaded a ${kindLabel(kind)}`,
    heading: "New document from an artist",
    body: `${me.artist.name} uploaded "${row.title}" (${kindLabel(kind)}) to their documents.${input.note.trim() ? `\n\n${input.note.trim()}` : ""}`,
    buttonLabel: "Open their page",
    buttonUrl: portalUrl(`/admin/artists/${encodeURIComponent(me.artist.id)}#documents`),
  });
  revalidatePath("/studio/documents");
  revalidatePath(`/admin/artists/${me.artist.id}`);
  revalidatePath("/admin/documents");
  return listDocuments(me.artistIds, { forArtist: true });
}

/** Artists can remove only files they uploaded themselves. */
export async function removeMyDocument(id: string) {
  const me = await requireArtist();
  const [doc] = await db.select().from(s.documents).where(and(eq(s.documents.id, id), eq(s.documents.uploadedByRole, "artist")));
  if (!doc || !me.artistIds.includes(doc.artistId)) throw new Error("You can only remove files you uploaded");
  await deleteDocumentRow(id);
  revalidatePath("/studio/documents");
  revalidatePath(`/admin/artists/${doc.artistId}`);
  return listDocuments(me.artistIds, { forArtist: true });
}
