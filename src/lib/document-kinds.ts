/** Kinds of files kept in the document center. Shared by the browser and the server. */
export const DOC_KINDS = [
  ["invoice", "Invoice"],
  ["payment", "Payment statement"],
  ["w9", "W-9"],
  ["coa", "Certificate of Authenticity"],
  ["contract", "Agreement or contract"],
  ["other", "Other"],
] as const;
export type DocKind = (typeof DOC_KINDS)[number][0];
export const ARTIST_UPLOAD_KINDS: DocKind[] = ["w9", "invoice", "coa", "other"];
export const kindLabel = (k: string) => DOC_KINDS.find(([v]) => v === k)?.[1] ?? "Other";
export const MAX_DOC_BYTES = 25 * 1024 * 1024;

export type DocRow = {
  id: string;
  kind: string;
  title: string;
  fileName: string;
  sizeBytes: number | null;
  at: string;
  show: string | null;
  note: string | null;
  visibleToArtist: boolean;
  byArtist: boolean;
  href: string;
  canDelete: boolean;
};

/** Uploads one file straight to storage into a signed slot from the server. */
export async function uploadDocumentFile(file: File, slot: { path: string; token: string }) {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const r = await supabase.storage.from("artworks").uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || "application/octet-stream" });
  if (r.error) throw new Error(`The file didn't upload: ${r.error.message}`);
}
