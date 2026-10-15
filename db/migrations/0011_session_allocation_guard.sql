-- 0011 allocation after the pre-test (custom SQL, hand-written). Same conventions: "ie: " messages.
--
-- Study decision D3 (docs/research/study-decisions.md): participants are allocated AFTER the
-- condition-blind pre-test. The session therefore exists from consent with no condition and no
-- allocation (0010 makes both nullable, together), and the allocation is attached exactly once.
-- This replaces ie_study_sessions_guard (0005) with the same rules plus that single transition:
--  - INSERT: as before; a session may start unallocated;
--  - UPDATE: identity and version stamps stay immutable, EXCEPT condition_id/allocation_id going
--    from NULL to the participant's allocation of the same period (once). The content set and
--    task are then copied from the allocation, as on INSERT.
-- Telemetry events keep requiring a condition (telemetry_events.condition_id NOT NULL), so an
-- unallocated session cannot store telemetry; the study pages emit none before allocation.

CREATE OR REPLACE FUNCTION ie_study_sessions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  s studies%ROWTYPE;
  a allocations%ROWTYPE;
  m_compiler text;
  blocker text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.allocation_id IS NULL AND NEW.allocation_id IS NOT NULL THEN
      -- The one-time attachment of the allocation.
      SELECT * INTO a FROM allocations WHERE id = NEW.allocation_id;
      IF a.participant_id <> NEW.participant_id OR a.study_id <> NEW.study_id THEN
        PERFORM ie_raise('the allocation belongs to another participant or study');
      END IF;
      IF a.period <> NEW.period THEN
        PERFORM ie_raise('session period differs from its allocation period');
      END IF;
      IF NEW.condition_id IS DISTINCT FROM a.condition_id THEN
        PERFORM ie_raise('session condition must equal its allocation condition');
      END IF;
      NEW.content_set_code := a.content_set_code;
      NEW.task_code := a.task_code;
      IF NEW.study_id <> OLD.study_id OR NEW.participant_id <> OLD.participant_id
         OR NEW.period <> OLD.period
         OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
         OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id
         OR NEW.app_build <> OLD.app_build
         OR NEW.compiler_version IS DISTINCT FROM OLD.compiler_version
         OR OLD.content_set_code IS NOT NULL OR OLD.task_code IS NOT NULL THEN
        PERFORM ie_raise('session identity and version stamps are immutable');
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.study_id <> OLD.study_id OR NEW.participant_id <> OLD.participant_id
       OR NEW.condition_id IS DISTINCT FROM OLD.condition_id
       OR NEW.allocation_id IS DISTINCT FROM OLD.allocation_id
       OR NEW.period <> OLD.period
       OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
       OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id
       OR NEW.app_build <> OLD.app_build
       OR NEW.compiler_version IS DISTINCT FROM OLD.compiler_version
       OR NEW.content_set_code IS DISTINCT FROM OLD.content_set_code
       OR NEW.task_code IS DISTINCT FROM OLD.task_code THEN
      PERFORM ie_raise('session identity and version stamps are immutable');
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM studies WHERE id = NEW.study_id;
  IF s.status <> 'active' THEN
    PERFORM ie_raise('sessions can only be created in an active study');
  END IF;
  blocker := ie_participant_blocker(NEW.participant_id);
  IF blocker IS NOT NULL THEN
    PERFORM ie_raise(format('cannot open a session: %s', blocker));
  END IF;
  NEW.snapshot_id := coalesce(NEW.snapshot_id, s.snapshot_id);
  NEW.manifest_id := coalesce(NEW.manifest_id, s.manifest_id);
  IF NEW.snapshot_id IS DISTINCT FROM s.snapshot_id OR NEW.manifest_id IS DISTINCT FROM s.manifest_id THEN
    PERFORM ie_raise('session snapshot/manifest must equal the study snapshot/manifest');
  END IF;
  IF NEW.manifest_id IS NOT NULL THEN
    SELECT compiler_version INTO m_compiler FROM spatial_manifests WHERE id = NEW.manifest_id;
    NEW.compiler_version := coalesce(NEW.compiler_version, m_compiler);
    IF NEW.compiler_version IS DISTINCT FROM m_compiler THEN
      PERFORM ie_raise('session compiler version must equal the study manifest compiler version');
    END IF;
  END IF;
  IF NEW.allocation_id IS NOT NULL THEN
    SELECT * INTO a FROM allocations WHERE id = NEW.allocation_id;
    IF a.period <> NEW.period THEN
      PERFORM ie_raise('session period differs from its allocation period');
    END IF;
    NEW.content_set_code := coalesce(NEW.content_set_code, a.content_set_code);
    NEW.task_code := coalesce(NEW.task_code, a.task_code);
    IF NEW.content_set_code IS DISTINCT FROM a.content_set_code OR NEW.task_code IS DISTINCT FROM a.task_code THEN
      PERFORM ie_raise('session content set / task differ from its allocation');
    END IF;
  ELSIF NEW.content_set_code IS NOT NULL OR NEW.task_code IS NOT NULL THEN
    PERFORM ie_raise('an unallocated session has no content set or task yet');
  END IF;
  RETURN NEW;
END;
$$;
