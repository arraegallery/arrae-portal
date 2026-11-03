-- The Team page and the schedule are one list of people: every active team member is a Gallery Assistant, and vice versa.
INSERT INTO "assistants" ("email", "name", "color", "calendar_token", "added_by")
SELECT t."email",
       COALESCE(NULLIF(trim(t."name"), ''), split_part(t."email", '@', 1)),
       (ARRAY['violet','sky','amber','emerald','rose','teal','orange','indigo','lime','fuchsia'])[1 + ((row_number() OVER (ORDER BY t."created_at") - 1 + (SELECT count(*) FROM "assistants")) % 10)::int],
       md5(random()::text || t."email"),
       t."added_by"
FROM "team_members" t
WHERE t."revoked_at" IS NULL
ON CONFLICT ("email") DO UPDATE SET "removed_at" = NULL;
--> statement-breakpoint
INSERT INTO "team_members" ("email", "name", "role", "added_by")
SELECT a."email", a."name", 'staff', a."added_by"
FROM "assistants" a
WHERE a."removed_at" IS NULL
ON CONFLICT ("email") DO UPDATE SET "revoked_at" = NULL, "name" = COALESCE("team_members"."name", EXCLUDED."name");
