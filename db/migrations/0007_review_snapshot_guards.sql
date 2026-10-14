-- 0007 review-snapshot guards (custom SQL, hand-written). Same conventions as 0003/0005:
-- violations raise SQLSTATE 23514 with an "ie: " message prefix.
--
-- A REVIEW snapshot (content_snapshots.kind = 'review', built by `npm run content:import` from
-- curated content that no curator has verified) is for researcher review, the public demo and
-- staff preview only. Migration 0006 already forbids a review snapshot from ever being
-- published (content_snapshots_review_ck: kind = 'review' implies status = 'draft' and
-- includes_unverified). Because study activation needs a published snapshot (0005
-- ie_studies_guard), that alone keeps a review snapshot out of every ACTIVE study. These
-- triggers close the remaining gaps:
--   1. `kind` can never change (a review row cannot be relabelled 'release' and published);
--   2. no non-demo study may reference a review snapshot at all, even while in draft;
--   3. no non-demo study may pin a spatial manifest compiled from a review snapshot.
-- A demo study (is_demo = true, never experimental) may reference a review snapshot so the
-- development bootstrap can render real content in the demo.

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
