-- 0005 review-fix integrity triggers (custom SQL, hand-written). Closes gaps found in review of
-- 0003. Same conventions: violations raise SQLSTATE 23514 with an "ie: " message prefix.
--
-- New transaction-local setting:
--   app.research_purge_reason   must be non-empty to DELETE raw participant research data
--                               (responses, concept maps and their revisions, derived scores),
--                               e.g. after a consent withdrawal.
--
-- Sections:
--   1. helpers
--   2. TRUNCATE guards for snapshots, snapshot items and parity reports
--   3. knowledge: evidence edits and substantive edits send accepted content back to review;
--      every claim must be sourced; an edge is accepted only between accepted concepts
--   4. publishing: a snapshot is published only by UPDATE from draft, after its payload is
--      matched exactly against its items, every item is rechecked against its live entity,
--      item hashes are derived from the payload and item_count is recomputed
--   5. demo isolation for single-column knowledge references (assessments, reference maps,
--      participant concept maps, spatial index, overrides) and at study activation
--   6. studies: release manifests must be released (and frozen once a study uses them);
--      allocation and sessions require granted consent and a participant still taking part;
--      content set / task per period recorded on allocations and copied to sessions
--   7. telemetry: content version, compiler version, concept/tradition membership in the
--      session snapshot, withdrawn participants and ended sessions
--   8. raw participant data: responses and derived scores append-only, final concept maps
--      frozen, every concept-map save kept in concept_map_revisions
--   9. release manifests record the database server and extension versions

-- =========================================================================================
-- 1. Helpers
-- =========================================================================================

CREATE OR REPLACE FUNCTION ie_is_accepted(state verification_state)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT state IN ('verified', 'published')
$$;--> statement-breakpoint

-- The jsonb value when it is an array, else an empty array (payload walking).
CREATE OR REPLACE FUNCTION ie_jsonb_array(doc jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(doc) = 'array' THEN doc ELSE '[]'::jsonb END
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM ie_raise(format('%s cannot be truncated', TG_TABLE_NAME));
  RETURN NULL;
END;
$$;--> statement-breakpoint

-- =========================================================================================
-- 2. TRUNCATE guards
-- =========================================================================================

CREATE TRIGGER content_snapshots_no_truncate BEFORE TRUNCATE ON content_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION ie_no_truncate();--> statement-breakpoint
CREATE TRIGGER snapshot_items_no_truncate BEFORE TRUNCATE ON snapshot_items
  FOR EACH STATEMENT EXECUTE FUNCTION ie_no_truncate();--> statement-breakpoint
CREATE TRIGGER parity_reports_no_truncate BEFORE TRUNCATE ON parity_reports
  FOR EACH STATEMENT EXECUTE FUNCTION ie_no_truncate();--> statement-breakpoint

-- =========================================================================================
-- 3. Knowledge: accepted content stays backed by its evidence
-- =========================================================================================

-- Review history now also records state changes made by BEFORE triggers (an automatic return
-- to review). A column-specific `UPDATE OF verification_state` trigger does not fire for
-- those, so the three content tables get a plain AFTER INSERT OR UPDATE trigger; the function
-- itself still writes a row only when the state actually changed.
CREATE OR REPLACE FUNCTION ie_record_verification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.verification_state IS DISTINCT FROM NEW.verification_state THEN
    INSERT INTO verification_records (entity_kind, entity_id, from_state, to_state, actor_id, reason)
    VALUES (
      TG_ARGV[0]::verifiable_entity_kind,
      NEW.id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.verification_state END,
      NEW.verification_state,
      ie_setting('app.actor_id'),
      coalesce(
        ie_setting('app.change_reason'),
        CASE WHEN TG_OP = 'UPDATE' AND ie_is_accepted(OLD.verification_state)
                  AND NEW.verification_state = 'under_review'
             THEN 'returned to review automatically: accepted content or its evidence changed' END
      )
    );
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

DROP TRIGGER traditions_verification ON traditions;--> statement-breakpoint
DROP TRIGGER concepts_verification ON concepts;--> statement-breakpoint
DROP TRIGGER relationships_verification ON relationships;--> statement-breakpoint
CREATE TRIGGER traditions_verification AFTER INSERT OR UPDATE ON traditions
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('tradition');--> statement-breakpoint
CREATE TRIGGER concepts_verification AFTER INSERT OR UPDATE ON concepts
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('concept');--> statement-breakpoint
CREATE TRIGGER relationships_verification AFTER INSERT OR UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('relationship');--> statement-breakpoint

-- Editing a substantive column of an accepted row (the state staying accepted) sends it back
-- to `under_review`: acceptance covered the old text, not the new one. Bookkeeping columns
-- (state, audit stamps, generated search vector) do not count.
CREATE OR REPLACE FUNCTION ie_return_edited_to_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ie_is_accepted(OLD.verification_state) AND ie_is_accepted(NEW.verification_state)
     AND (to_jsonb(NEW) - 'verification_state' - 'updated_at' - 'updated_by' - 'search')
         IS DISTINCT FROM
         (to_jsonb(OLD) - 'verification_state' - 'updated_at' - 'updated_by' - 'search') THEN
    NEW.verification_state := 'under_review';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Runs before concepts_acceptance / relationships_rules (triggers fire in name order:
-- "a_..." sorts first), so an edited row is no longer "accepted" when those rules run.
CREATE TRIGGER a_traditions_return_to_review BEFORE UPDATE ON traditions
  FOR EACH ROW EXECUTE FUNCTION ie_return_edited_to_review();--> statement-breakpoint
CREATE TRIGGER a_concepts_return_to_review BEFORE UPDATE ON concepts
  FOR EACH ROW EXECUTE FUNCTION ie_return_edited_to_review();--> statement-breakpoint
CREATE TRIGGER a_relationships_return_to_review BEFORE UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION ie_return_edited_to_review();--> statement-breakpoint

-- Accepted concepts: real provenance, at least one claim, and EVERY claim sourced
-- (content/FORMAT.md: "No claim without a source").
CREATE OR REPLACE FUNCTION ie_concepts_acceptance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ie_is_accepted(NEW.verification_state) THEN
    IF NEW.provenance_kind = 'unverified' THEN
      PERFORM ie_raise(format('concept %s has provenance "unverified" and cannot be accepted', NEW.key));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM concept_claims cc WHERE cc.concept_id = NEW.id) THEN
      PERFORM ie_raise(format('concept %s needs at least one sourced claim before it can be accepted', NEW.key));
    END IF;
    IF EXISTS (
      SELECT 1 FROM concept_claims cc
       WHERE cc.concept_id = NEW.id
         AND NOT EXISTS (SELECT 1 FROM concept_claim_sources ccs WHERE ccs.claim_id = cc.id)
    ) THEN
      PERFORM ie_raise(format('every claim of concept %s needs a source before it can be accepted', NEW.key));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- A concept leaving the accepted states takes its accepted relationships back to review
