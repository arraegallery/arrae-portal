CREATE TABLE "gallery_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'event' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"start_time" text,
	"end_time" text,
	"location" text,
	"notes" text,
	"show_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gallery_events" ADD CONSTRAINT "gallery_events_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gallery_events" ENABLE ROW LEVEL SECURITY;