ALTER TABLE "study_sessions" ALTER COLUMN "condition_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ALTER COLUMN "allocation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_allocated_ck" CHECK (("study_sessions"."condition_id" IS NULL) = ("study_sessions"."allocation_id" IS NULL));