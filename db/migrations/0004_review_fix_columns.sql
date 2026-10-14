CREATE TABLE "concept_map_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"concept_map_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"nodes" jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"is_final" boolean NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_map_revisions_uq" UNIQUE("concept_map_id","revision"),
	CONSTRAINT "concept_map_revisions_revision_ck" CHECK ("concept_map_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "auth_sign_in_throttle" (
	"email_sha256" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "derived_scores" DROP CONSTRAINT "derived_scores_uq";--> statement-breakpoint
ALTER TABLE "release_manifests" ADD COLUMN "db_environment" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "content_set_code" text;--> statement-breakpoint
ALTER TABLE "allocations" ADD COLUMN "task_code" text;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "content_set_code" text;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "task_code" text;--> statement-breakpoint
ALTER TABLE "concept_map_revisions" ADD CONSTRAINT "concept_map_revisions_concept_map_id_concept_maps_id_fk" FOREIGN KEY ("concept_map_id") REFERENCES "public"."concept_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_scores" ADD CONSTRAINT "derived_scores_uq" UNIQUE NULLS NOT DISTINCT("session_id","assessment_id","concept_map_id","response_id","reference_map_id","rubric_id","metric_name","metric_version");--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_content_set_ck" CHECK ("allocations"."content_set_code" IS NULL OR "allocations"."content_set_code" ~ '^[a-z0-9][a-z0-9_.-]{0,63}$');--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_task_ck" CHECK ("allocations"."task_code" IS NULL OR "allocations"."task_code" ~ '^[a-z0-9][a-z0-9_.-]{0,63}$');