-- (an accepted edge always joins two accepted concepts).
CREATE OR REPLACE FUNCTION ie_concepts_cascade_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE relationships
     SET verification_state = 'under_review'
   WHERE (source_concept_id = NEW.id OR target_concept_id = NEW.id)
     AND verification_state IN ('verified', 'published');
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER concepts_cascade_review AFTER UPDATE ON concepts
  FOR EACH ROW
  WHEN (OLD.verification_state IN ('verified', 'published')
        AND NEW.verification_state NOT IN ('verified', 'published'))
  EXECUTE FUNCTION ie_concepts_cascade_review();--> statement-breakpoint

-- Relationship rules (0003) plus: an accepted edge needs both endpoint concepts accepted.
CREATE OR REPLACE FUNCTION ie_relationships_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rt relationship_types%ROWTYPE;
BEGIN
  SELECT * INTO rt FROM relationship_types WHERE code = NEW.type_code;

  IF NEW.ordinal IS NOT NULL AND NOT rt.ordered THEN
    PERFORM ie_raise(format('relationship type %s does not take an ordinal', NEW.type_code));
  END IF;

  IF NOT rt.directed AND EXISTS (
    SELECT 1 FROM relationships r
     WHERE r.type_code = NEW.type_code
       AND r.source_concept_id = NEW.target_concept_id
       AND r.target_concept_id = NEW.source_concept_id
       AND r.id <> NEW.id
  ) THEN
    PERFORM ie_raise(format('undirected %s edge already exists in the reverse direction', NEW.type_code));
  END IF;

  IF NOT rt.allows_cycles AND (
    TG_OP = 'INSERT'
    OR OLD.source_concept_id <> NEW.source_concept_id
    OR OLD.target_concept_id <> NEW.target_concept_id
    OR OLD.type_code <> NEW.type_code
  ) THEN
    IF EXISTS (
      WITH RECURSIVE reach(node) AS (
        SELECT NEW.target_concept_id
        UNION
        SELECT r.target_concept_id
          FROM relationships r
          JOIN reach ON r.source_concept_id = reach.node
         WHERE r.type_code = NEW.type_code AND r.id <> NEW.id
      )
      SELECT 1 FROM reach WHERE node = NEW.source_concept_id
    ) THEN
      PERFORM ie_raise(format('relationship type %s must stay acyclic', NEW.type_code));
    END IF;
  END IF;

  IF ie_is_accepted(NEW.verification_state) THEN
    IF NEW.provenance_kind = 'unverified' THEN
      PERFORM ie_raise('a relationship with provenance "unverified" cannot be accepted');
    END IF;
    IF rt.requires_evidence AND NOT EXISTS (
      SELECT 1 FROM relationship_sources rs WHERE rs.relationship_id = NEW.id
    ) THEN
      PERFORM ie_raise(format('%s relationship needs a source before it can be accepted', NEW.type_code));
    END IF;
    IF EXISTS (
      SELECT 1 FROM concepts c
       WHERE c.id IN (NEW.source_concept_id, NEW.target_concept_id)
         AND NOT ie_is_accepted(c.verification_state)
    ) THEN
      PERFORM ie_raise(format('%s relationship can only be accepted between accepted concepts', NEW.type_code));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Evidence rows (claims, claim sources, relationship sources): any change while the parent is
