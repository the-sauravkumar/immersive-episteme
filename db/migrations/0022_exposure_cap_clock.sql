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
    SELECT config INTO cfg FROM studies WHERE id = NEW.study_id;
    minutes := (cfg #>> '{exposure,minutes}')::numeric;
    IF cfg #>> '{exposure,mode}' = 'fixed_time' AND (minutes IS NULL OR minutes <= 0) THEN
      PERFORM ie_raise('a fixed_time study needs config.exposure.minutes > 0');
    END IF;
    IF minutes IS NOT NULL AND minutes > 0 THEN
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
$$;
