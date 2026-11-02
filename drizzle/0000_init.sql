CREATE TYPE "public"."application_status" AS ENUM('New', 'In review', 'Shortlist', 'Waitlist', 'Selected', 'Request other works', 'Not selected', 'Withdrawn');--> statement-breakpoint
CREATE TYPE "public"."show_type" AS ENUM('Volume', 'Takeover', 'ARRAE Finds');--> statement-breakpoint
CREATE TYPE "public"."work_status" AS ENUM('Submitted', 'In review', 'Shortlist', 'Requested', 'Selected', 'Waitlist', 'Not included', 'Unavailable');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artist_id" text,
	"work_id" text,
	"show_id" text,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"actor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"show_id" text,
	"status" "application_status" DEFAULT 'New' NOT NULL,
	"submitted_on" date,
	"decided_at" timestamp with time zone,
	"artist_notified_at" timestamp with time zone,
	"flag" text,
	"airtable_status" text,
	"airtable_record_id" text
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"website" text,
	"social" text,
	"education" text,
	"bio" text,
	"arrae_bio" text,
	"internal_notes" text,
	"photo_attachment_id" text,
	"photo_path" text,
	"cv_attachment_id" text,
	"cv_path" text,
	"onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shopify_collection_handle" text,
	"airtable_record_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "show_works" (
	"show_id" text NOT NULL,
	"work_id" text NOT NULL,
	"status" "work_status" DEFAULT 'Submitted' NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "show_works_show_id_work_id_pk" PRIMARY KEY("show_id","work_id")
);
--> statement-breakpoint
CREATE TABLE "shows" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "show_type" NOT NULL,
	"opens_on" date,
	"closes_on" date,
	"application_deadline" date,
	"decisions_due_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"artist_id" text PRIMARY KEY NOT NULL,
	"rank" integer NOT NULL,
	"from_show_id" text,
	"since" date,
	"note" text,
	"works_wanted" text,
	"carry_forward" boolean DEFAULT true NOT NULL,
	"volumes_waited" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_images" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"storage_path" text,
	"thumb_path" text,
	"width_px" integer,
	"height_px" integer
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text,
	"title" text NOT NULL,
	"year" text,
	"category" text,
	"medium" text,
	"description" text,
	"price_usd" numeric(10, 2),
	"size_as_entered" text,
	"width" real,
	"height" real,
	"depth" real,
	"unit" text DEFAULT 'in' NOT NULL,
	"framed" boolean DEFAULT false NOT NULL,
	"panels" integer DEFAULT 1 NOT NULL,
	"shape" text DEFAULT 'rect' NOT NULL,
	"size_confidence" text,
	"process_video" text,
	"coa_requested" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone,
	"shopify_product_id" text,
	"shopify_handle" text,
	"sold_at" timestamp with time zone,
	"duplicate_of" text,
	"submitted_on" date,
	"airtable_record_id" text
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_works" ADD CONSTRAINT "show_works_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_works" ADD CONSTRAINT "show_works_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_from_show_id_shows_id_fk" FOREIGN KEY ("from_show_id") REFERENCES "public"."shows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_images" ADD CONSTRAINT "work_images_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;