import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { IMAGE_BUCKET } from "./images";
import { supabaseAdmin } from "./supabase/server";
import { AGREEMENT_TITLE } from "./agreement-text";
import { DOC_KINDS, MAX_DOC_BYTES, type DocKind, type DocRow } from "./document-kinds";

/** Server-only helpers for the document center. Callers check who may see or change what. */

const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 14);
const safeName = (n: string) =>
  n
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(-80) || "file";

export async function createDocumentSlot(artistId: string, fileName: string, size: number) {
  if (size > MAX_DOC_BYTES) throw new Error("That file is over 25 MB. Please send a smaller copy.");
  const path = `documents/${artistId}/${rand()}-${safeName(fileName)}`;
  const { data, error } = await supabaseAdmin().storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(`Couldn't prepare the upload: ${error.message}`);
  return { path: data.path, token: data.token };
}

export async function saveDocument(input: {
  artistId: string;
  path: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  kind: string;
  title: string;
  showId?: string | null;
  note?: string | null;
  visibleToArtist: boolean;
  uploadedBy: string;
  role: "arrae" | "artist";
}) {
  if (!input.path.startsWith(`documents/${input.artistId}/`)) throw new Error("That upload doesn't belong to this artist");
  const kind = (DOC_KINDS.map(([k]) => k) as string[]).includes(input.kind) ? (input.kind as DocKind) : "other";
  const id = `doc_${rand()}`;
  const [row] = await db
    .insert(s.documents)
    .values({
      id,
      artistId: input.artistId,
      kind,
      title: input.title.trim().slice(0, 200) || input.fileName,
      storagePath: input.path,
      fileName: input.fileName.slice(0, 200),
      contentType: input.contentType?.slice(0, 120) ?? null,
      sizeBytes: input.sizeBytes,
      showId: input.showId || null,
      note: input.note?.trim().slice(0, 2000) || null,
      visibleToArtist: input.role === "artist" ? true : input.visibleToArtist,
      uploadedBy: input.uploadedBy,
      uploadedByRole: input.role,
    })
    .returning();
  return row;
}

export async function deleteDocumentRow(id: string) {
  const [row] = await db.delete(s.documents).where(eq(s.documents.id, id)).returning();
  if (row) await supabaseAdmin().storage.from(IMAGE_BUCKET).remove([row.storagePath]).catch(() => undefined);
  return row;
}

/**
 * Everything in an artist's document center, newest first: uploaded files plus signed agreements.
 * With `forArtist`, files ARRAE kept private are left out and only the artist's own uploads can be deleted.
 */
export async function listDocuments(artistIds: string[], opts: { forArtist: boolean }): Promise<DocRow[]> {
  if (!artistIds.length) return [];
  const [docs, agreements] = await Promise.all([
    db
      .select({ d: s.documents, show: s.shows.name })
      .from(s.documents)
      .leftJoin(s.shows, eq(s.shows.id, s.documents.showId))
      .where(and(inArray(s.documents.artistId, artistIds), opts.forArtist ? eq(s.documents.visibleToArtist, true) : undefined))
      .orderBy(desc(s.documents.createdAt)),
    db
      .select()
      .from(s.agreements)
      .where(and(inArray(s.agreements.artistId, artistIds), isNotNull(s.agreements.signedAt), isNull(s.agreements.voidedAt))),
  ]);
  const rows: DocRow[] = [
    ...docs.map(({ d, show }) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      fileName: d.fileName,
      sizeBytes: d.sizeBytes,
      at: d.createdAt.toISOString(),
      show,
      note: d.note,
      visibleToArtist: d.visibleToArtist,
      byArtist: d.uploadedByRole === "artist",
      href: `/api/documents/${d.id}`,
      canDelete: opts.forArtist ? d.uploadedByRole === "artist" : true,
    })),
    ...agreements.map((a) => ({
      id: a.id,
      kind: "contract",
      title: `${AGREEMENT_TITLE} (signed)`,
      fileName: "agreement.pdf",
      sizeBytes: null,
      at: a.signedAt!.toISOString(),
      show: null,
      note: `Signed as "${a.artistName}"`,
      visibleToArtist: true,
      byArtist: false,
      href: `/api/agreements/${a.id}`,
      canDelete: false,
    })),
  ];
  return rows.sort((x, y) => y.at.localeCompare(x.at));
}
