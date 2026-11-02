"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { requireOwner } from "@/lib/team";
import { createDocumentSlot, deleteDocumentRow, listDocuments, saveDocument } from "@/lib/documents";
import { kindLabel } from "@/lib/document-kinds";
import { notifyNewMessage } from "@/lib/notify";

function refresh(artistId: string) {
  revalidatePath(`/admin/artists/${artistId}`);
  revalidatePath("/admin/documents");
  revalidatePath("/studio/documents");
}

export async function listArtistDocuments(artistId: string) {
  await requireOwner();
  return listDocuments([artistId], { forArtist: false });
}

export async function prepareArtistDocument(artistId: string, fileName: string, size: number) {
  await requireOwner();
  return createDocumentSlot(artistId, fileName, size);
}

/** Saves a file ARRAE uploaded for an artist. With `tell`, the artist gets a message (and email) about it. */
export async function addArtistDocument(input: {
  artistId: string;
  path: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  kind: string;
  title: string;
  showId: string | null;
  note: string;
  visibleToArtist: boolean;
  tell: boolean;
}) {
  const actor = await requireOwner();
  const row = await saveDocument({ ...input, uploadedBy: actor, role: "arrae" });
  await db.insert(s.activity).values({ artistId: input.artistId, kind: "note", body: `Added ${kindLabel(row.kind).toLowerCase()} "${row.title}" to documents`, actor });
  if (row.visibleToArtist && input.tell) {
    const [artist] = await db.select().from(s.artists).where(eq(s.artists.id, input.artistId));
    const body = `We added a document for you: ${row.title} (${kindLabel(row.kind)}). You'll find it under Documents in your studio.${input.note.trim() ? `\n\n${input.note.trim()}` : ""}`;
    await db.insert(s.artistMessages).values({ artistId: input.artistId, sender: "arrae", body, actor, readByArraeAt: new Date() });
    if (artist?.email) await notifyNewMessage({ to: artist.email, artistName: artist.name, preview: body });
  }
  refresh(input.artistId);
  return listDocuments([input.artistId], { forArtist: false });
}

export async function setDocumentVisible(id: string, visible: boolean) {
  await requireOwner();
  const [row] = await db.update(s.documents).set({ visibleToArtist: visible }).where(eq(s.documents.id, id)).returning();
  if (!row) throw new Error("That document no longer exists");
  refresh(row.artistId);
  return listDocuments([row.artistId], { forArtist: false });
}

export async function removeArtistDocument(id: string) {
  const actor = await requireOwner();
  const row = await deleteDocumentRow(id);
  if (!row) throw new Error("That document no longer exists");
  await db.insert(s.activity).values({ artistId: row.artistId, kind: "note", body: `Removed "${row.title}" from documents`, actor });
  refresh(row.artistId);
  return listDocuments([row.artistId], { forArtist: false });
}
