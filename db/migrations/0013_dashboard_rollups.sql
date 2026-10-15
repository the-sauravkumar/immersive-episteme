CREATE TABLE "session_telemetry_rollups" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"study_id" uuid NOT NULL,
	"metrics_version" text NOT NULL,
	"session_status" text NOT NULL,
	"last_seq" integer NOT NULL,
	"event_count" integer NOT NULL,
	"exposure_ms" double precision NOT NULL,
	"navigation_ms" double precision NOT NULL,
	"pause_ms" double precision NOT NULL,
	"unterminated" integer NOT NULL,
	"concepts_exposed" integer NOT NULL,
	"concepts_in_scope" integer NOT NULL,
	"relationships_followed" integer NOT NULL,
	"citation_opens" integer NOT NULL,
	"guidance_uses" integer NOT NULL,
	"webgl_context_lost" integer NOT NULL,
	"client_errors" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_telemetry_rollups_counts_ck" CHECK ("session_telemetry_rollups"."event_count" >= 0 AND "session_telemetry_rollups"."last_seq" >= -1)
);
--> statement-breakpoint
ALTER TABLE "session_telemetry_rollups" ADD CONSTRAINT "session_telemetry_rollups_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_telemetry_rollups_study_idx" ON "session_telemetry_rollups" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "telemetry_batches_duplicates_idx" ON "telemetry_batches" USING btree ("session_id") WHERE "telemetry_batches"."duplicate_count" > 0;--> statement-breakpoint
CREATE INDEX "telemetry_events_study_server_ts_idx" ON "telemetry_events" USING btree ("study_id","server_ts");