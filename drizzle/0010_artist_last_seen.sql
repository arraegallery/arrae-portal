ALTER TABLE "artists" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE "artists" a SET "last_seen_at" = u.last_sign_in_at
    FROM (SELECT lower(email) AS email, max(last_sign_in_at) AS last_sign_in_at FROM auth.users WHERE last_sign_in_at IS NOT NULL GROUP BY 1) u
    WHERE u.email = lower(trim(a."email"));
  END IF;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
