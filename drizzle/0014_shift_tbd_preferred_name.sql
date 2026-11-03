ALTER TABLE "assistants" ADD COLUMN "preferred_name" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "time_tbd" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "max_hours" real;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "coordinate_with" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_event_id_gallery_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."gallery_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "shifts" SET "kind" = 'breakdown' WHERE "kind" = 'install' AND ("title" ILIKE '%break%down%' OR "title" ILIKE '%deinstall%');--> statement-breakpoint
UPDATE "shifts" SET "kind" = 'setup' WHERE "kind" = 'install' AND "title" ILIKE '%set%up%';
