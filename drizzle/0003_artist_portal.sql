CREATE TABLE "artist_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "artist_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artist_id" text NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"actor" text,
	"read_by_arrae_at" timestamp with time zone,
	"read_by_artist_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"work_id" text NOT NULL,
	"artist_id" text,
	"field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"actor" text,
	"actor_role" text DEFAULT 'arrae' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "open_for_submissions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "artist_messages" ADD CONSTRAINT "artist_messages_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_changes" ADD CONSTRAINT "work_changes_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_changes" ADD CONSTRAINT "work_changes_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_changes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "artist_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "shows" SET "open_for_submissions" = true WHERE "id" = 'volume-iv';
