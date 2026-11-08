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