-- accepted sends the parent back to review, which also appends a verification_records row.
CREATE OR REPLACE FUNCTION ie_evidence_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  concept_ids uuid[];
  relationship_ids uuid[];
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'concept_claims' THEN
    concept_ids := ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.concept_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.concept_id END
    ];
  ELSIF TG_TABLE_NAME = 'concept_claim_sources' THEN
    SELECT array_agg(cc.concept_id) INTO concept_ids
      FROM concept_claims cc
     WHERE cc.id IN (
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.claim_id END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.claim_id END
     );
  ELSE -- relationship_sources
    relationship_ids := ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.relationship_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.relationship_id END
    ];
  END IF;

  IF concept_ids IS NOT NULL THEN
    UPDATE concepts SET verification_state = 'under_review'
     WHERE id = ANY (concept_ids) AND verification_state IN ('verified', 'published');
  END IF;
  IF relationship_ids IS NOT NULL THEN
    UPDATE relationships SET verification_state = 'under_review'
     WHERE id = ANY (relationship_ids) AND verification_state IN ('verified', 'published');
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER concept_claims_evidence AFTER INSERT OR UPDATE OR DELETE ON concept_claims
  FOR EACH ROW EXECUTE FUNCTION ie_evidence_changed();--> statement-breakpoint
CREATE TRIGGER concept_claim_sources_evidence AFTER INSERT OR UPDATE OR DELETE ON concept_claim_sources
  FOR EACH ROW EXECUTE FUNCTION ie_evidence_changed();--> statement-breakpoint
CREATE TRIGGER relationship_sources_evidence AFTER INSERT OR UPDATE OR DELETE ON relationship_sources
  FOR EACH ROW EXECUTE FUNCTION ie_evidence_changed();--> statement-breakpoint

-- =========================================================================================
-- 4. Publishing: what is published is exactly what was checked
-- =========================================================================================

-- Every entity a knowledge bundle (src/features/knowledge/contracts.ts, v1) carries, with the
-- payload slice that describes it. Assets are the distinct concept assetIds.
CREATE OR REPLACE FUNCTION ie_snapshot_payload_entities(doc jsonb)
RETURNS TABLE (item_kind snapshot_item_kind, entity_ref text, entity_key text, slice jsonb)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'category'::snapshot_item_kind, e->>'code', e->>'code', e
    FROM jsonb_array_elements(ie_jsonb_array(doc->'categories')) e
  UNION ALL
  SELECT 'relationship_type'::snapshot_item_kind, e->>'code', e->>'code', e
    FROM jsonb_array_elements(ie_jsonb_array(doc->'relationshipTypes')) e
  UNION ALL
  SELECT 'tradition'::snapshot_item_kind, e->>'id', e->>'slug', e
    FROM jsonb_array_elements(ie_jsonb_array(doc->'traditions')) e
  UNION ALL
  SELECT 'source'::snapshot_item_kind, e->>'id', NULL, e
    FROM jsonb_array_elements(ie_jsonb_array(doc->'sources')) e
  UNION ALL
  SELECT 'concept'::snapshot_item_kind, e->>'id', e->>'key', e
    FROM jsonb_array_elements(ie_jsonb_array(doc->'concepts')) e
  UNION ALL
  SELECT 'claim'::snapshot_item_kind, cl->>'id', c->>'key', cl
    FROM jsonb_array_elements(ie_jsonb_array(doc->'concepts')) c,
         jsonb_array_elements(ie_jsonb_array(c->'claims')) cl
  UNION ALL
  SELECT 'relationship'::snapshot_item_kind, e->>'id', NULL, e
    FROM jsonb_array_elements(ie_jsonb_array(doc->'relationships')) e
  UNION ALL
  SELECT DISTINCT 'asset'::snapshot_item_kind, a #>> '{}', NULL::text, a
    FROM jsonb_array_elements(ie_jsonb_array(doc->'concepts')) c,
         jsonb_array_elements(ie_jsonb_array(c->'assetIds')) a
$$;--> statement-breakpoint

