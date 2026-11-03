CREATE TABLE "assistants" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"color" text DEFAULT 'violet' NOT NULL,
	"calendar_token" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hour_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_id" text,
	"email" text NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"minutes" integer NOT NULL,
	"note" text,
	"logged_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_confirmations" (
	"email" text NOT NULL,
	"month" text NOT NULL,
	"sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "schedule_confirmations_email_month_pk" PRIMARY KEY("email","month")
);
--> statement-breakpoint
CREATE TABLE "shift_swaps" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_id" text NOT NULL,
	"from_email" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"taken_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"kind" text DEFAULT 'standard' NOT NULL,
	"title" text,
	"assistant_email" text,
	"notes" text,
	"hours_reminder_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hour_logs" ADD CONSTRAINT "hour_logs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_assistant_email_assistants_email_fk" FOREIGN KEY ("assistant_email") REFERENCES "public"."assistants"("email") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shifts_date_idx" ON "shifts" ("date");--> statement-breakpoint
CREATE INDEX "hour_logs_email_date_idx" ON "hour_logs" ("email","date");--> statement-breakpoint
ALTER TABLE "assistants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shift_swaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hour_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "schedule_confirmations" ENABLE ROW LEVEL SECURITY;
