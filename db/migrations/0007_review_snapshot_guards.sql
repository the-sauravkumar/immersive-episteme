CREATE OR REPLACE FUNCTION ie_content_snapshots_kind_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    PERFORM ie_raise(format('content_snapshots.kind cannot change (snapshot %s)', OLD.version_label));
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER content_snapshots_kind_guard BEFORE UPDATE ON content_snapshots
  FOR EACH ROW EXECUTE FUNCTION ie_content_snapshots_kind_guard();--> statement-breakpoint

CREATE OR REPLACE FUNCTION ie_studies_review_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_demo THEN
    RETURN NEW;
  END IF;
  IF NEW.snapshot_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM content_snapshots WHERE id = NEW.snapshot_id AND kind = 'review'
  ) THEN
    PERFORM ie_raise('a non-demo study cannot use a review snapshot');
  END IF;
  IF NEW.manifest_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM spatial_manifests m JOIN content_snapshots s ON s.id = m.snapshot_id
     WHERE m.id = NEW.manifest_id AND s.kind = 'review'
  ) THEN
    PERFORM ie_raise('a non-demo study cannot use a spatial manifest compiled from a review snapshot');
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER studies_review_snapshot_guard BEFORE INSERT OR UPDATE ON studies
  FOR EACH ROW EXECUTE FUNCTION ie_studies_review_snapshot_guard();
