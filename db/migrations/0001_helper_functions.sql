-- 0001 helper functions (custom SQL, hand-written).
-- Must run before 0002 because generated columns in 0002 call these functions.
-- Generated (STORED) columns may only call IMMUTABLE functions. Both wrappers below are
-- deterministic for their argument types; they are declared IMMUTABLE explicitly because
-- some of the built-ins they use (array_to_string, jsonb -> text) are only STABLE in general.

-- sha256 (lowercase hex) of a jsonb value's canonical text. jsonb normalises key order and
-- whitespace, so equal documents always hash equally. Used for snapshot payloads, spatial
-- manifests, rule-set configs and parity reports.
CREATE OR REPLACE FUNCTION ie_jsonb_sha256(doc jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT encode(sha256(convert_to(doc::text, 'UTF8')), 'hex')
$$;--> statement-breakpoint

-- Weighted full-text vector for concepts: title (A), local terms (A), summary (B), body (C).
-- 'simple' configuration: the corpus mixes English with transliterated Indic craft terms
-- (dabu, gach, kalamkari), which English stemming would mangle.
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

-- Raises a check_violation with a stable, greppable message prefix ("ie:").
CREATE OR REPLACE FUNCTION ie_raise(msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ie: %', msg USING ERRCODE = 'check_violation';
END;
$$;
