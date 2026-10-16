CREATE TABLE "snapshot_figures" (
	"snapshot_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"caption" text NOT NULL,
	"alt_text" text NOT NULL,
	"credit" text NOT NULL,
	"licence" text NOT NULL,
	"licence_url" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "snapshot_figures_snapshot_id_concept_id_asset_id_pk" PRIMARY KEY("snapshot_id","concept_id","asset_id"),
	CONSTRAINT "snapshot_figures_position_ck" CHECK ("snapshot_figures"."position" >= 0),
	CONSTRAINT "snapshot_figures_dims_ck" CHECK ("snapshot_figures"."width" > 0 AND "snapshot_figures"."height" > 0),
	CONSTRAINT "snapshot_figures_sha_ck" CHECK ("snapshot_figures"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "snapshot_figures_text_ck" CHECK (btrim("snapshot_figures"."caption") <> '' AND btrim("snapshot_figures"."alt_text") <> '' AND btrim("snapshot_figures"."credit") <> '' AND btrim("snapshot_figures"."licence") <> '')
);
--> statement-breakpoint
ALTER TABLE "snapshot_figures" ADD CONSTRAINT "snapshot_figures_snapshot_id_content_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."content_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_figures" ADD CONSTRAINT "snapshot_figures_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snapshot_figures_asset_idx" ON "snapshot_figures" USING btree ("asset_id");--> statement-breakpoint

-- =========================================================================================
-- Hand-written below (same conventions as 0003/0005/0018: "ie: " messages, SQLSTATE 23514).
-- Final review knowledge-01, database-01, security-02 (study photographs frozen into the
-- release a study pins) and knowledge-09 (GI evidence of an accepted tradition).
-- =========================================================================================

-- Backfill: every release published before this migration keeps the photographs its learners
-- could see on the day the migration runs (the rules of servableSql in
-- src/server/cms/media/service.ts at that time, plus a valid anchor in the release's own claims).
-- Runs before the guard below exists, because these snapshots are already published.
INSERT INTO snapshot_figures (snapshot_id, concept_id, asset_id, position, caption, alt_text, credit, licence, licence_url, width, height, sha256)
SELECT s.id, l.concept_id, a.id, l.position,
       btrim(COALESCE(NULLIF(btrim(l.caption_override), ''), a.caption)), btrim(a.alt_text), btrim(a.credit), btrim(a.licence), a.licence_url,
       a.width, a.height, a.sha256
  FROM content_snapshots s
  JOIN snapshot_items si ON si.snapshot_id = s.id AND si.item_kind = 'concept'
  JOIN asset_links l ON l.concept_id::text = si.entity_ref AND l.role = 'illustration' AND NOT l.is_demo
  JOIN assets a ON a.id = l.asset_id
 WHERE s.kind = 'release' AND s.status = 'published' AND NOT s.is_demo
   AND NOT a.is_demo AND a.kind = 'image'
   AND a.verification_state IN ('verified', 'published')
   AND a.width IS NOT NULL AND a.height IS NOT NULL
   AND (a.licence_expires_on IS NULL OR a.licence_expires_on >= (now() AT TIME ZONE 'utc')::date)
   AND (a.max_pixels IS NULL OR greatest(a.width, a.height) <= a.max_pixels)
   AND (a.licence_term_months IS NULL OR a.first_published_on IS NOT NULL)
   AND btrim(coalesce(a.credit, '')) <> '' AND btrim(coalesce(a.alt_text, '')) <> '' AND btrim(coalesce(a.licence, '')) <> ''
   AND btrim(COALESCE(NULLIF(btrim(l.caption_override), ''), a.caption, '')) <> ''
   AND l.position < (
     SELECT jsonb_array_length(c->'claims') FROM jsonb_array_elements(s.payload->'concepts') c WHERE c->>'id' = l.concept_id::text
   )
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Frozen with the snapshot: a row may be added only while its RELEASE snapshot is a draft (inside
-- publishRelease's transaction), for a concept the snapshot contains and an accepted, real image
-- whose stored file is the one recorded. Nothing may change a row afterwards, and rows of a
-- published snapshot can never be deleted.
CREATE OR REPLACE FUNCTION ie_snapshot_figures_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snap content_snapshots%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    PERFORM ie_raise('snapshot_figures rows are immutable (UPDATE rejected)');
  END IF;
  SELECT * INTO snap FROM content_snapshots
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.snapshot_id ELSE NEW.snapshot_id END;
  IF TG_OP = 'DELETE' THEN
    -- A cascade from a deleted draft snapshot finds no parent row (or a draft one).
    IF snap.status = 'published' THEN
      PERFORM ie_raise(format('figures of published snapshot %s are immutable', snap.version_label));
    END IF;
    RETURN OLD;
  END IF;
  IF snap.id IS NULL OR snap.kind <> 'release' OR snap.status <> 'draft' THEN
    PERFORM ie_raise('figures are frozen only into a draft release snapshot, while it is being published');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM snapshot_items si
     WHERE si.snapshot_id = NEW.snapshot_id AND si.item_kind = 'concept' AND si.entity_ref = NEW.concept_id::text
  ) THEN
    PERFORM ie_raise(format('concept %s is not in snapshot %s', NEW.concept_id, snap.version_label));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM assets a
     WHERE a.id = NEW.asset_id AND NOT a.is_demo AND a.kind = 'image'
       AND a.verification_state IN ('verified', 'published') AND a.sha256 = NEW.sha256
  ) THEN
    PERFORM ie_raise(format('asset %s is not an accepted real image with the recorded file', NEW.asset_id));
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER snapshot_figures_guard BEFORE INSERT OR UPDATE OR DELETE ON snapshot_figures
  FOR EACH ROW EXECUTE FUNCTION ie_snapshot_figures_guard();--> statement-breakpoint
CREATE TRIGGER snapshot_figures_no_truncate BEFORE TRUNCATE ON snapshot_figures
  FOR EACH STATEMENT EXECUTE FUNCTION ie_append_only();--> statement-breakpoint

-- =========================================================================================
-- knowledge-09: GI evidence (tradition_sources) is evidence like claim sources. Any change while
-- the tradition is accepted sends it back to review (ie_evidence_changed covers the claim and
-- relationship evidence tables only). The CMS path (setTraditionSource) did this by hand; the
-- content importer did not, so it is now enforced for every writer.
-- =========================================================================================
CREATE OR REPLACE FUNCTION ie_tradition_evidence_changed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NULL;
  END IF;
  UPDATE traditions SET verification_state = 'under_review'
   WHERE id IN (
     CASE WHEN TG_OP <> 'INSERT' THEN OLD.tradition_id END,
     CASE WHEN TG_OP <> 'DELETE' THEN NEW.tradition_id END
   )
     AND verification_state IN ('verified', 'published');
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER tradition_sources_evidence AFTER INSERT OR UPDATE OR DELETE ON tradition_sources
  FOR EACH ROW EXECUTE FUNCTION ie_tradition_evidence_changed();
