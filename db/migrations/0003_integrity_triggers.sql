-- 0003 integrity triggers (custom SQL, hand-written). See docs/architecture/knowledge-schema.md
-- §"Database-enforced invariants" for the rationale of each rule.
--
-- All violations raise SQLSTATE 23514 (check_violation) with a message starting "ie: ", so
-- services can map them to 4xx responses and tests can assert on them.
--
-- Transaction-local settings read by these triggers (set with `SELECT set_config(name, value, true)`):
--   app.actor_id                 Better Auth users.id of the acting staff member
--   app.change_reason            free-text reason recorded with a review-state change
--   app.telemetry_purge_reason   must be non-empty to DELETE raw telemetry (retention / withdrawal)

-- =========================================================================================
-- Generic helpers
-- =========================================================================================

CREATE OR REPLACE FUNCTION ie_setting(name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(btrim(current_setting(name, true)), '')
$$;--> statement-breakpoint

-- Rejects UPDATE / DELETE / TRUNCATE on append-only tables.
CREATE OR REPLACE FUNCTION ie_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM ie_raise(format('%s is append-only (%s rejected)', TG_TABLE_NAME, TG_OP));
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER verification_records_append_only BEFORE UPDATE OR DELETE ON verification_records
  FOR EACH ROW EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER verification_records_no_truncate BEFORE TRUNCATE ON verification_records
  FOR EACH STATEMENT EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER consent_records_append_only BEFORE UPDATE OR DELETE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER consent_records_no_truncate BEFORE TRUNCATE ON consent_records
  FOR EACH STATEMENT EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER allocations_append_only BEFORE UPDATE OR DELETE ON allocations
  FOR EACH ROW EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER allocations_no_truncate BEFORE TRUNCATE ON allocations
  FOR EACH STATEMENT EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER parity_reports_append_only BEFORE UPDATE OR DELETE ON parity_reports
  FOR EACH ROW EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION ie_append_only();--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION ie_append_only();--> statement-breakpoint

-- =========================================================================================
-- Telemetry: raw events are never edited; deletion only as an explicit, reasoned purge
-- =========================================================================================

CREATE OR REPLACE FUNCTION ie_telemetry_events_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM ie_raise('telemetry_events are immutable (UPDATE rejected)');
  ELSIF TG_OP = 'DELETE' THEN
    IF ie_setting('app.telemetry_purge_reason') IS NULL THEN
      PERFORM ie_raise('telemetry_events DELETE requires app.telemetry_purge_reason');
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'TRUNCATE' THEN
    PERFORM ie_raise('telemetry_events cannot be truncated');
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER telemetry_events_guard BEFORE UPDATE OR DELETE ON telemetry_events
  FOR EACH ROW EXECUTE FUNCTION ie_telemetry_events_guard();--> statement-breakpoint
CREATE TRIGGER telemetry_events_no_truncate BEFORE TRUNCATE ON telemetry_events
  FOR EACH STATEMENT EXECUTE FUNCTION ie_telemetry_events_guard();--> statement-breakpoint

-- Inherits snapshot/compiler from the session and keeps the event-type scope honest
-- (a 3D-only raw event type cannot be logged in a 2D condition and vice versa).
CREATE OR REPLACE FUNCTION ie_telemetry_events_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  s_snapshot uuid;
  s_compiler text;
  c_interface condition_interface;
  e_scope event_scope;
  e_active boolean;
BEGIN
  SELECT ss.snapshot_id, ss.compiler_version, sc.interface
    INTO s_snapshot, s_compiler, c_interface
    FROM study_sessions ss
    JOIN study_conditions sc ON sc.id = ss.condition_id
   WHERE ss.id = NEW.session_id;

  NEW.snapshot_id := coalesce(NEW.snapshot_id, s_snapshot);
  NEW.compiler_version := coalesce(NEW.compiler_version, s_compiler);
  IF NEW.snapshot_id IS DISTINCT FROM s_snapshot THEN
    PERFORM ie_raise('telemetry event snapshot differs from its session snapshot');
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

CREATE TRIGGER telemetry_events_insert BEFORE INSERT ON telemetry_events
  FOR EACH ROW EXECUTE FUNCTION ie_telemetry_events_insert();--> statement-breakpoint

-- =========================================================================================
-- Knowledge: review history, evidence requirements, relationship-type rules
-- =========================================================================================

-- AFTER INSERT/UPDATE: append a verification_records row whenever verification_state is set
-- or changes. TG_ARGV[0] is the verifiable_entity_kind. Accepting content (verified /
-- published) without app.actor_id fails on verification_records_actor_ck.
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
      ie_setting('app.change_reason')
    );
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER traditions_verification AFTER INSERT OR UPDATE OF verification_state ON traditions
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('tradition');--> statement-breakpoint
CREATE TRIGGER concepts_verification AFTER INSERT OR UPDATE OF verification_state ON concepts
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('concept');--> statement-breakpoint
CREATE TRIGGER relationships_verification AFTER INSERT OR UPDATE OF verification_state ON relationships
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('relationship');--> statement-breakpoint
CREATE TRIGGER sources_verification AFTER INSERT OR UPDATE OF verification_state ON sources
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('source');--> statement-breakpoint
CREATE TRIGGER assets_verification AFTER INSERT OR UPDATE OF verification_state ON assets
  FOR EACH ROW EXECUTE FUNCTION ie_record_verification('asset');--> statement-breakpoint

