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
$$;
