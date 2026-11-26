ALTER TABLE "show_works" ADD COLUMN "damage_note" text;--> statement-breakpoint
ALTER TABLE "show_works" ADD COLUMN "damage_noted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "show_works" ADD COLUMN "damage_noted_by" text;