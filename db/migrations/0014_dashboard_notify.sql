-- 0014 research-dashboard change notifications (custom SQL, hand-written).
--
-- Push instead of poll (docs/research/design-process/modules/research-dashboard.md, "Push"):
-- every statement that changes a table the dashboard reads sends ONE notification per distinct
-- study on channel `ie_dashboard` (payload: the study id). Statement-level AFTER triggers with
-- transition tables, so a 100-row ingest INSERT costs one trigger call, not 100. Notifications
-- only: nothing is written. NOTIFY is transactional (delivered at commit, never for a rolled-back
-- transaction) and identical payloads within one transaction are delivered once.
-- Transition tables allow one event per trigger, hence one trigger per table and event.

CREATE OR REPLACE FUNCTION ie_dashboard_notify()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  sid uuid;
BEGIN
  IF TG_ARGV[0] = 'study' THEN
    FOR sid IN SELECT DISTINCT c.study_id FROM changed c WHERE c.study_id IS NOT NULL LOOP
      PERFORM pg_notify('ie_dashboard', sid::text);
    END LOOP;
  ELSE
    FOR sid IN SELECT DISTINCT ss.study_id FROM changed c JOIN study_sessions ss ON ss.id = c.session_id LOOP
      PERFORM pg_notify('ie_dashboard', sid::text);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER telemetry_events_dashboard_ins AFTER INSERT ON telemetry_events
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER telemetry_events_dashboard_del AFTER DELETE ON telemetry_events
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER telemetry_batches_dashboard_ins AFTER INSERT ON telemetry_batches
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER telemetry_batches_dashboard_upd AFTER UPDATE ON telemetry_batches
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER telemetry_quarantine_dashboard_ins AFTER INSERT ON telemetry_quarantine
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER telemetry_quarantine_dashboard_upd AFTER UPDATE ON telemetry_quarantine
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER sequence_gaps_dashboard_ins AFTER INSERT ON sequence_gaps
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER sequence_gaps_dashboard_upd AFTER UPDATE ON sequence_gaps
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER study_sessions_dashboard_ins AFTER INSERT ON study_sessions
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER study_sessions_dashboard_upd AFTER UPDATE ON study_sessions
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER participants_dashboard_ins AFTER INSERT ON participants
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER participants_dashboard_upd AFTER UPDATE ON participants
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER responses_dashboard_ins AFTER INSERT ON responses
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER responses_dashboard_del AFTER DELETE ON responses
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER derived_scores_dashboard_ins AFTER INSERT ON derived_scores
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER derived_scores_dashboard_del AFTER DELETE ON derived_scores
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER derived_metrics_dashboard_ins AFTER INSERT ON derived_metrics
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER derived_metrics_dashboard_upd AFTER UPDATE ON derived_metrics
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('study');
--> statement-breakpoint
CREATE TRIGGER concept_maps_dashboard_ins AFTER INSERT ON concept_maps
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
--> statement-breakpoint
CREATE TRIGGER concept_maps_dashboard_upd AFTER UPDATE ON concept_maps
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION ie_dashboard_notify('session');