-- Publication check for a draft snapshot `snap` (called from the BEFORE UPDATE trigger, so
-- the stored row is still `draft` and its items may still be written):
--  * the payload header agrees with the row (label, demo flag, unverified flag);
--  * the payload lists no entity twice, and its entity set equals the snapshot_items set;
--  * a concept's payload key equals its live key;
--  * every item is rewritten with the sha256 of its payload slice, which re-runs
--    snapshot_items_guard per item: demo isolation and the verified-only rule are checked
--    against the LIVE entities at publication time, not only when the item was added.
CREATE OR REPLACE FUNCTION ie_check_snapshot_for_publish(snap content_snapshots)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  bad record;
BEGIN
  IF snap.payload->>'versionLabel' IS DISTINCT FROM snap.version_label
     OR snap.payload->'isDemo' IS DISTINCT FROM to_jsonb(snap.is_demo)
     OR snap.payload->'includesUnverified' IS DISTINCT FROM to_jsonb(snap.includes_unverified) THEN
    PERFORM ie_raise(format(
      'snapshot %s payload header (versionLabel, isDemo, includesUnverified) does not match the snapshot row',
      snap.version_label));
  END IF;

  SELECT p.item_kind, p.entity_ref INTO bad
    FROM ie_snapshot_payload_entities(snap.payload) p
   GROUP BY p.item_kind, p.entity_ref
  HAVING p.entity_ref IS NULL OR count(*) > 1
   LIMIT 1;
  IF FOUND THEN
    PERFORM ie_raise(format('snapshot %s payload lists %s %s without an id or more than once',
      snap.version_label, bad.item_kind, coalesce(bad.entity_ref, '(null)')));
  END IF;

  SELECT p.item_kind, p.entity_ref INTO bad
    FROM ie_snapshot_payload_entities(snap.payload) p
   WHERE NOT EXISTS (
     SELECT 1 FROM snapshot_items si
      WHERE si.snapshot_id = snap.id AND si.item_kind = p.item_kind AND si.entity_ref = p.entity_ref)
   LIMIT 1;
  IF FOUND THEN
    PERFORM ie_raise(format('snapshot %s payload contains %s %s, which is not a snapshot item',
      snap.version_label, bad.item_kind, bad.entity_ref));
  END IF;

  SELECT si.item_kind, si.entity_ref INTO bad
    FROM snapshot_items si
   WHERE si.snapshot_id = snap.id
     AND NOT EXISTS (
       SELECT 1 FROM ie_snapshot_payload_entities(snap.payload) p
        WHERE p.item_kind = si.item_kind AND p.entity_ref = si.entity_ref)
   LIMIT 1;
  IF FOUND THEN
    PERFORM ie_raise(format('snapshot %s item %s %s is not in the payload',
      snap.version_label, bad.item_kind, bad.entity_ref));
  END IF;

  SELECT p.entity_ref, p.entity_key INTO bad
    FROM ie_snapshot_payload_entities(snap.payload) p
    JOIN concepts c ON c.id::text = p.entity_ref
   WHERE p.item_kind = 'concept' AND p.entity_key IS DISTINCT FROM c.key
   LIMIT 1;
  IF FOUND THEN
    PERFORM ie_raise(format('snapshot %s payload concept %s has key %s, which is not its current key',
      snap.version_label, bad.entity_ref, coalesce(bad.entity_key, '(null)')));
  END IF;

  UPDATE snapshot_items si
     SET item_sha256 = ie_jsonb_sha256(p.slice)
    FROM ie_snapshot_payload_entities(snap.payload) p
   WHERE si.snapshot_id = snap.id
     AND si.item_kind = p.item_kind
     AND si.entity_ref = p.entity_ref;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_content_snapshots_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      PERFORM ie_raise(format('published snapshot %s cannot be deleted', OLD.version_label));
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      PERFORM ie_raise('insert the snapshot as draft, add its items, then publish it');
    END IF;
    NEW.item_count := 0;
    RETURN NEW;
  END IF;

  IF OLD.status = 'published' THEN
    PERFORM ie_raise(format('published snapshot %s is immutable', OLD.version_label));
  END IF;
  IF OLD.is_demo <> NEW.is_demo THEN
    PERFORM ie_raise('content_snapshots.is_demo cannot change');
  END IF;

  IF NEW.status = 'published' THEN
    NEW.published_at := coalesce(NEW.published_at, now());
    PERFORM ie_check_snapshot_for_publish(NEW);
    SELECT count(*) INTO NEW.item_count FROM snapshot_items WHERE snapshot_id = NEW.id;
  ELSE
    NEW.item_count := OLD.item_count;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- =========================================================================================
-- 5. Demo isolation for single-column references to knowledge rows
-- =========================================================================================

