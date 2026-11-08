CREATE OR REPLACE FUNCTION ie_jsonb_sha256(doc jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT encode(sha256(convert_to(doc::text, 'UTF8')), 'hex')
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_concept_search_vector(
  title text,
  summary text,
  local_terms text[],
  body_md text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(array_to_string(local_terms, ' '), '')), 'A') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('simple'::regconfig, coalesce(body_md, '')), 'C')
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_raise(msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ie: %', msg USING ERRCODE = 'check_violation';
END;
$$;