-- Accepted (verified/published) concepts need a sourced claim and a real provenance kind.
CREATE OR REPLACE FUNCTION ie_concepts_acceptance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.verification_state IN ('verified', 'published') THEN
    IF NEW.provenance_kind = 'unverified' THEN
      PERFORM ie_raise(format('concept %s has provenance "unverified" and cannot be accepted', NEW.key));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM concept_claims cc
        JOIN concept_claim_sources ccs ON ccs.claim_id = cc.id
       WHERE cc.concept_id = NEW.id
    ) THEN
      PERFORM ie_raise(format('concept %s needs at least one sourced claim before it can be accepted', NEW.key));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER concepts_acceptance BEFORE INSERT OR UPDATE ON concepts
  FOR EACH ROW EXECUTE FUNCTION ie_concepts_acceptance();--> statement-breakpoint

-- Relationship rules from the relationship_types registry:
--  * ordinal only on `ordered` types; undirected types store one row per unordered pair;
--  * `allows_cycles = false` types stay acyclic;
--  * accepted edges need a source when the type `requires_evidence`, and no "unverified" provenance.
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

  IF NEW.verification_state IN ('verified', 'published') THEN
    IF NEW.provenance_kind = 'unverified' THEN
      PERFORM ie_raise('a relationship with provenance "unverified" cannot be accepted');
    END IF;
    IF rt.requires_evidence AND NOT EXISTS (
      SELECT 1 FROM relationship_sources rs WHERE rs.relationship_id = NEW.id
    ) THEN
      PERFORM ie_raise(format('%s relationship needs a source before it can be accepted', NEW.type_code));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER relationships_rules BEFORE INSERT OR UPDATE ON relationships
  FOR EACH ROW EXECUTE FUNCTION ie_relationships_rules();--> statement-breakpoint

-- =========================================================================================
-- Publishing: published snapshots are immutable
-- =========================================================================================

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

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'published' THEN
      PERFORM ie_raise(format('published snapshot %s is immutable', OLD.version_label));
    END IF;
    IF OLD.is_demo <> NEW.is_demo THEN
      PERFORM ie_raise('content_snapshots.is_demo cannot change');
    END IF;
  END IF;

  IF NEW.status = 'published' THEN
    NEW.published_at := coalesce(NEW.published_at, now());
    IF TG_OP = 'UPDATE' THEN
      SELECT count(*) INTO NEW.item_count FROM snapshot_items WHERE snapshot_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER content_snapshots_guard BEFORE INSERT OR UPDATE OR DELETE ON content_snapshots
  FOR EACH ROW EXECUTE FUNCTION ie_content_snapshots_guard();--> statement-breakpoint

