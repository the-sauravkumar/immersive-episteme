-- 0009 learning clock (custom SQL, hand-written). Same conventions: "ie: " messages, 23514.
--
-- Lead requirement: both conditions get the same learning exposure by design. The learning
-- phase of a session is timed by the SERVER: study_sessions.learning_started_at is stamped once
-- (src/server/learning/context-data.ts, on the first learning-page request), the budget is copied
-- from the study's frozen config (exposure.mode = 'fixed_time' -> exposure.minutes * 60; NULL
-- for self-paced studies) and learning_ends_at = start + budget. All four learning columns are
-- set-once. These are protocol timestamps on the session, not learning outcomes: outcome tables
-- (responses, concept maps, derived_scores) never hold exposure or navigation time.

CREATE OR REPLACE FUNCTION ie_study_sessions_learning_clock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cfg jsonb;
  minutes numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.learning_started_at IS NOT NULL AND (
         NEW.learning_started_at IS DISTINCT FROM OLD.learning_started_at
      OR NEW.learning_budget_seconds IS DISTINCT FROM OLD.learning_budget_seconds
      OR NEW.learning_ends_at IS DISTINCT FROM OLD.learning_ends_at) THEN
      PERFORM ie_raise('the learning clock of a session is set once');
    END IF;
    IF OLD.learning_ended_at IS NOT NULL AND NEW.learning_ended_at IS DISTINCT FROM OLD.learning_ended_at THEN
      PERFORM ie_raise('the learning end of a session is set once');
    END IF;
    IF OLD.learning_started_at IS NOT NULL THEN
      IF NEW.learning_ended_at IS NOT NULL AND NEW.learning_ended_at < NEW.learning_started_at THEN
        PERFORM ie_raise('learning cannot end before it started');
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.learning_ended_at IS NOT NULL AND NEW.learning_started_at IS NULL THEN
    PERFORM ie_raise('learning cannot end before it started');
  END IF;

  IF NEW.learning_started_at IS NOT NULL THEN
    -- Budget always comes from the study config, whatever the caller sent.
    SELECT config INTO cfg FROM studies WHERE id = NEW.study_id;
    IF cfg #>> '{exposure,mode}' = 'fixed_time' THEN
      minutes := (cfg #>> '{exposure,minutes}')::numeric;
      IF minutes IS NULL OR minutes <= 0 THEN
        PERFORM ie_raise('a fixed_time study needs config.exposure.minutes > 0');
      END IF;
      NEW.learning_budget_seconds := (minutes * 60)::integer;
      NEW.learning_ends_at := NEW.learning_started_at + make_interval(secs => NEW.learning_budget_seconds);
    ELSE
      NEW.learning_budget_seconds := NULL;
      NEW.learning_ends_at := NULL;
    END IF;
  ELSE
    NEW.learning_budget_seconds := NULL;
    NEW.learning_ends_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER study_sessions_learning_clock BEFORE INSERT OR UPDATE ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION ie_study_sessions_learning_clock();
--> statement-breakpoint

-- Exposure, navigation, pause and citation timings are behavioural telemetry. They live in
-- telemetry_events and derived_metrics (src/features/telemetry/metrics.ts), never among the
-- learning-outcome scores.
ALTER TABLE derived_scores ADD CONSTRAINT derived_scores_no_timing_ck
  CHECK (metric_name !~ '^(time|timing|exposure|navigation|pause|citation)[._]');
