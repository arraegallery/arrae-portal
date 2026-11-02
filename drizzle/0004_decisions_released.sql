ALTER TABLE "shows" ADD COLUMN "decisions_released" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "shows" SET "decisions_released" = true WHERE "id" IN ('volume-i', 'volume-ii', 'volume-iii');