-- Items of a published snapshot are frozen. A new item must reference an existing entity with
-- the same is_demo flag as the snapshot, and (unless the snapshot explicitly
-- includes_unverified) only accepted content.
CREATE OR REPLACE FUNCTION ie_snapshot_items_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snap content_snapshots%ROWTYPE;
  e_demo boolean;
  e_state verification_state;
  ref_id uuid;
BEGIN
  SELECT * INTO snap FROM content_snapshots
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.snapshot_id ELSE NEW.snapshot_id END;
  IF snap.status = 'published' THEN
    PERFORM ie_raise(format('items of published snapshot %s are immutable', snap.version_label));
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.snapshot_id <> NEW.snapshot_id THEN
    SELECT * INTO snap FROM content_snapshots WHERE id = OLD.snapshot_id;
    IF snap.status = 'published' THEN
      PERFORM ie_raise('items of a published snapshot are immutable');
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  IF NEW.item_kind IN ('category', 'relationship_type') THEN
    IF NEW.item_kind = 'category' AND NOT EXISTS (SELECT 1 FROM knowledge_categories WHERE code = NEW.entity_ref) THEN
      PERFORM ie_raise(format('unknown knowledge category %s', NEW.entity_ref));
    END IF;
    IF NEW.item_kind = 'relationship_type' AND NOT EXISTS (SELECT 1 FROM relationship_types WHERE code = NEW.entity_ref) THEN
      PERFORM ie_raise(format('unknown relationship type %s', NEW.entity_ref));
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    ref_id := NEW.entity_ref::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    PERFORM ie_raise(format('snapshot item %s ref %s is not a uuid', NEW.item_kind, NEW.entity_ref));
  END;

  CASE NEW.item_kind
    WHEN 'tradition' THEN SELECT is_demo, verification_state INTO e_demo, e_state FROM traditions WHERE id = ref_id;
    WHEN 'concept' THEN SELECT is_demo, verification_state INTO e_demo, e_state FROM concepts WHERE id = ref_id;
    WHEN 'relationship' THEN SELECT is_demo, verification_state INTO e_demo, e_state FROM relationships WHERE id = ref_id;
    WHEN 'source' THEN SELECT is_demo, verification_state INTO e_demo, e_state FROM sources WHERE id = ref_id;
    WHEN 'asset' THEN SELECT is_demo, verification_state INTO e_demo, e_state FROM assets WHERE id = ref_id;
    WHEN 'claim' THEN
      SELECT cc.is_demo, c.verification_state INTO e_demo, e_state
        FROM concept_claims cc JOIN concepts c ON c.id = cc.concept_id WHERE cc.id = ref_id;
    ELSE
      PERFORM ie_raise(format('unsupported snapshot item kind %s', NEW.item_kind));
  END CASE;

  IF e_demo IS NULL THEN
    PERFORM ie_raise(format('snapshot item %s %s does not exist', NEW.item_kind, NEW.entity_ref));
  END IF;
  IF e_demo <> snap.is_demo THEN
    PERFORM ie_raise(CASE WHEN e_demo
      THEN 'demo content cannot be included in a non-demo snapshot'
      ELSE 'real content cannot be included in a demo snapshot' END);
  END IF;
  IF NOT snap.includes_unverified AND e_state NOT IN ('verified', 'published') THEN
    PERFORM ie_raise(format('%s %s is %s; snapshot %s does not allow unverified content',
      NEW.item_kind, NEW.entity_ref, e_state, snap.version_label));
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER snapshot_items_guard BEFORE INSERT OR UPDATE OR DELETE ON snapshot_items
  FOR EACH ROW EXECUTE FUNCTION ie_snapshot_items_guard();--> statement-breakpoint

