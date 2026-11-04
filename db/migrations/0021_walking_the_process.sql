ALTER TYPE "public"."assessment_item_kind" ADD VALUE 'matching';--> statement-breakpoint
ALTER TYPE "public"."assessment_item_kind" ADD VALUE 'sketch';--> statement-breakpoint
ALTER TYPE "public"."assessment_kind" ADD VALUE 'sketch';--> statement-breakpoint
CREATE TABLE "delayed_test_schedule" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"study_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"returned_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"missed_at" timestamp with time zone,
	CONSTRAINT "delayed_test_window_ck" CHECK ("delayed_test_schedule"."opens_at" <= "delayed_test_schedule"."due_at" AND "delayed_test_schedule"."due_at" <= "delayed_test_schedule"."closes_at")
);
--> statement-breakpoint
CREATE TABLE "stage_visits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"tradition_key" text NOT NULL,
	"stage_key" text NOT NULL,
	"stage_number" smallint NOT NULL,
	"visit_index" integer NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"active_ms" integer,
	CONSTRAINT "stage_visits_order_uq" UNIQUE("session_id","visit_index"),
	CONSTRAINT "stage_visits_number_ck" CHECK ("stage_visits"."stage_number" > 0),
	CONSTRAINT "stage_visits_active_ck" CHECK ("stage_visits"."active_ms" IS NULL OR "stage_visits"."active_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "tradition_order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "delayed_test_schedule" ADD CONSTRAINT "delayed_test_schedule_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delayed_test_schedule" ADD CONSTRAINT "delayed_test_schedule_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delayed_test_schedule" ADD CONSTRAINT "delayed_test_schedule_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_visits" ADD CONSTRAINT "stage_visits_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delayed_test_study_idx" ON "delayed_test_schedule" USING btree ("study_id","due_at");--> statement-breakpoint
CREATE INDEX "stage_visits_stage_idx" ON "stage_visits" USING btree ("session_id","tradition_key","stage_key");