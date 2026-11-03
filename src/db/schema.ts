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
  /** Shown to artists in their portal, where they can submit or put works forward. */
  openForSubmissions: boolean("open_for_submissions").default(false).notNull(),
  /** Until this is on, artists see "Under review" instead of the decision. */
  decisionsReleased: boolean("decisions_released").default(false).notNull(),
  description: text("description"),
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
  onboarding: jsonb("onboarding").$type<Record<string, unknown>>().default({}).notNull(),
  shopifyCollectionHandle: text("shopify_collection_handle"),
  airtableRecordIds: text("airtable_record_ids").array().default([]).notNull(),
  /** When the artist last signed in or opened their studio (updated at most every 10 minutes). */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
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
  photosRequestedAt: timestamp("photos_requested_at", { withTimezone: true }),
  photosRequestNote: text("photos_request_note"),
  shopifyReviewedAt: timestamp("shopify_reviewed_at", { withTimezone: true }),
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
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedBy: text("received_by"),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    pickedUpBy: text("picked_up_by"),
  },
  (t) => [primaryKey({ columns: [t.showId, t.workId] })],
);

/**
 * A curator's private sandbox for a show: any work from anywhere, freely added, removed
 * and reordered. Nothing here is a decision; promoting a work makes it a Shortlist
 * ("possible choice") entry in show_works. Never shown to artists.
 */