-- A non-demo owner (assessment, reference map, study, manifest, rule set) may never point at a
-- demo concept, relationship or snapshot, whatever table the pointer lives in.
CREATE OR REPLACE FUNCTION ie_demo_refs_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  owner_demo boolean;
  demo_concepts uuid[];
  demo_ref boolean := false;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'assessment_items' THEN
      SELECT is_demo INTO owner_demo FROM assessments WHERE id = NEW.assessment_id;
      demo_concepts := ARRAY[NEW.concept_id];
    WHEN 'reference_maps' THEN
      owner_demo := NEW.is_demo;
      SELECT is_demo INTO demo_ref FROM content_snapshots WHERE id = NEW.snapshot_id;
    WHEN 'reference_map_edges' THEN
      SELECT is_demo INTO owner_demo FROM reference_maps WHERE id = NEW.reference_map_id;
      demo_concepts := ARRAY[NEW.source_concept_id, NEW.target_concept_id];
    WHEN 'concept_map_edges' THEN
      SELECT st.is_demo INTO owner_demo
        FROM concept_maps cm
        JOIN study_sessions ss ON ss.id = cm.session_id
        JOIN studies st ON st.id = ss.study_id
       WHERE cm.id = NEW.concept_map_id;
      demo_concepts := ARRAY[NEW.source_concept_id, NEW.target_concept_id];
    WHEN 'spatial_elements' THEN
      SELECT is_demo INTO owner_demo FROM spatial_manifests WHERE id = NEW.manifest_id;
      demo_concepts := ARRAY[NEW.concept_id];
    WHEN 'spatial_element_encodings' THEN
      SELECT is_demo INTO owner_demo FROM spatial_manifests WHERE id = NEW.manifest_id;
      SELECT is_demo INTO demo_ref FROM relationships WHERE id = NEW.relationship_id;
    WHEN 'manual_overrides' THEN
      owner_demo := NEW.is_demo;
      demo_concepts := ARRAY[NEW.target_concept_id];
  END CASE;

  IF owner_demo IS NOT TRUE THEN
    IF coalesce(demo_ref, false) OR EXISTS (
      SELECT 1 FROM concepts c WHERE c.id = ANY (demo_concepts) AND c.is_demo
    ) THEN
      PERFORM ie_raise(format('%s of non-demo content cannot reference demo content', TG_TABLE_NAME));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER assessment_items_demo_refs BEFORE INSERT OR UPDATE ON assessment_items
  FOR EACH ROW EXECUTE FUNCTION ie_demo_refs_guard();--> statement-breakpoint
CREATE TRIGGER reference_maps_demo_refs BEFORE INSERT OR UPDATE ON reference_maps
  FOR EACH ROW EXECUTE FUNCTION ie_demo_refs_guard();--> statement-breakpoint
CREATE TRIGGER reference_map_edges_demo_refs BEFORE INSERT OR UPDATE ON reference_map_edges
  FOR EACH ROW EXECUTE FUNCTION ie_demo_refs_guard();--> statement-breakpoint
CREATE TRIGGER concept_map_edges_demo_refs BEFORE INSERT OR UPDATE ON concept_map_edges
  FOR EACH ROW EXECUTE FUNCTION ie_demo_refs_guard();--> statement-breakpoint
CREATE TRIGGER spatial_elements_demo_refs BEFORE INSERT OR UPDATE ON spatial_elements
  FOR EACH ROW EXECUTE FUNCTION ie_demo_refs_guard();--> statement-breakpoint
CREATE TRIGGER spatial_element_encodings_demo_refs BEFORE INSERT OR UPDATE ON spatial_element_encodings
  FOR EACH ROW EXECUTE FUNCTION ie_demo_refs_guard();--> statement-breakpoint
CREATE TRIGGER manual_overrides_demo_refs BEFORE INSERT OR UPDATE ON manual_overrides
  FOR EACH ROW EXECUTE FUNCTION ie_demo_refs_guard();--> statement-breakpoint

-- =========================================================================================
-- 6. Studies, releases, allocation, sessions
-- =========================================================================================

