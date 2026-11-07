DELETE FROM "session_telemetry_rollups";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "exposure_ms";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "navigation_ms";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "unterminated";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "concepts_exposed";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "concepts_in_scope";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "relationships_followed";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "citation_opens";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "guidance_uses";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" DROP COLUMN "webgl_context_lost";--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" ADD COLUMN "stage_ms" double precision NOT NULL;--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" ADD COLUMN "stops_visited" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" ADD COLUMN "revisits" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" ADD COLUMN "back_steps" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" ADD COLUMN "sources_opened" integer NOT NULL;
