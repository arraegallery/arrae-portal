ALTER TABLE "agreements" ADD COLUMN "reminders_sent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "last_reminded_at" timestamp with time zone;