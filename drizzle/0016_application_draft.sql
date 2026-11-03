ALTER TABLE "applicant_signups" ADD COLUMN "form_draft" jsonb;--> statement-breakpoint
ALTER TABLE "applicant_signups" ADD COLUMN "draft_saved_at" timestamp with time zone;