ALTER TABLE "user_roles" ADD COLUMN "principal_investigator" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "user_roles" ur SET "principal_investigator" = EXISTS (SELECT 1 FROM "user_roles" x WHERE x."user_id" = ur."user_id" AND x."role" = 'principal_investigator');--> statement-breakpoint
DELETE FROM "user_roles" ur USING (
  SELECT "user_id", (array_agg("role" ORDER BY CASE "role"::text
    WHEN 'platform_admin' THEN 0 WHEN 'principal_investigator' THEN 1 WHEN 'researcher' THEN 2 WHEN 'study_facilitator' THEN 3
    WHEN 'research_analyst' THEN 4 WHEN 'curator' THEN 5 ELSE 6 END))[1] AS keep
  FROM "user_roles" GROUP BY "user_id"
) k WHERE ur."user_id" = k."user_id" AND ur."role" <> k.keep;--> statement-breakpoint
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_user_id_role_pk";--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "role" SET DATA TYPE text USING CASE "role"::text
  WHEN 'platform_admin' THEN 'platform_admin' WHEN 'curator' THEN 'curator' WHEN 'content_editor' THEN 'curator' ELSE 'researcher' END;--> statement-breakpoint
DROP TYPE "public"."staff_role";--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('platform_admin', 'researcher', 'curator');--> statement-breakpoint
ALTER TABLE "user_roles" ALTER COLUMN "role" SET DATA TYPE "public"."staff_role" USING "role"::"public"."staff_role";--> statement-breakpoint
UPDATE "user_roles" SET "principal_investigator" = false WHERE "role" <> 'researcher';--> statement-breakpoint
ALTER TABLE "user_roles" ADD PRIMARY KEY ("user_id");--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_principal_investigator_ck" CHECK (NOT "user_roles"."principal_investigator" OR "user_roles"."role" = 'researcher');
