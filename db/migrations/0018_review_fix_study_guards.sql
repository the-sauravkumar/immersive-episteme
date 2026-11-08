CREATE TABLE "study_enrolment_throttle" (
	"key_sha256" text PRIMARY KEY NOT NULL,
	"attempts" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "consent_records_one_decision_uq" ON "consent_records" USING btree ("participant_id") WHERE decision IN ('granted', 'declined');--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_consent_records_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.recorded_at := now();
  IF NEW.decision <> 'withdrawn' AND EXISTS (
    SELECT 1 FROM consent_records WHERE participant_id = NEW.participant_id AND decision = 'withdrawn'
  ) THEN
    PERFORM ie_raise('a consent decision cannot follow a withdrawal');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER consent_records_insert BEFORE INSERT ON consent_records
  FOR EACH ROW EXECUTE FUNCTION ie_consent_records_insert();--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_study_sessions_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.withdrawn AND NOT NEW.withdrawn THEN
    PERFORM ie_raise('a withdrawal is terminal (study_sessions.withdrawn cannot be cleared)');
  END IF;
  IF OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at THEN
    PERFORM ie_raise('study_sessions.withdrawn_at is set once');
  END IF;
  IF OLD.excluded AND NOT NEW.excluded THEN
    PERFORM ie_raise('an exclusion is terminal (study_sessions.excluded cannot be cleared)');
  END IF;
  IF OLD.status IN ('completed', 'abandoned') AND NEW.status <> OLD.status THEN
    PERFORM ie_raise(format('the session has ended (%s); its status cannot change', OLD.status));
  END IF;
  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    PERFORM ie_raise('study_sessions.completed_at is set once');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER study_sessions_terminal BEFORE UPDATE ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION ie_study_sessions_terminal();--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_participants_terminal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN
    PERFORM ie_raise('a withdrawal is terminal (participants.status cannot leave withdrawn)');
  END IF;
  IF OLD.status IN ('excluded', 'completed') AND NEW.status NOT IN (OLD.status, 'withdrawn') THEN
    PERFORM ie_raise(format('a %s participant can only withdraw', OLD.status));
  END IF;
  IF OLD.withdrawn_at IS NOT NULL AND NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at THEN
    PERFORM ie_raise('participants.withdrawn_at is set once');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER participants_terminal BEFORE UPDATE ON participants
  FOR EACH ROW EXECUTE FUNCTION ie_participants_terminal();--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_telemetry_events_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ss study_sessions%ROWTYPE;
  c_interface condition_interface;
  p_status participant_status;
  latest_decision consent_decision;
  snap_label text;
  ended_at timestamptz;
  e_scope event_scope;
  e_active boolean;
BEGIN
  SELECT * INTO ss FROM study_sessions WHERE id = NEW.session_id;
  SELECT interface INTO c_interface FROM study_conditions WHERE id = ss.condition_id;
  SELECT status INTO p_status FROM participants WHERE id = ss.participant_id;

  IF ss.withdrawn OR p_status = 'withdrawn' THEN
    PERFORM ie_raise('telemetry is not accepted for a withdrawn participant or session');
  END IF;
  SELECT cr.decision INTO latest_decision FROM consent_records cr
   WHERE cr.participant_id = ss.participant_id ORDER BY cr.recorded_at DESC, cr.id DESC LIMIT 1;
  IF latest_decision IS DISTINCT FROM 'granted' THEN
    PERFORM ie_raise(format('telemetry is not accepted: the latest consent decision is %s', coalesce(latest_decision::text, 'missing')));
  END IF;
  ended_at := coalesce(ss.completed_at, ss.last_activity_at);
  IF ss.status IN ('completed', 'abandoned') AND (ended_at IS NULL OR NEW.client_ts > ended_at) THEN
    PERFORM ie_raise(format('session is %s; events emitted after it ended are not accepted', ss.status));
  END IF;

  NEW.snapshot_id := coalesce(NEW.snapshot_id, ss.snapshot_id);
  IF NEW.snapshot_id IS DISTINCT FROM ss.snapshot_id THEN
    PERFORM ie_raise('telemetry event snapshot differs from its session snapshot');
  END IF;
  IF NEW.compiler_version IS NOT NULL AND NEW.compiler_version IS DISTINCT FROM ss.compiler_version THEN
    PERFORM ie_raise('telemetry event compiler version differs from its session');
  END IF;
  NEW.compiler_version := ss.compiler_version;

  SELECT version_label INTO snap_label FROM content_snapshots WHERE id = ss.snapshot_id;
  IF NEW.content_version IS DISTINCT FROM snap_label THEN
    PERFORM ie_raise(format('telemetry content version %s is not the session snapshot %s',
      NEW.content_version, coalesce(snap_label, '(none)')));
  END IF;
  IF NEW.concept_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM snapshot_items si
     WHERE si.snapshot_id = ss.snapshot_id AND si.item_kind = 'concept' AND si.entity_ref = NEW.concept_id::text
  ) THEN
    PERFORM ie_raise('telemetry concept is not part of the session snapshot');
  END IF;
  IF NEW.tradition_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM snapshot_items si
     WHERE si.snapshot_id = ss.snapshot_id AND si.item_kind = 'tradition' AND si.entity_ref = NEW.tradition_id::text
  ) THEN
    PERFORM ie_raise('telemetry tradition is not part of the session snapshot');
  END IF;

  SELECT scope, active INTO e_scope, e_active FROM event_types WHERE code = NEW.event_type_code;
  IF e_active IS FALSE THEN
    PERFORM ie_raise(format('event type %s is retired', NEW.event_type_code));
  END IF;
  IF e_scope IS NOT NULL AND e_scope <> 'both' AND c_interface IS NOT NULL
     AND e_scope::text <> c_interface::text THEN
    PERFORM ie_raise(format('event type %s (scope %s) cannot occur in a %s condition',
      NEW.event_type_code, e_scope, c_interface));
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_study_sessions_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    PERFORM ie_raise('study_sessions cannot be truncated');
  END IF;
  IF ie_setting('app.research_purge_reason') IS NULL THEN
    PERFORM ie_raise('study_sessions DELETE requires app.research_purge_reason');
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint

CREATE TRIGGER study_sessions_delete_guard BEFORE DELETE ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION ie_study_sessions_delete_guard();--> statement-breakpoint
CREATE TRIGGER study_sessions_no_truncate BEFORE TRUNCATE ON study_sessions
  FOR EACH STATEMENT EXECUTE FUNCTION ie_study_sessions_delete_guard();--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_locked_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_id uuid;
  locked boolean;
BEGIN
  IF TG_TABLE_NAME = 'assessment_items' THEN
    parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.assessment_id ELSE NEW.assessment_id END;
    SELECT status = 'locked' INTO locked FROM assessments WHERE id = parent_id FOR SHARE;
  ELSE
    parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.reference_map_id ELSE NEW.reference_map_id END;
    SELECT status = 'locked' INTO locked FROM reference_maps WHERE id = parent_id FOR SHARE;
  END IF;
  IF locked THEN
    PERFORM ie_raise(format('%s of a locked parent are immutable', TG_TABLE_NAME));
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
