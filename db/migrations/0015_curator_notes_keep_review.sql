-- 0015 curator notes do not reopen review (custom SQL, hand-written). Same conventions as 0005.
--
-- `concepts.body` holds the curator notes (Tiptap JSON, CMS only). The snapshot builder drops it,
-- so learners never see it (src/server/cms/knowledge.ts). Before this migration, saving a note on
-- an accepted concept counted as an edit: ie_return_edited_to_review (0005) moved the concept back
-- to `under_review` and took its accepted relationships with it. That made curators re-verify
-- unchanged learner-facing content.
-- Now every learner-facing column still reopens review; `body` alone does not.

CREATE OR REPLACE FUNCTION ie_return_edited_to_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ie_is_accepted(OLD.verification_state) AND ie_is_accepted(NEW.verification_state)
     AND (to_jsonb(NEW) - 'verification_state' - 'updated_at' - 'updated_by' - 'search' - 'body')
         IS DISTINCT FROM
         (to_jsonb(OLD) - 'verification_state' - 'updated_at' - 'updated_by' - 'search' - 'body') THEN
    NEW.verification_state := 'under_review';
  END IF;
  RETURN NEW;
END;
$$;
