CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"show_id" text,
	"note" text,
	"visible_to_artist" boolean DEFAULT true NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_by_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;