-- Releases: once released, only the transition to `withdrawn` is allowed.
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
  IF NEW.status = 'released' AND OLD.status = 'candidate' THEN
    NEW.released_at := coalesce(NEW.released_at, now());
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER release_manifests_guard BEFORE UPDATE OR DELETE ON release_manifests
  FOR EACH ROW EXECUTE FUNCTION ie_release_manifests_guard();--> statement-breakpoint

-- =========================================================================================
-- Spatial: frozen rule sets and published manifests are immutable
-- =========================================================================================

CREATE OR REPLACE FUNCTION ie_mapping_rule_sets_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'frozen' THEN
    PERFORM ie_raise(format('frozen rule set %s v%s is immutable (%s rejected)', OLD.name, OLD.version, TG_OP));
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.status = 'frozen' THEN
    NEW.frozen_at := coalesce(NEW.frozen_at, now());
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER mapping_rule_sets_guard BEFORE UPDATE OR DELETE ON mapping_rule_sets
  FOR EACH ROW EXECUTE FUNCTION ie_mapping_rule_sets_guard();--> statement-breakpoint

-- Overrides are audited: never deleted; once recorded only the revocation fields may be set;
-- nothing changes once the rule set is frozen.
CREATE OR REPLACE FUNCTION ie_manual_overrides_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rs_status rule_set_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM ie_raise('manual overrides are audited and cannot be deleted; revoke instead');
  END IF;
  SELECT status INTO rs_status FROM mapping_rule_sets WHERE id = NEW.rule_set_id;
  IF rs_status = 'frozen' THEN
    PERFORM ie_raise('the rule set is frozen; create a new rule set version');
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NOT NULL THEN
      PERFORM ie_raise('a revoked override is immutable');
    END IF;
    IF (to_jsonb(NEW) - 'revoked_by' - 'revoked_at' - 'revoke_reason')
       IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_by' - 'revoked_at' - 'revoke_reason') THEN
      PERFORM ie_raise('only the revocation fields of a manual override can change');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER manual_overrides_guard BEFORE INSERT OR UPDATE OR DELETE ON manual_overrides
  FOR EACH ROW EXECUTE FUNCTION ie_manual_overrides_guard();--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_spatial_manifests_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rs_status rule_set_status;
  snap_status snapshot_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'superseded') THEN
      PERFORM ie_raise('a published spatial manifest cannot be deleted');
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('published', 'superseded') THEN
    IF NOT (OLD.status = 'published' AND NEW.status = 'superseded'
            AND (to_jsonb(NEW) - 'status' - 'manifest_hash') = (to_jsonb(OLD) - 'status' - 'manifest_hash')) THEN
      PERFORM ie_raise('a published spatial manifest is immutable (only published -> superseded)');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'published' THEN
    SELECT status INTO rs_status FROM mapping_rule_sets WHERE id = NEW.rule_set_id;
    SELECT status INTO snap_status FROM content_snapshots WHERE id = NEW.snapshot_id;
    IF rs_status <> 'frozen' THEN
      PERFORM ie_raise('a spatial manifest can only be published from a frozen rule set');
    END IF;
    IF snap_status <> 'published' THEN
      PERFORM ie_raise('a spatial manifest can only be published from a published snapshot');
    END IF;
    NEW.published_at := coalesce(NEW.published_at, now());
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER spatial_manifests_guard BEFORE INSERT OR UPDATE OR DELETE ON spatial_manifests
  FOR EACH ROW EXECUTE FUNCTION ie_spatial_manifests_guard();--> statement-breakpoint

-- Element index rows of a published manifest are frozen with it.
CREATE OR REPLACE FUNCTION ie_spatial_index_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  m_status manifest_status;
BEGIN
  SELECT status INTO m_status FROM spatial_manifests
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.manifest_id ELSE NEW.manifest_id END;
  IF m_status IN ('published', 'superseded') THEN
    PERFORM ie_raise(format('%s of a published spatial manifest are immutable', TG_TABLE_NAME));
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint

