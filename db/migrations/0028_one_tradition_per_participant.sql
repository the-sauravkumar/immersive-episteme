ALTER TABLE "participants" ADD COLUMN "returning_from" uuid;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "tradition" text;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_returning_from_fk" FOREIGN KEY ("returning_from") REFERENCES "public"."participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
UPDATE "study_sessions" SET "tradition" = "tradition_order"->>0 WHERE jsonb_typeof("tradition_order") = 'array' AND jsonb_array_length("tradition_order") > 0;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_tradition_ck" CHECK ("study_sessions"."tradition" IS NULL OR "study_sessions"."tradition" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "study_sessions" DROP COLUMN "tradition_order";--> statement-breakpoint
ALTER TABLE "studies" DISABLE TRIGGER "studies_guard";--> statement-breakpoint
UPDATE "studies" SET "config" = jsonb_set("config", '{steps}', (SELECT coalesce(jsonb_agg(s ORDER BY n), '[]'::jsonb) FROM jsonb_array_elements("config"->'steps') WITH ORDINALITY AS e(s, n) WHERE s <> '"entrance"'::jsonb)) WHERE jsonb_typeof("config"->'steps') = 'array' AND "config"->'steps' @> '["entrance"]'::jsonb;--> statement-breakpoint
ALTER TABLE "studies" ENABLE TRIGGER "studies_guard";
