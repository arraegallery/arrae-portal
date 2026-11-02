-- Lock every table to the server. The app reads and writes through DATABASE_URL and the
-- service role key, which both bypass row level security; the public anon key gets nothing.
ALTER TABLE "activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "artists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "show_works" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "shows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "works" ENABLE ROW LEVEL SECURITY;