export const sandboxItems = pgTable(
  "sandbox_items",
  {
    showId: text("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
    note: text("note"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
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

/** Every change to a work's details, old and new value, by ARRAE or the artist. */
export const workChanges = pgTable("work_changes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workId: text("work_id")
    .notNull()
    .references(() => works.id, { onDelete: "cascade" }),
  artistId: text("artist_id").references(() => artists.id, { onDelete: "set null" }),
  field: text("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  actor: text("actor"),
  actorRole: text("actor_role").notNull().default("arrae"), // arrae | artist
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** The conversation between ARRAE and one artist, visible to both. */
export const artistMessages = pgTable("artist_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id, { onDelete: "cascade" }),
  sender: text("sender").notNull(), // arrae | artist
  body: text("body").notNull(),
  actor: text("actor"),
  readByArraeAt: timestamp("read_by_arrae_at", { withTimezone: true }),
  readByArtistAt: timestamp("read_by_artist_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** ARRAE team members beyond the owners in ADMIN_EMAILS. Staff (interns) get messages and logistics only. */
export const teamMembers = pgTable("team_members", {
  email: text("email").primaryKey(),
  name: text("name"),
  role: text("role").notNull().default("staff"), // staff
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/** A range of days and hours when artists can book a drop-off or pick-up for a show. */
export const bookingWindows = pgTable("booking_windows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  showId: text("show_id")
    .notNull()
    .references(() => shows.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // dropoff | pickup
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  dayStart: text("day_start").notNull().default("11:00"), // HH:MM, gallery time
  dayEnd: text("day_end").notNull().default("17:00"),
  weekdays: text("weekdays").notNull().default("1,2,3,4,5,6"), // 0 = Sunday
  slotMinutes: integer("slot_minutes").notNull().default(30),
  capacity: integer("capacity").notNull().default(1),
  location: text("location"),
  note: text("note"),
  open: boolean("open").notNull().default(true),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bookings = pgTable("bookings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  windowId: integer("window_id")
    .notNull()
    .references(() => bookingWindows.id, { onDelete: "cascade" }),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  note: text("note"),
  bookedBy: text("booked_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});

/** Someone who started an application on /apply: email first, then terms, then the form. */
export const applicantSignups = pgTable("applicant_signups", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLinkAt: timestamp("last_link_at", { withTimezone: true }),
  termsAgreedAt: timestamp("terms_agreed_at", { withTimezone: true }),
  termsVersion: text("terms_version"),
  draftId: text("draft_id"),
  showId: text("show_id").references(() => shows.id, { onDelete: "set null" }),
  artistId: text("artist_id").references(() => artists.id, { onDelete: "set null" }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

/** Small key/value settings, such as the private calendar feed token. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Artist = typeof artists.$inferSelect;
export type Work = typeof works.$inferSelect;
export type Show = typeof shows.$inferSelect;
export type Application = typeof applications.$inferSelect;

/**
 * A Partnership Agreement sent to one artist and signed in the portal. The text is
 * frozen when it is sent, so later edits to the template never change a signed copy.
 */
export const agreements = pgTable("agreements", {
  id: text("id").primaryKey(),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  bodyHash: text("body_hash").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  sentBy: text("sent_by").notNull(),
  galleryName: text("gallery_name").notNull(),
  galleryTitle: text("gallery_title").notNull(),
  gallerySignature: text("gallery_signature"), // PNG data URL, or null for a typed signature
  artistName: text("artist_name"),
  artistSignature: text("artist_signature"), // PNG data URL
  artistEmail: text("artist_email"),
  artistIp: text("artist_ip"),
  artistUserAgent: text("artist_user_agent"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  pdfPath: text("pdf_path"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  remindersSent: integer("reminders_sent").default(0).notNull(),
  lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
});

/**
 * Files kept for one artist: invoices, payment statements, W-9s, certificates and so on.
 * ARRAE or the artist can upload. Signed agreements are listed alongside from the agreements table.
 */
export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  artistId: text("artist_id")
    .notNull()
    .references(() => artists.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // invoice | payment | w9 | coa | contract | other
  title: text("title").notNull(),
  storagePath: text("storage_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  showId: text("show_id").references(() => shows.id, { onDelete: "set null" }),
  note: text("note"),
  visibleToArtist: boolean("visible_to_artist").default(true).notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedByRole: text("uploaded_by_role").notNull(), // arrae | artist
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Gallery calendar entries ARRAE adds: openings, private events, installs, closures. Show runs come from `shows`. */
export const galleryEvents = pgTable("gallery_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("event"), // event | opening | install | private | closed | other
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"), // inclusive; null = one day
  startTime: text("start_time"), // HH:MM, gallery time
  endTime: text("end_time"),
  location: text("location"),
  notes: text("notes"),
  showId: text("show_id").references(() => shows.id, { onDelete: "set null" }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Gallery Assistants: the people who staff the gallery. Separate from the portal team
 * (team_members), because an assistant only ever sees the schedule, never artist data.
 */
export const assistants = pgTable("assistants", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  color: text("color").notNull().default("violet"),
  calendarToken: text("calendar_token").notNull(), // private .ics feed of their own shifts
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

/** One person's shift. assistant_email null = an open shift nobody has yet. Times are gallery time (Miami). */
export const shifts = pgTable("shifts", {
  id: text("id").primaryKey(),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(),
  kind: text("kind").notNull().default("standard"), // standard | opening | special | install | other
  title: text("title"),
  assistantEmail: text("assistant_email").references(() => assistants.email, { onDelete: "set null" }),
  notes: text("notes"),
  hoursReminderAt: timestamp("hours_reminder_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A request to hand a shift to someone else. The first teammate to accept takes it. */
export const shiftSwaps = pgTable("shift_swaps", {
  id: text("id").primaryKey(),
  shiftId: text("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  fromEmail: text("from_email").notNull(),
  note: text("note"),
  status: text("status").notNull().default("open"), // open | taken | cancelled
  takenBy: text("taken_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Hours actually worked, logged by the assistant after a shift (or added by an owner). */
export const hourLogs = pgTable("hour_logs", {
  id: text("id").primaryKey(),
  shiftId: text("shift_id").references(() => shifts.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  minutes: integer("minutes").notNull(),
  note: text("note"),
  loggedBy: text("logged_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** The monthly "here is your schedule, please confirm" email, one row per person per month. */
export const scheduleConfirmations = pgTable(
  "schedule_confirmations",
  {
    email: text("email").notNull(),
    month: text("month").notNull(), // YYYY-MM
    sentAt: timestamp("sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.email, t.month] })],
);
