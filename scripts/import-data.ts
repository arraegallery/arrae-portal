/**
 * Load the cleaned Airtable export (arrae_clean.json, made by the migration script)
 * into the database. Safe to re-run: every row is upserted by its id, and decisions
 * already made in the app are never overwritten.
 *
 *   npm run import:airtable -- /path/to/arrae_clean.json
 *
 * Talks to Supabase over HTTPS (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * so it works where a direct Postgres connection is not possible.
 */
import { readFileSync } from "node:fs";
import { chunk, supabase } from "./supabase-admin";

type Row = Record<string, any>;
const file = process.argv[2];
if (!file) throw new Error("Pass the path to arrae_clean.json");
const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, Row[]>;

const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const str = (v: unknown) => (v === "" || v === null || v === undefined ? null : String(v));
const EPOCH = new Date(0).toISOString();

async function insertNew(table: string, rows: Row[], onConflict = "id") {
  for (const part of chunk(rows)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

await insertNew("shows", data.shows.map((r) => ({ id: r.id, name: r.name, type: r.type })));

const artists = data.artists.map((a) => ({
  id: a.id,
  name: a.name,
  email: a.email,
  phone: str(a.phone),
  website: str(a.website),
  social: str(a.social),
  education: str(a.education),
  bio: str(a.bio),
  arrae_bio: str(a.arrae_bio),
  internal_notes: str(a.internal_notes),
  photo_attachment_id: str(a.photo_attachment),
  cv_attachment_id: str(a.cv_attachment),
  shopify_collection_handle: str(a.shopify_collection),
  airtable_record_ids: String(a.airtable_records).split(", ").filter(Boolean),
  onboarding: {
    agreement: !!a.onboarding_agreement,
    w9: !!a.onboarding_w9,
    dropoffScheduled: !!a.onboarding_dropoff_scheduled,
    dropoffDate: a.dropoff_date || "",
    meetGreet: !!a.meet_greet,
    coaRequested: !!a.coa_requested,
  },
}));
await insertNew("artists", artists);
// Existing artists: refresh only the contact details that may have changed in Airtable
for (const part of chunk(artists.map(({ id, name, email, bio, website }) => ({ id, name, email, bio, website })))) {
  const { error } = await supabase.from("artists").upsert(part, { onConflict: "id" });
  if (error) throw new Error(`artists: ${error.message}`);
}

await insertNew(
  "applications",
  data.applications.map((a) => ({
    id: a.id,
    artist_id: a.artist_id,
    show_id: str(a.show_id),
    status: a.admin_status,
    submitted_on: str(a.submitted_at),
    flag: str(a.flag),
    airtable_status: str(a.airtable_status),
    airtable_record_id: a.airtable_record,
    artist_notified_at: a.notified ? EPOCH : null,
  })),
);

const artistIds = new Set(data.artists.map((a) => a.id));
await insertNew(
  "works",
  data.works.map((w) => ({
    id: w.id,
    artist_id: artistIds.has(w.artist_id) ? w.artist_id : null,
    title: w.title || "Untitled",
    year: str(w.year),
    category: str(w.category),
    medium: str(w.medium),
    description: str(w.description),
    price_usd: w.price_usd === "" ? null : String(w.price_usd),
    size_as_entered: str(w.size_as_entered),
    width: num(w.width),
    height: num(w.height),
    depth: num(w.depth),
    unit: w.unit || "in",
    framed: !!w.framed,
    panels: Number(w.panels) || 1,
    shape: w.shape || "rect",
    size_confidence: str(w.size_confidence),
    process_video: str(w.process_video),
    coa_requested: !!w.coa_requested,
    shopify_product_id: str(w.shopify_product_id),
    shopify_handle: str(w.shopify_handle),
    sold_at: w.shopify_sold === true ? EPOCH : null,
    duplicate_of: str(w.duplicate_of),
    submitted_on: str(w.submitted_at),
    airtable_record_id: w.airtable_record,
  })),
);

await insertNew(
  "work_images",
  data.works.flatMap((w) =>
    String(w.image_attachments || "")
      .split("; ")
      .filter(Boolean)
      .map((att, i) => {
        const [wpx, hpx] = i === 0 && w.image_px ? String(w.image_px).split("x").map(Number) : [null, null];
        return { id: att, work_id: w.id, position: i, width_px: wpx, height_px: hpx };
      }),
  ),
);

const showIds = new Set(data.shows.map((x) => x.id));
await insertNew(
  "show_works",
  data.show_works.filter((x) => showIds.has(x.show_id)).map((x) => ({ show_id: x.show_id, work_id: x.work_id, status: x.status })),
  "show_id,work_id",
);

// One waitlist row per artist (the first one wins, as before)
const waitlist = new Map<string, Row>();
for (const w of data.waitlist) {
  if (waitlist.has(w.artist_id)) continue;
  waitlist.set(w.artist_id, {
    artist_id: w.artist_id,
    rank: Number(w.rank),
    from_show_id: data.shows.find((x) => x.name === w.waitlisted_from)?.id ?? null,
    since: str(w.since),
    note: str(w.note),
    works_wanted: str(w.works_held),
    carry_forward: w.carry_forward !== "no",
  });
}
await insertNew("waitlist", [...waitlist.values()], "artist_id");

const counts: Record<string, number | null> = {};
for (const t of ["artists", "applications", "works", "work_images", "show_works", "waitlist"]) {
  const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${t}: ${error.message}`);
  counts[t] = count;
}
console.log(counts);
