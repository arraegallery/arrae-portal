CREATE TABLE "email_opt_outs" (
	"email" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text
);
--> statement-breakpoint
ALTER TABLE "email_opt_outs" ENABLE ROW LEVEL SECURITY;
