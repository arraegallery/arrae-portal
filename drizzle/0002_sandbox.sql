CREATE TABLE "sandbox_items" (
	"show_id" text NOT NULL,
	"work_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sandbox_items_show_id_work_id_pk" PRIMARY KEY("show_id","work_id")
);
--> statement-breakpoint
ALTER TABLE "sandbox_items" ADD CONSTRAINT "sandbox_items_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_items" ADD CONSTRAINT "sandbox_items_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sandbox_items" ENABLE ROW LEVEL SECURITY;
