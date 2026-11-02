/**
 * Copy artwork images from Airtable into Supabase Storage, so they stop depending on
 * Airtable's expiring links. Fetches fresh links through the Airtable API, then saves a
 * grid-size copy (about 700px) and a large copy (about 3000px) for each image.
 *
 *   npm run import:images                     # everything not yet copied
 *   npm run import:images -- --show volume-iv # one show first
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AIRTABLE_TOKEN.
 */
import { env, selectAll, supabase } from "./supabase-admin";

const BUCKET = "artworks";
const ARTWORKS_TABLE = "tblCv4un1MmJCzPIJ";
const IMAGE_FIELD = "fldER1u2cLWKFJ9Ku";

const showArg = process.argv.indexOf("--show");
const onlyShow = showArg > -1 ? process.argv[showArg + 1] : null;

const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) await supabase.storage.createBucket(BUCKET, { public: false });

// Which images still need copying
type Pending = { id: string; work_id: string; works: { airtable_record_id: string | null } };
let pending = (
  await selectAll<Pending>("work_images", "id, work_id, works!inner(airtable_record_id)", (q) => q.is("storage_path", null))
).map((p) => ({ id: p.id, workId: p.work_id, record: p.works.airtable_record_id }));
if (onlyShow) {
  const inShow = await selectAll<{ work_id: string }>("show_works", "work_id", (q) => q.eq("show_id", onlyShow));
  const ids = new Set(inShow.map((r) => r.work_id));
  pending = pending.filter((p) => ids.has(p.workId));
}
console.log(`${pending.length} images to copy`);
const wanted = new Map(pending.map((p) => [p.id, p]));
const records = [...new Set(pending.map((p) => p.record).filter((r): r is string => !!r))];

type Att = { id: string; url: string; width?: number; height?: number; type?: string; thumbnails?: { large?: { url: string }; full?: { url: string } } };

async function fetchRecords(ids: string[]) {
  // Airtable formula filter, 50 records per request
  const formula = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
  const url = `https://api.airtable.com/v0/${env("AIRTABLE_BASE_ID")}/${ARTWORKS_TABLE}?returnFieldsByFieldId=true&fields[]=${IMAGE_FIELD}&filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env("AIRTABLE_TOKEN")}` } });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return (await res.json()).records as { id: string; fields: Record<string, Att[]> }[];
}

async function copy(url: string, path: string, type = "image/jpeg") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: res.headers.get("content-type") ?? type, upsert: true });
  if (error) throw error;
}

let done = 0;
let failed = 0;
for (let i = 0; i < records.length; i += 50) {
  const batch = await fetchRecords(records.slice(i, i + 50));
  for (const rec of batch) {
    for (const att of rec.fields[IMAGE_FIELD] ?? []) {
      const p = wanted.get(att.id);
      if (!p) continue;
      try {
        const full = att.thumbnails?.full?.url ?? att.url;
        const thumb = att.thumbnails?.large?.url ?? full;
        const base = `works/${p.workId}/${att.id}`;
        await copy(full, `${base}.jpg`, att.type);
        await copy(thumb, `${base}-thumb.jpg`, att.type);
        const { error } = await supabase
          .from("work_images")
          .update({ storage_path: `${base}.jpg`, thumb_path: `${base}-thumb.jpg`, width_px: att.width ?? null, height_px: att.height ?? null })
          .eq("id", att.id)
          .eq("work_id", p.workId);
        if (error) throw error;
        done++;
      } catch (e) {
        failed++;
        console.warn(`Could not copy ${att.id} (${p.workId}):`, (e as Error).message);
      }
    }
  }
  console.log(`${done} copied, ${failed} failed`);
}
