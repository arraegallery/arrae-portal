CREATE TABLE "agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_by" text NOT NULL,
	"gallery_name" text NOT NULL,
	"gallery_title" text NOT NULL,
	"gallery_signature" text,
	"artist_name" text,
	"artist_signature" text,
	"artist_email" text,
	"artist_ip" text,
	"artist_user_agent" text,
	"signed_at" timestamp with time zone,
	"pdf_path" text,
	"voided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agreements" ENABLE ROW LEVEL SECURITY;