CREATE TABLE "applicant_signups" (
	"email" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_link_at" timestamp with time zone,
	"terms_agreed_at" timestamp with time zone,
	"terms_version" text,
	"draft_id" text,
	"show_id" text,
	"artist_id" text,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "applicant_signups" ADD CONSTRAINT "applicant_signups_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicant_signups" ADD CONSTRAINT "applicant_signups_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "applicant_signups" ENABLE ROW LEVEL SECURITY;