-- 0003 rules plus, at activation: a release manifest must be `released`; a non-demo study's
-- battery may not reach demo concepts through its items or reference maps, and every
-- snapshot-bound reference map of the battery must be bound to the study snapshot.
CREATE OR REPLACE FUNCTION ie_studies_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snap content_snapshots%ROWTYPE;
  man spatial_manifests%ROWTYPE;
  rel release_manifests%ROWTYPE;
  n_conditions integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      PERFORM ie_raise('only draft studies can be deleted');
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_demo <> NEW.is_demo THEN
      PERFORM ie_raise('studies.is_demo cannot change');
    END IF;
    IF OLD.status <> 'draft' THEN
      IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
        PERFORM ie_raise('a closed study cannot be reopened');
      END IF;
      IF NEW.status = 'draft' THEN
        PERFORM ie_raise('an active study cannot return to draft');
      END IF;
      IF NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
         OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id
         OR NEW.release_manifest_id IS DISTINCT FROM OLD.release_manifest_id
         OR NEW.design <> OLD.design
         OR NEW.config <> OLD.config
         OR NEW.protocol_version <> OLD.protocol_version
         OR NEW.allow_unverified_content <> OLD.allow_unverified_content THEN
        PERFORM ie_raise('the protocol of an active or closed study is frozen');
      END IF;
    END IF;
  END IF;

  IF NEW.snapshot_id IS NOT NULL THEN
    SELECT * INTO snap FROM content_snapshots WHERE id = NEW.snapshot_id;
    IF snap.is_demo AND NOT NEW.is_demo THEN
      PERFORM ie_raise('a non-demo study cannot use a demo content snapshot');
    END IF;
  END IF;
  IF NEW.manifest_id IS NOT NULL THEN
    SELECT * INTO man FROM spatial_manifests WHERE id = NEW.manifest_id;
    IF man.is_demo AND NOT NEW.is_demo THEN
      PERFORM ie_raise('a non-demo study cannot use a demo spatial manifest');
    END IF;
    IF man.snapshot_id IS DISTINCT FROM NEW.snapshot_id THEN
      PERFORM ie_raise('the study spatial manifest must be compiled from the study snapshot');
    END IF;
  END IF;
  IF NEW.release_manifest_id IS NOT NULL THEN
    SELECT * INTO rel FROM release_manifests WHERE id = NEW.release_manifest_id;
    IF rel.is_demo AND NOT NEW.is_demo THEN
      PERFORM ie_raise('a non-demo study cannot use a demo release manifest');
    END IF;
    IF rel.snapshot_id IS DISTINCT FROM NEW.snapshot_id
       OR rel.spatial_manifest_id IS DISTINCT FROM NEW.manifest_id THEN
      PERFORM ie_raise('the release manifest does not match the study snapshot/manifest');
    END IF;
  END IF;

  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    IF NEW.snapshot_id IS NULL OR snap.status <> 'published' THEN
      PERFORM ie_raise('a study can only be activated on a published content snapshot');
    END IF;
    IF NEW.manifest_id IS NOT NULL AND man.status <> 'published' THEN
      PERFORM ie_raise('a study can only be activated on a published spatial manifest');
    END IF;
    IF NEW.release_manifest_id IS NOT NULL AND rel.status <> 'released' THEN
      PERFORM ie_raise('a study can only be activated on a released release manifest');
    END IF;
    IF snap.includes_unverified AND NOT NEW.allow_unverified_content THEN
      PERFORM ie_raise('the snapshot includes unverified content; set allow_unverified_content explicitly');
    END IF;
    IF TG_OP = 'INSERT' THEN
      PERFORM ie_raise('insert the study as draft, add its conditions, then activate it');
    END IF;
    SELECT count(*) INTO n_conditions FROM study_conditions WHERE study_id = NEW.id;
    IF n_conditions < 2 THEN
      PERFORM ie_raise('a study needs at least two conditions before activation');
    END IF;
    IF EXISTS (
      SELECT 1 FROM study_conditions WHERE study_id = NEW.id AND interface = 'immersive_3d'
    ) AND NEW.manifest_id IS NULL THEN
      PERFORM ie_raise('a study with an immersive_3d condition needs a spatial manifest');
    END IF;
    IF NOT NEW.is_demo THEN
      IF EXISTS (
        SELECT 1 FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id
         WHERE sa.study_id = NEW.id AND a.status <> 'locked'
      ) THEN
        PERFORM ie_raise('all assessments of a non-demo study must be locked before activation');
      END IF;
      IF EXISTS (
        SELECT 1 FROM study_assessments sa
          JOIN assessment_items ai ON ai.assessment_id = sa.assessment_id
          JOIN concepts c ON c.id = ai.concept_id
         WHERE sa.study_id = NEW.id AND c.is_demo
      ) OR EXISTS (
        SELECT 1 FROM study_assessments sa
          JOIN reference_maps rm ON rm.assessment_id = sa.assessment_id
          JOIN reference_map_edges e ON e.reference_map_id = rm.id
          JOIN concepts c ON c.id IN (e.source_concept_id, e.target_concept_id)
         WHERE sa.study_id = NEW.id AND c.is_demo
      ) THEN
        PERFORM ie_raise('the assessment battery of a non-demo study references demo concepts');
      END IF;
      IF EXISTS (
        SELECT 1 FROM study_assessments sa
          JOIN reference_maps rm ON rm.assessment_id = sa.assessment_id
         WHERE sa.study_id = NEW.id
           AND rm.snapshot_id IS NOT NULL
           AND rm.snapshot_id <> NEW.snapshot_id
      ) THEN
        PERFORM ie_raise('every reference map of the battery must be bound to the study snapshot');
      END IF;
    END IF;
    NEW.activated_at := coalesce(NEW.activated_at, now());
  END IF;
  IF NEW.status = 'closed' THEN
    NEW.closed_at := coalesce(NEW.closed_at, now());
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Releases: once released, only the transition to `withdrawn` is allowed (0003). In addition,
-- a release referenced by an active or closed study keeps its snapshot, spatial manifest,
-- build and recorded environment even while still a candidate.
CREATE OR REPLACE FUNCTION ie_release_manifests_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'candidate' THEN
      PERFORM ie_raise('a released or withdrawn release manifest cannot be deleted');
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'withdrawn' THEN
    PERFORM ie_raise('withdrawn release manifests are immutable');
  END IF;
  IF OLD.status = 'released' AND (
    NEW.status <> 'withdrawn'
    OR (to_jsonb(NEW) - 'status' - 'notes') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'notes')
  ) THEN
    PERFORM ie_raise('a released release manifest can only be withdrawn');
  END IF;
  IF (NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
      OR NEW.spatial_manifest_id IS DISTINCT FROM OLD.spatial_manifest_id
      OR NEW.app_build IS DISTINCT FROM OLD.app_build
      OR NEW.db_environment IS DISTINCT FROM OLD.db_environment)
     AND EXISTS (SELECT 1 FROM studies s WHERE s.release_manifest_id = OLD.id AND s.status <> 'draft') THEN
    PERFORM ie_raise('the release manifest of an active or closed study is frozen');
  END IF;
  IF NEW.status = 'released' AND OLD.status = 'candidate' THEN
    NEW.released_at := coalesce(NEW.released_at, now());
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Is the participant allowed to take part now? Latest consent decision must be `granted`, and
-- the participant must not be withdrawn or excluded. Returns the reason when not, else NULL.
CREATE OR REPLACE FUNCTION ie_participant_blocker(participant uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  p_status participant_status;
  decision consent_decision;
BEGIN
  SELECT status INTO p_status FROM participants WHERE id = participant;
  IF p_status IN ('withdrawn', 'excluded') THEN
    RETURN format('participant is %s', p_status);
  END IF;
  SELECT cr.decision INTO decision
    FROM consent_records cr
   WHERE cr.participant_id = participant
   ORDER BY cr.recorded_at DESC, cr.id DESC
   LIMIT 1;
  IF decision IS NULL THEN
    RETURN 'participant has no consent record';
  END IF;
  IF decision <> 'granted' THEN
    RETURN format('participant consent is %s', decision);
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

-- Allocation: active study, matching protocol version (0003), granted consent and a
-- participant still taking part; a within-subjects allocation names its content set, and a
-- declared `config.contentSets` restricts the codes.
CREATE OR REPLACE FUNCTION ie_allocations_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  s studies%ROWTYPE;
  blocker text;
BEGIN
  SELECT * INTO s FROM studies WHERE id = NEW.study_id;
  IF s.status <> 'active' THEN
    PERFORM ie_raise('participants can only be allocated in an active study');
  END IF;
  IF NEW.study_protocol_version <> s.protocol_version THEN
    PERFORM ie_raise('allocation protocol version does not match the study');
  END IF;
  blocker := ie_participant_blocker(NEW.participant_id);
  IF blocker IS NOT NULL THEN
    PERFORM ie_raise(format('cannot allocate: %s', blocker));
  END IF;
  IF s.design = 'within' AND NEW.content_set_code IS NULL THEN
    PERFORM ie_raise('a within-subjects allocation must record its content set (content_set_code)');
  END IF;
  IF NEW.content_set_code IS NOT NULL AND jsonb_typeof(s.config->'contentSets') = 'object'
     AND NOT (s.config->'contentSets') ? NEW.content_set_code THEN
    PERFORM ie_raise(format('content set %s is not declared in the study config', NEW.content_set_code));
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Sessions (0003) plus: participant still taking part with granted consent; content set and
-- task copied from the allocation; compiler version taken from the study manifest. All of
-- these are immutable afterwards.
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
    IF NEW.study_id <> OLD.study_id OR NEW.participant_id <> OLD.participant_id
       OR NEW.condition_id <> OLD.condition_id OR NEW.allocation_id <> OLD.allocation_id
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
  SELECT * INTO a FROM allocations WHERE id = NEW.allocation_id;
  IF a.period <> NEW.period THEN
    PERFORM ie_raise('session period differs from its allocation period');
  END IF;
  NEW.content_set_code := coalesce(NEW.content_set_code, a.content_set_code);
  NEW.task_code := coalesce(NEW.task_code, a.task_code);
  IF NEW.content_set_code IS DISTINCT FROM a.content_set_code OR NEW.task_code IS DISTINCT FROM a.task_code THEN
    PERFORM ie_raise('session content set / task differ from its allocation');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

-- =========================================================================================
-- 7. Telemetry: an event can only describe what its session could have shown
-- =========================================================================================

CREATE OR REPLACE FUNCTION ie_telemetry_events_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ss study_sessions%ROWTYPE;
  c_interface condition_interface;
  p_status participant_status;
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

-- =========================================================================================
-- 8. Raw participant data
-- =========================================================================================

-- Append-only research records. DELETE only in a reasoned purge.
CREATE OR REPLACE FUNCTION ie_research_record_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF ie_setting('app.research_purge_reason') IS NULL THEN
      PERFORM ie_raise(format('%s DELETE requires app.research_purge_reason', TG_TABLE_NAME));
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'TRUNCATE' THEN
    PERFORM ie_raise(format('%s cannot be truncated', TG_TABLE_NAME));
  END IF;
  PERFORM ie_raise(format('%s is append-only (UPDATE rejected)', TG_TABLE_NAME));
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER responses_append_only BEFORE UPDATE OR DELETE ON responses
  FOR EACH ROW EXECUTE FUNCTION ie_research_record_guard();--> statement-breakpoint
CREATE TRIGGER responses_no_truncate BEFORE TRUNCATE ON responses
  FOR EACH STATEMENT EXECUTE FUNCTION ie_research_record_guard();--> statement-breakpoint
CREATE TRIGGER derived_scores_append_only BEFORE UPDATE OR DELETE ON derived_scores
  FOR EACH ROW EXECUTE FUNCTION ie_research_record_guard();--> statement-breakpoint
CREATE TRIGGER derived_scores_no_truncate BEFORE TRUNCATE ON derived_scores
  FOR EACH STATEMENT EXECUTE FUNCTION ie_research_record_guard();--> statement-breakpoint
CREATE TRIGGER concept_map_revisions_append_only BEFORE UPDATE OR DELETE ON concept_map_revisions
  FOR EACH ROW EXECUTE FUNCTION ie_research_record_guard();--> statement-breakpoint
CREATE TRIGGER concept_map_revisions_no_truncate BEFORE TRUNCATE ON concept_map_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION ie_research_record_guard();--> statement-breakpoint

-- Concept maps: identity fixed; frozen once final; every content change bumps `revision`.
-- DELETE only in a reasoned purge.
CREATE OR REPLACE FUNCTION ie_concept_maps_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF ie_setting('app.research_purge_reason') IS NULL THEN
      PERFORM ie_raise('concept_maps DELETE requires app.research_purge_reason');
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
    RETURN NEW;
  END IF;
  IF OLD.is_final THEN
    PERFORM ie_raise('a final concept map is immutable');
  END IF;
  IF NEW.session_id <> OLD.session_id OR NEW.participant_id <> OLD.participant_id
     OR NEW.assessment_id <> OLD.assessment_id OR NEW.item_id <> OLD.item_id
     OR NEW.phase <> OLD.phase THEN
    PERFORM ie_raise('concept map identity is immutable');
  END IF;
  IF NEW.nodes IS DISTINCT FROM OLD.nodes OR NEW.raw IS DISTINCT FROM OLD.raw
     OR NEW.is_final IS DISTINCT FROM OLD.is_final THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_concept_maps_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.revision <> OLD.revision THEN
    INSERT INTO concept_map_revisions (concept_map_id, revision, nodes, raw, is_final)
    VALUES (NEW.id, NEW.revision, NEW.nodes, NEW.raw, NEW.is_final);
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER concept_maps_guard BEFORE INSERT OR UPDATE OR DELETE ON concept_maps
  FOR EACH ROW EXECUTE FUNCTION ie_concept_maps_guard();--> statement-breakpoint
CREATE TRIGGER concept_maps_history AFTER INSERT OR UPDATE ON concept_maps
  FOR EACH ROW EXECUTE FUNCTION ie_concept_maps_history();--> statement-breakpoint
CREATE TRIGGER concept_maps_no_truncate BEFORE TRUNCATE ON concept_maps
  FOR EACH STATEMENT EXECUTE FUNCTION ie_research_record_guard();--> statement-breakpoint

-- Edges of a final concept map are frozen with it (a purge may still remove them).
CREATE OR REPLACE FUNCTION ie_concept_map_edges_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  final boolean;
BEGIN
  SELECT is_final INTO final FROM concept_maps
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.concept_map_id ELSE NEW.concept_map_id END;
  IF TG_OP = 'UPDATE' AND OLD.concept_map_id <> NEW.concept_map_id THEN
    PERFORM ie_raise('a concept map edge cannot move to another map');
  END IF;
  IF final AND NOT (TG_OP = 'DELETE' AND ie_setting('app.research_purge_reason') IS NOT NULL) THEN
    PERFORM ie_raise(format('edges of a final concept map are immutable (%s rejected)', TG_OP));
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint

CREATE TRIGGER concept_map_edges_guard BEFORE INSERT OR UPDATE OR DELETE ON concept_map_edges
  FOR EACH ROW EXECUTE FUNCTION ie_concept_map_edges_guard();--> statement-breakpoint

-- =========================================================================================
-- 9. Release manifests record the database environment
-- =========================================================================================

CREATE OR REPLACE FUNCTION ie_db_environment()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'serverVersion', current_setting('server_version'),
    'serverVersionNum', current_setting('server_version_num')::integer,
    'extensions', coalesce((SELECT jsonb_object_agg(extname, extversion ORDER BY extname) FROM pg_extension), '{}'::jsonb)
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_release_manifests_stamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.db_environment := ie_db_environment();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER release_manifests_stamp BEFORE INSERT ON release_manifests
  FOR EACH ROW EXECUTE FUNCTION ie_release_manifests_stamp();
