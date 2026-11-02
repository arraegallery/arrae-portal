/**
 * Copy artwork images from Airtable into Supabase Storage, so they stop depending on
 * Airtable's expiring links. Fetches fresh links through the Airtable API, then saves a
 * grid-size copy (about 700px) and a large copy (about 3000px) for each image.
 *
 *   npm run import:images                     # everything not yet copied
 *   npm run import:images -- --show volume-iv # one show first
 *
 * Needs DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AIRTABLE_TOKEN.
 */
import { createClient } from "@supabase/supabase-js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";

const BUCKET = "artworks";
const ARTWORKS_TABLE = "tblCv4un1MmJCzPIJ";
const IMAGE_FIELD = "fldER1u2cLWKFJ9Ku";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set`);
  return v;
};
const showArg = process.argv.indexOf("--show");
const onlyShow = showArg > -1 ? process.argv[showArg + 1] : null;

const client = postgres(env("DATABASE_URL"), { max: 2, prepare: false });
const db = drizzle(client, { schema: s });
const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const { data: buckets } = await supabase.storage.listBuckets();
if (!buckets?.some((b) => b.name === BUCKET)) await supabase.storage.createBucket(BUCKET, { public: false });

// Which images still need copying
let pending = await db
  .select({ id: s.workImages.id, workId: s.workImages.workId, record: s.works.airtableRecordId })
  .from(s.workImages)
  .innerJoin(s.works, eq(s.works.id, s.workImages.workId))
  .where(isNull(s.workImages.storagePath));
if (onlyShow) {
  const inShow = await db.select({ workId: s.showWorks.workId }).from(s.showWorks).where(eq(s.showWorks.showId, onlyShow));
  const ids = new Set(inShow.map((r) => r.workId));
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
        await db
          .update(s.workImages)
          .set({ storagePath: `${base}.jpg`, thumbPath: `${base}-thumb.jpg`, widthPx: att.width ?? null, heightPx: att.height ?? null })
          .where(and(eq(s.workImages.id, att.id), inArray(s.workImages.workId, [p.workId])));
        done++;
      } catch (e) {
        failed++;
        console.warn(`Could not copy ${att.id} (${p.workId}):`, (e as Error).message);
      }
    }
  }
  console.log(`${done} copied, ${failed} failed`);
}
await client.end();
