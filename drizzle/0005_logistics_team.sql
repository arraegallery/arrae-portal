CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_windows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "booking_windows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"show_id" text NOT NULL,
	"kind" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"day_start" text DEFAULT '11:00' NOT NULL,
	"day_end" text DEFAULT '17:00' NOT NULL,
	"weekdays" text DEFAULT '1,2,3,4,5,6' NOT NULL,
	"slot_minutes" integer DEFAULT 30 NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"location" text,
	"note" text,
	"open" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bookings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"window_id" integer NOT NULL,
	"artist_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"note" text,
	"booked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "show_works" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "show_works" ADD COLUMN "received_by" text;--> statement-breakpoint
ALTER TABLE "show_works" ADD COLUMN "picked_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "show_works" ADD COLUMN "picked_up_by" text;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "photos_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "photos_request_note" text;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "shopify_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_windows" ADD CONSTRAINT "booking_windows_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_window_id_booking_windows_id_fk" FOREIGN KEY ("window_id") REFERENCES "public"."booking_windows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "bookings_window_idx" ON "bookings" ("window_id");--> statement-breakpoint
UPDATE "show_works" sw SET "received_at" = w."received_at" FROM "works" w WHERE w."id" = sw."work_id" AND w."received_at" IS NOT NULL;