CREATE TRIGGER spatial_elements_guard BEFORE INSERT OR UPDATE OR DELETE ON spatial_elements
  FOR EACH ROW EXECUTE FUNCTION ie_spatial_index_guard();--> statement-breakpoint
CREATE TRIGGER spatial_element_encodings_guard BEFORE INSERT OR UPDATE OR DELETE ON spatial_element_encodings
  FOR EACH ROW EXECUTE FUNCTION ie_spatial_index_guard();--> statement-breakpoint

-- =========================================================================================
-- Studies: demo isolation, activation preconditions, frozen protocol
-- =========================================================================================

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
       OR (rel.spatial_manifest_id IS NOT NULL AND rel.spatial_manifest_id IS DISTINCT FROM NEW.manifest_id) THEN
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
    IF NOT NEW.is_demo AND EXISTS (
      SELECT 1 FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id
       WHERE sa.study_id = NEW.id AND a.status <> 'locked'
    ) THEN
      PERFORM ie_raise('all assessments of a non-demo study must be locked before activation');
    END IF;
    NEW.activated_at := coalesce(NEW.activated_at, now());
  END IF;
  IF NEW.status = 'closed' THEN
    NEW.closed_at := coalesce(NEW.closed_at, now());
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER studies_guard BEFORE INSERT OR UPDATE OR DELETE ON studies
  FOR EACH ROW EXECUTE FUNCTION ie_studies_guard();--> statement-breakpoint

-- Conditions and the assessment battery are part of the protocol: editable only in draft.
-- The battery of a non-demo study may not contain demo assessments.
CREATE OR REPLACE FUNCTION ie_study_protocol_children_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  s studies%ROWTYPE;
  a_demo boolean;
BEGIN
  SELECT * INTO s FROM studies
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.study_id ELSE NEW.study_id END;
  -- Cascading delete of a draft study: the parent row is already gone.
  IF NOT FOUND THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF s.status <> 'draft' THEN
    PERFORM ie_raise(format('%s of an active or closed study are frozen', TG_TABLE_NAME));
  END IF;
  IF TG_OP <> 'DELETE' AND TG_TABLE_NAME = 'study_assessments' THEN
    SELECT is_demo INTO a_demo FROM assessments WHERE id = NEW.assessment_id;
    IF a_demo AND NOT s.is_demo THEN
      PERFORM ie_raise('a non-demo study cannot include a demo assessment');
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint

CREATE TRIGGER study_conditions_guard BEFORE INSERT OR UPDATE OR DELETE ON study_conditions
  FOR EACH ROW EXECUTE FUNCTION ie_study_protocol_children_guard();--> statement-breakpoint
CREATE TRIGGER study_assessments_guard BEFORE INSERT OR UPDATE OR DELETE ON study_assessments
  FOR EACH ROW EXECUTE FUNCTION ie_study_protocol_children_guard();--> statement-breakpoint

-- Allocation happens only in an active study, and the recorded protocol version must match.
CREATE OR REPLACE FUNCTION ie_allocations_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  s studies%ROWTYPE;
BEGIN
  SELECT * INTO s FROM studies WHERE id = NEW.study_id;
  IF s.status <> 'active' THEN
    PERFORM ie_raise('participants can only be allocated in an active study');
  END IF;
  IF NEW.study_protocol_version <> s.protocol_version THEN
    PERFORM ie_raise('allocation protocol version does not match the study');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER allocations_insert BEFORE INSERT ON allocations
  FOR EACH ROW EXECUTE FUNCTION ie_allocations_insert();--> statement-breakpoint

