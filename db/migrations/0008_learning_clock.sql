ALTER TABLE "study_sessions" ADD COLUMN "learning_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "learning_budget_seconds" integer;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "learning_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD COLUMN "learning_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_learning_budget_ck" CHECK ("study_sessions"."learning_budget_seconds" IS NULL OR "study_sessions"."learning_budget_seconds" > 0);--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_learning_clock_ck" CHECK (("study_sessions"."learning_ends_at" IS NULL OR "study_sessions"."learning_started_at" IS NOT NULL) AND ("study_sessions"."learning_ended_at" IS NULL OR "study_sessions"."learning_ended_at" >= "study_sessions"."learning_started_at"));