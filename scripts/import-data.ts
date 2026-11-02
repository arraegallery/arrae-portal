/**
 * Load the cleaned Airtable export (arrae_clean.json, made by the migration script)
 * into the database. Safe to re-run: every row is upserted by its id, and decisions
 * already made in the app are never overwritten.
 *
 *   npm run import:airtable -- /path/to/arrae_clean.json
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../src/db/schema";

type Row = Record<string, any>;
const file = process.argv[2];
if (!file) throw new Error("Pass the path to arrae_clean.json");
const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, Row[]>;

const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const db = drizzle(client, { schema: s });

const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
const str = (v: unknown) => (v === "" || v === null || v === undefined ? null : String(v));
const chunk = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

await db
  .insert(s.shows)
  .values(data.shows.map((r) => ({ id: r.id, name: r.name, type: r.type })))
  .onConflictDoNothing();

for (const part of chunk(data.artists)) {
  await db
    .insert(s.artists)
    .values(
      part.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        phone: str(a.phone),
        website: str(a.website),
        social: str(a.social),
        education: str(a.education),
        bio: str(a.bio),
        arraeBio: str(a.arrae_bio),
        internalNotes: str(a.internal_notes),
        photoAttachmentId: str(a.photo_attachment),
        cvAttachmentId: str(a.cv_attachment),
        shopifyCollectionHandle: str(a.shopify_collection),
        airtableRecordIds: String(a.airtable_records).split(", ").filter(Boolean),
        onboarding: {
          agreement: !!a.onboarding_agreement,
          w9: !!a.onboarding_w9,
          dropoffScheduled: !!a.onboarding_dropoff_scheduled,
          dropoffDate: a.dropoff_date || "",
          meetGreet: !!a.meet_greet,
          coaRequested: !!a.coa_requested,
        },
      })),
    )
    .onConflictDoUpdate({
      target: s.artists.id,
      set: { name: sql`excluded.name`, email: sql`excluded.email`, bio: sql`excluded.bio`, website: sql`excluded.website` },
    });
}

for (const part of chunk(data.applications)) {
  await db
    .insert(s.applications)
    .values(
      part.map((a) => ({
        id: a.id,
        artistId: a.artist_id,
        showId: str(a.show_id),
        status: a.admin_status,
        submittedOn: str(a.submitted_at),
        flag: str(a.flag),
        airtableStatus: str(a.airtable_status),
        airtableRecordId: a.airtable_record,
        artistNotifiedAt: a.notified ? new Date(0) : null,
      })),
    )
    .onConflictDoNothing();
}

const artistIds = new Set(data.artists.map((a) => a.id));
for (const part of chunk(data.works)) {
  await db
    .insert(s.works)
    .values(
      part.map((w) => ({
        id: w.id,
        artistId: artistIds.has(w.artist_id) ? w.artist_id : null,
        title: w.title || "Untitled",
        year: str(w.year),
        category: str(w.category),
        medium: str(w.medium),
        description: str(w.description),
        priceUsd: w.price_usd === "" ? null : String(w.price_usd),
        sizeAsEntered: str(w.size_as_entered),
        width: num(w.width),
        height: num(w.height),
        depth: num(w.depth),
        unit: w.unit || "in",
        framed: !!w.framed,
        panels: Number(w.panels) || 1,
        shape: w.shape || "rect",
        sizeConfidence: str(w.size_confidence),
        processVideo: str(w.process_video),
        coaRequested: !!w.coa_requested,
        shopifyProductId: str(w.shopify_product_id),
        shopifyHandle: str(w.shopify_handle),
        soldAt: w.shopify_sold === true ? new Date(0) : null,
        duplicateOf: str(w.duplicate_of),
        submittedOn: str(w.submitted_at),
        airtableRecordId: w.airtable_record,
      })),
    )
    .onConflictDoNothing();
}

const images = data.works.flatMap((w) =>
  String(w.image_attachments || "")
    .split("; ")
    .filter(Boolean)
    .map((att, i) => {
      const [wpx, hpx] = i === 0 && w.image_px ? String(w.image_px).split("x").map(Number) : [null, null];
      return { id: att, workId: w.id, position: i, widthPx: wpx, heightPx: hpx };
    }),
);
for (const part of chunk(images)) await db.insert(s.workImages).values(part).onConflictDoNothing();

const showIds = new Set(data.shows.map((x) => x.id));
const sw = data.show_works.filter((x) => showIds.has(x.show_id));
for (const part of chunk(sw)) {
  await db
    .insert(s.showWorks)
    .values(part.map((x) => ({ showId: x.show_id, workId: x.work_id, status: x.status })))
    .onConflictDoNothing();
}

for (const part of chunk(data.waitlist)) {
  await db
    .insert(s.waitlist)
    .values(
      part.map((w) => ({
        artistId: w.artist_id,
        rank: Number(w.rank),
        fromShowId: data.shows.find((x) => x.name === w.waitlisted_from)?.id ?? null,
        since: str(w.since),
        note: str(w.note),
        worksWanted: str(w.works_held),
        carryForward: w.carry_forward !== "no",
      })),
    )
    .onConflictDoNothing();
}

const counts = await client`
  select (select count(*) from artists) artists, (select count(*) from applications) applications,
         (select count(*) from works) works, (select count(*) from work_images) images,
         (select count(*) from show_works) show_works, (select count(*) from waitlist) waitlist`;
console.log(counts[0]);
await client.end();