-- Sessions inherit the study's snapshot/manifest (both conditions read one bundle); their
-- identity and version stamps never change afterwards.
CREATE OR REPLACE FUNCTION ie_study_sessions_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  s studies%ROWTYPE;
  a_period smallint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.study_id <> OLD.study_id OR NEW.participant_id <> OLD.participant_id
       OR NEW.condition_id <> OLD.condition_id OR NEW.allocation_id <> OLD.allocation_id
       OR NEW.period <> OLD.period
       OR NEW.snapshot_id IS DISTINCT FROM OLD.snapshot_id
       OR NEW.manifest_id IS DISTINCT FROM OLD.manifest_id
       OR NEW.app_build <> OLD.app_build
       OR NEW.compiler_version IS DISTINCT FROM OLD.compiler_version THEN
      PERFORM ie_raise('session identity and version stamps are immutable');
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO s FROM studies WHERE id = NEW.study_id;
  IF s.status <> 'active' THEN
    PERFORM ie_raise('sessions can only be created in an active study');
  END IF;
  NEW.snapshot_id := coalesce(NEW.snapshot_id, s.snapshot_id);
  NEW.manifest_id := coalesce(NEW.manifest_id, s.manifest_id);
  IF NEW.snapshot_id IS DISTINCT FROM s.snapshot_id OR NEW.manifest_id IS DISTINCT FROM s.manifest_id THEN
    PERFORM ie_raise('session snapshot/manifest must equal the study snapshot/manifest');
  END IF;
  SELECT period INTO a_period FROM allocations WHERE id = NEW.allocation_id;
  IF a_period <> NEW.period THEN
    PERFORM ie_raise('session period differs from its allocation period');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER study_sessions_guard BEFORE INSERT OR UPDATE ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION ie_study_sessions_guard();--> statement-breakpoint

-- =========================================================================================
-- Assessment: locked instruments, rubrics and reference maps are immutable
-- =========================================================================================

CREATE OR REPLACE FUNCTION ie_lockable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'locked' THEN
    PERFORM ie_raise(format('locked %s are immutable (%s rejected)', TG_TABLE_NAME, TG_OP));
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'assessments' AND NEW.status = 'locked' THEN
    NEW.locked_at := coalesce(NEW.locked_at, now());
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER assessments_guard BEFORE UPDATE OR DELETE ON assessments
  FOR EACH ROW EXECUTE FUNCTION ie_lockable_guard();--> statement-breakpoint
CREATE TRIGGER scoring_rubrics_guard BEFORE UPDATE OR DELETE ON scoring_rubrics
  FOR EACH ROW EXECUTE FUNCTION ie_lockable_guard();--> statement-breakpoint
CREATE TRIGGER reference_maps_guard BEFORE UPDATE OR DELETE ON reference_maps
  FOR EACH ROW EXECUTE FUNCTION ie_lockable_guard();--> statement-breakpoint

-- Children of a locked parent (items of an assessment, edges/raters of a reference map).
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
    SELECT status = 'locked' INTO locked FROM assessments WHERE id = parent_id;
  ELSE
    parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.reference_map_id ELSE NEW.reference_map_id END;
    SELECT status = 'locked' INTO locked FROM reference_maps WHERE id = parent_id;
  END IF;
  IF locked THEN
    PERFORM ie_raise(format('%s of a locked parent are immutable', TG_TABLE_NAME));
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;--> statement-breakpoint

CREATE TRIGGER assessment_items_guard BEFORE INSERT OR UPDATE OR DELETE ON assessment_items
  FOR EACH ROW EXECUTE FUNCTION ie_locked_parent_guard();--> statement-breakpoint
CREATE TRIGGER reference_map_edges_guard BEFORE INSERT OR UPDATE OR DELETE ON reference_map_edges
  FOR EACH ROW EXECUTE FUNCTION ie_locked_parent_guard();--> statement-breakpoint
CREATE TRIGGER reference_map_raters_guard BEFORE INSERT OR UPDATE OR DELETE ON reference_map_raters
  FOR EACH ROW EXECUTE FUNCTION ie_locked_parent_guard();
