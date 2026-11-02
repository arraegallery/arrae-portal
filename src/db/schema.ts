import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const showType = pgEnum("show_type", ["Volume", "Takeover", "ARRAE Finds"]);

export const applicationStatus = pgEnum("application_status", [
  "New",
  "In review",
  "Shortlist",
  "Waitlist",
  "Selected",
  "Request other works",
  "Not selected",
  "Withdrawn",
]);

export const workStatus = pgEnum("work_status", [
  "Submitted",
  "In review",
  "Shortlist",
  "Requested",
  "Selected",
  "Waitlist",
  "Not included",
  "Unavailable",
]);

export const shows = pgTable("shows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: showType("type").notNull(),
  opensOn: date("opens_on"),
  closesOn: date("closes_on"),
  applicationDeadline: date("application_deadline"),
  decisionsDueOn: date("decisions_due_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const artists = pgTable("artists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  website: text("website"),
  social: text("social"),
  education: text("education"),
  bio: text("bio"),
  arraeBio: text("arrae_bio"),
  internalNotes: text("internal_notes"),
  photoAttachmentId: text("photo_attachment_id"),
  photoPath: text("photo_path"),
  cvAttachmentId: text("cv_attachment_id"),
  cvPath: text("cv_path"),
  onboarding: jsonb("onboarding").$type<Record<string, boolean | string>>().default({}).notNull(),
  shopifyCollectionHandle: text("shopify_collection_handle"),
  airtableRecordIds: text("airtable_record_ids").array().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const applications = pgTable("applications", {
  id: text("id").primaryKey(),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id, { onDelete: "cascade" }),
  showId: text("show_id").references(() => shows.id),
  status: applicationStatus("status").notNull().default("New"),
  submittedOn: date("submitted_on"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  artistNotifiedAt: timestamp("artist_notified_at", { withTimezone: true }),
  flag: text("flag"),
  airtableStatus: text("airtable_status"),
  airtableRecordId: text("airtable_record_id"),
});

export const works = pgTable("works", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").references(() => artists.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  year: text("year"),
  category: text("category"),
  medium: text("medium"),
  description: text("description"),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
  sizeAsEntered: text("size_as_entered"),
  width: real("width"),
  height: real("height"),
  depth: real("depth"),
  unit: text("unit").default("in").notNull(),
  framed: boolean("framed").default(false).notNull(),
  panels: integer("panels").default(1).notNull(),
  shape: text("shape").default("rect").notNull(),
  sizeConfidence: text("size_confidence"),
  processVideo: text("process_video"),
  coaRequested: boolean("coa_requested").default(false).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  shopifyProductId: text("shopify_product_id"),
  shopifyHandle: text("shopify_handle"),
  soldAt: timestamp("sold_at", { withTimezone: true }),
  duplicateOf: text("duplicate_of"),
  submittedOn: date("submitted_on"),
  airtableRecordId: text("airtable_record_id"),
});

export const workImages = pgTable("work_images", {
  id: text("id").primaryKey(), // Airtable attachment id for imported images
  workId: text("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  position: integer("position").default(0).notNull(),
  storagePath: text("storage_path"), // full-size copy in Supabase Storage
  thumbPath: text("thumb_path"), // ~700px copy for grids
  widthPx: integer("width_px"),
  heightPx: integer("height_px"),
});

/** A work being considered for a show, with its own decision. */
export const showWorks = pgTable(
  "show_works",
  {
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    status: workStatus("status").notNull().default("Submitted"),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.showId, t.workId] })],
);

export const waitlist = pgTable("waitlist", {
  artistId: text("artist_id")
    .primaryKey()
    .references(() => artists.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  fromShowId: text("from_show_id").references(() => shows.id),
  since: date("since"),
  note: text("note"),
  worksWanted: text("works_wanted"),
  carryForward: boolean("carry_forward").default(true).notNull(),
  volumesWaited: integer("volumes_waited").default(1).notNull(),
});

/** Private curator notes and an audit trail of decisions. */
export const activity = pgTable("activity", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  artistId: text("artist_id").references(() => artists.id, { onDelete: "cascade" }),
  workId: text("work_id").references(() => works.id, { onDelete: "cascade" }),
  showId: text("show_id").references(() => shows.id),
  kind: text("kind").notNull(), // note | status | waitlist
  body: text("body").notNull(),
  actor: text("actor"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Artist = typeof artists.$inferSelect;
export type Work = typeof works.$inferSelect;
export type Show = typeof shows.$inferSelect;
export type Application = typeof applications.$inferSelect;
