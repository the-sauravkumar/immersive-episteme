ALTER TABLE "spatial_manifests" DROP CONSTRAINT "spatial_manifests_inputs_uq";--> statement-breakpoint
ALTER TABLE "content_snapshots" ADD COLUMN "kind" text DEFAULT 'release' NOT NULL;--> statement-breakpoint
ALTER TABLE "spatial_manifests" ADD COLUMN "traditions" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "media_candidates" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "media_candidates" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "media_candidates" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "media_candidates" ADD COLUMN "dimensions_source" text;--> statement-breakpoint
ALTER TABLE "spatial_manifests" ADD CONSTRAINT "spatial_manifests_inputs_uq" UNIQUE("snapshot_id","rule_set_id","compiler_version","seed","traditions");--> statement-breakpoint
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_kind_ck" CHECK ("content_snapshots"."kind" IN ('release', 'review'));--> statement-breakpoint
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_review_ck" CHECK ("content_snapshots"."kind" <> 'review' OR ("content_snapshots"."status" = 'draft' AND "content_snapshots"."includes_unverified"));--> statement-breakpoint
ALTER TABLE "media_candidates" ADD CONSTRAINT "media_candidates_dims_ck" CHECK (("media_candidates"."width" IS NULL OR "media_candidates"."width" > 0) AND ("media_candidates"."height" IS NULL OR "media_candidates"."height" > 0));--> statement-breakpoint
ALTER TABLE "media_candidates" ADD CONSTRAINT "media_candidates_mime_ck" CHECK ("media_candidates"."mime_type" IS NULL OR "media_candidates"."mime_type" ~ '^[a-z]+/[a-z0-9][a-z0-9.+-]*$');