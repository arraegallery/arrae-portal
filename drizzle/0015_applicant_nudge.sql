ALTER TABLE "applicant_signups" ADD COLUMN "nudged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applicant_signups" ADD COLUMN "nudge_count" integer DEFAULT 0 NOT NULL;