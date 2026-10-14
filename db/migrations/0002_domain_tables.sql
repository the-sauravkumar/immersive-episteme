CREATE TYPE "public"."allocation_algorithm" AS ENUM('simple', 'block', 'stratified_block', 'counterbalanced', 'manual');--> statement-breakpoint
CREATE TYPE "public"."assessment_item_kind" AS ENUM('single_choice', 'multiple_choice', 'short_text', 'long_text', 'likert', 'numeric', 'ranking', 'concept_map');--> statement-breakpoint
CREATE TYPE "public"."assessment_kind" AS ENUM('pretest', 'posttest', 'reconstruction', 'transfer', 'questionnaire');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('image', 'video', 'audio', 'model_3d', 'texture', 'document');--> statement-breakpoint
CREATE TYPE "public"."asset_link_role" AS ENUM('primary', 'illustration', 'evidence', 'exhibit_model', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('accepted', 'partial', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."concept_map_phase" AS ENUM('pre', 'post');--> statement-breakpoint
CREATE TYPE "public"."concept_type" AS ENUM('tradition', 'material', 'tool', 'process_stage', 'artisan_decision', 'design_principle', 'outcome', 'scientific_mechanism', 'environmental_condition', 'comparison', 'explanation', 'historical_context', 'open_question');--> statement-breakpoint
CREATE TYPE "public"."condition_interface" AS ENUM('conventional_2d', 'immersive_3d');--> statement-breakpoint
CREATE TYPE "public"."consent_decision" AS ENUM('granted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."deviation_severity" AS ENUM('minor', 'major');--> statement-breakpoint
CREATE TYPE "public"."event_scope" AS ENUM('both', 'conventional_2d', 'immersive_3d');--> statement-breakpoint
CREATE TYPE "public"."lockable_status" AS ENUM('draft', 'locked');--> statement-breakpoint
CREATE TYPE "public"."manifest_status" AS ENUM('draft', 'valid', 'invalid', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."media_candidate_status" AS ENUM('candidate', 'approved', 'rejected', 'imported');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('enrolled', 'active', 'completed', 'withdrawn', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."provenance_kind" AS ENUM('practitioner_testimony', 'historical_documentation', 'scientific_evidence', 'researcher_interpretation', 'hypothesis', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."rater_role" AS ENUM('rater', 'adjudicator');--> statement-breakpoint
CREATE TYPE "public"."reference_map_status" AS ENUM('draft', 'adjudicated', 'locked');--> statement-breakpoint
CREATE TYPE "public"."relationship_semantics" AS ENUM('causal', 'sequential', 'associative', 'compositional', 'explanatory', 'comparative');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('candidate', 'released', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."response_status" AS ENUM('answered', 'skipped', 'timed_out');--> statement-breakpoint
CREATE TYPE "public"."rule_set_status" AS ENUM('draft', 'frozen');--> statement-breakpoint
CREATE TYPE "public"."sequence_anomaly_kind" AS ENUM('gap', 'duplicate', 'out_of_order');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."snapshot_item_kind" AS ENUM('tradition', 'category', 'concept', 'relationship_type', 'relationship', 'source', 'claim', 'asset');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."source_reliability" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."spatial_element_kind" AS ENUM('zone', 'room', 'exhibit', 'station', 'path', 'portal', 'landmark', 'label', 'cue');--> statement-breakpoint
CREATE TYPE "public"."study_design" AS ENUM('between', 'within');--> statement-breakpoint
CREATE TYPE "public"."study_phase" AS ENUM('pre', 'learning', 'post', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."study_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."verifiable_entity_kind" AS ENUM('tradition', 'concept', 'relationship', 'source', 'asset');--> statement-breakpoint
CREATE TYPE "public"."verification_state" AS ENUM('draft', 'under_review', 'verified', 'published', 'rejected', 'needs_evidence', 'archived');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('platform_admin', 'principal_investigator', 'researcher', 'curator', 'content_editor', 'study_facilitator', 'research_analyst');--> statement-breakpoint
CREATE TABLE "assessment_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"position" smallint NOT NULL,
	"kind" "assessment_item_kind" NOT NULL,
	"prompt" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"answer_key" jsonb,
	"concept_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_items_key_uq" UNIQUE("assessment_id","item_key"),
	CONSTRAINT "assessment_items_position_uq" UNIQUE("assessment_id","position"),
	CONSTRAINT "assessment_items_id_assessment_uq" UNIQUE("id","assessment_id"),
	CONSTRAINT "assessment_items_key_ck" CHECK ("assessment_items"."item_key" ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
	CONSTRAINT "assessment_items_prompt_ck" CHECK (length(btrim("assessment_items"."prompt")) > 0)
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"kind" "assessment_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"instrument_name" text,
	"instrument_citation" text,
	"is_validated_instrument" boolean DEFAULT false NOT NULL,
	"status" "lockable_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	CONSTRAINT "assessments_code_version_uq" UNIQUE("code","version"),
	CONSTRAINT "assessments_code_ck" CHECK ("assessments"."code" ~ '^[a-z][a-z0-9_-]{1,63}$'),
	CONSTRAINT "assessments_version_ck" CHECK ("assessments"."version" > 0),
	CONSTRAINT "assessments_validated_ck" CHECK (NOT "assessments"."is_validated_instrument" OR ("assessments"."instrument_name" IS NOT NULL AND "assessments"."instrument_citation" IS NOT NULL)),
	CONSTRAINT "assessments_demo_ck" CHECK ("assessments"."is_demo" = ("assessments"."code" LIKE 'demo%') AND (NOT "assessments"."is_demo" OR ("assessments"."title" LIKE 'Demo:%' AND NOT "assessments"."is_validated_instrument"))),
	CONSTRAINT "assessments_locked_ck" CHECK ("assessments"."status" <> 'locked' OR "assessments"."locked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "concept_map_edges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"concept_map_id" uuid NOT NULL,
	"edge_key" text NOT NULL,
	"source_node_key" text NOT NULL,
	"target_node_key" text NOT NULL,
	"source_concept_id" uuid,
	"target_concept_id" uuid,
	"relationship_type_code" text,
	"label" text,
	"directed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_map_edges_key_uq" UNIQUE("concept_map_id","edge_key"),
	CONSTRAINT "concept_map_edges_self_ck" CHECK ("concept_map_edges"."source_node_key" <> "concept_map_edges"."target_node_key")
);
--> statement-breakpoint
CREATE TABLE "concept_maps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"phase" "concept_map_phase" NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_maps_session_item_phase_uq" UNIQUE("session_id","item_id","phase"),
	CONSTRAINT "concept_maps_nodes_ck" CHECK (jsonb_typeof("concept_maps"."nodes") = 'array'),
	CONSTRAINT "concept_maps_final_ck" CHECK (NOT "concept_maps"."is_final" OR "concept_maps"."submitted_at" IS NOT NULL),
	CONSTRAINT "concept_maps_revision_ck" CHECK ("concept_maps"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "derived_scores" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"concept_map_id" uuid,
	"response_id" uuid,
	"reference_map_id" uuid,
	"rubric_id" uuid,
	"metric_name" text NOT NULL,
	"metric_version" text NOT NULL,
	"value" double precision,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pipeline_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derived_scores_uq" UNIQUE NULLS NOT DISTINCT("session_id","assessment_id","concept_map_id","response_id","metric_name","metric_version"),
	CONSTRAINT "derived_scores_metric_ck" CHECK ("derived_scores"."metric_name" ~ '^[a-z][a-z0-9_.]{0,63}$')
);
--> statement-breakpoint
CREATE TABLE "reference_map_edges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reference_map_id" uuid NOT NULL,
	"source_concept_id" uuid NOT NULL,
	"target_concept_id" uuid NOT NULL,
	"relationship_type_code" text,
	"directed" boolean DEFAULT true NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"agreement" double precision,
	"notes" text,
	CONSTRAINT "reference_map_edges_uq" UNIQUE NULLS NOT DISTINCT("reference_map_id","source_concept_id","target_concept_id","relationship_type_code"),
	CONSTRAINT "reference_map_edges_self_ck" CHECK ("reference_map_edges"."source_concept_id" <> "reference_map_edges"."target_concept_id"),
	CONSTRAINT "reference_map_edges_weight_ck" CHECK ("reference_map_edges"."weight" > 0),
	CONSTRAINT "reference_map_edges_agreement_ck" CHECK ("reference_map_edges"."agreement" IS NULL OR ("reference_map_edges"."agreement" >= 0 AND "reference_map_edges"."agreement" <= 1))
);
--> statement-breakpoint
CREATE TABLE "reference_map_raters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reference_map_id" uuid NOT NULL,
	"rater_id" text NOT NULL,
	"role" "rater_role" DEFAULT 'rater' NOT NULL,
	"submission" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	CONSTRAINT "reference_map_raters_uq" UNIQUE("reference_map_id","rater_id","role")
);
--> statement-breakpoint
CREATE TABLE "reference_maps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "reference_map_status" DEFAULT 'draft' NOT NULL,
	"adjudicated_by" text,
	"adjudicated_at" timestamp with time zone,
	"adjudication_notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_maps_version_uq" UNIQUE("assessment_id","version"),
	CONSTRAINT "reference_maps_nodes_ck" CHECK (jsonb_typeof("reference_maps"."nodes") = 'array'),
	CONSTRAINT "reference_maps_adjudicated_ck" CHECK ("reference_maps"."status" = 'draft' OR ("reference_maps"."adjudicated_by" IS NOT NULL AND "reference_maps"."adjudicated_at" IS NOT NULL)),
	CONSTRAINT "reference_maps_demo_ck" CHECK (NOT "reference_maps"."is_demo" OR ("reference_maps"."title" LIKE 'Demo:%' AND "reference_maps"."status" = 'draft'))
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"status" "response_status" NOT NULL,
	"raw" jsonb,
	"presented_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"client_ts" timestamp with time zone,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	CONSTRAINT "responses_attempt_uq" UNIQUE("session_id","item_id","attempt"),
	CONSTRAINT "responses_attempt_ck" CHECK ("responses"."attempt" > 0),
	CONSTRAINT "responses_answered_ck" CHECK ("responses"."status" <> 'answered' OR ("responses"."raw" IS NOT NULL AND "responses"."answered_at" IS NOT NULL)),
	CONSTRAINT "responses_order_ck" CHECK ("responses"."answered_at" IS NULL OR "responses"."presented_at" IS NULL OR "responses"."answered_at" >= "responses"."presented_at"),
	CONSTRAINT "responses_duration_ck" CHECK ("responses"."duration_ms" IS NULL OR "responses"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scoring_rubrics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"item_id" uuid,
	"version" integer NOT NULL,
	"method" text NOT NULL,
	"rubric" jsonb NOT NULL,
	"status" "lockable_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_rubrics_uq" UNIQUE NULLS NOT DISTINCT("assessment_id","item_id","version"),
	CONSTRAINT "scoring_rubrics_version_ck" CHECK ("scoring_rubrics"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "study_assessments" (
	"study_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"phase" "study_phase" NOT NULL,
	"position" smallint NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_assessments_study_id_assessment_id_phase_pk" PRIMARY KEY("study_id","assessment_id","phase"),
	CONSTRAINT "study_assessments_order_uq" UNIQUE("study_id","phase","position")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip_hash" text,
	"request_id" text,
	CONSTRAINT "audit_log_actor_kind_ck" CHECK ("audit_log"."actor_kind" IN ('user', 'participant', 'system')),
	CONSTRAINT "audit_log_action_ck" CHECK ("audit_log"."action" ~ '^[a-z][a-z0-9_.]{1,63}$'),
	CONSTRAINT "audit_log_ip_ck" CHECK ("audit_log"."ip_hash" IS NULL OR "audit_log"."ip_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "concept_claim_sources" (
	"claim_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"locator" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_claim_sources_claim_id_source_id_pk" PRIMARY KEY("claim_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "concept_claims" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"concept_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"text" text NOT NULL,
	"quote" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concept_claims_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "concept_claims_position_uq" UNIQUE("concept_id","position"),
	CONSTRAINT "concept_claims_text_ck" CHECK (length(btrim("concept_claims"."text")) > 0),
	CONSTRAINT "concept_claims_position_ck" CHECK ("concept_claims"."position" >= 0),
	CONSTRAINT "concept_claims_quote_ck" CHECK ("concept_claims"."quote" IS NULL OR array_length(regexp_split_to_array(btrim("concept_claims"."quote"), '\s+'), 1) <= 25)
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text NOT NULL,
	"slug" text NOT NULL,
	"type" "concept_type" NOT NULL,
	"category_code" text NOT NULL,
	"tradition_id" uuid,
	"package_id" uuid,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" jsonb,
	"body_md" text,
	"local_terms" text[] DEFAULT '{}'::text[] NOT NULL,
	"compares" text[] DEFAULT '{}'::text[] NOT NULL,
	"provenance_kind" "provenance_kind" NOT NULL,
	"verification_state" "verification_state" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (ie_concept_search_vector(title, summary, local_terms, body_md)) STORED,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "concepts_key_unique" UNIQUE("key"),
	CONSTRAINT "concepts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "concepts_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "concepts_key_ck" CHECK ("concepts"."key" ~ '^[a-z0-9]+(-[a-z0-9]+)*\.[a-z_]+\.[a-z0-9]+(-[a-z0-9]+)*$' AND split_part("concepts"."key", '.', 2) = "concepts"."type"::text),
	CONSTRAINT "concepts_slug_ck" CHECK ("concepts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "concepts_title_ck" CHECK (length(btrim("concepts"."title")) > 0),
	CONSTRAINT "concepts_body_ck" CHECK ("concepts"."body" IS NULL OR (jsonb_typeof("concepts"."body") = 'object' AND "concepts"."body"->>'type' = 'doc')),
	CONSTRAINT "concepts_demo_ck" CHECK ("concepts"."is_demo" = ("concepts"."key" LIKE 'demo%') AND (NOT "concepts"."is_demo" OR "concepts"."title" LIKE 'Demo:%')),
	CONSTRAINT "concepts_demo_state_ck" CHECK (NOT "concepts"."is_demo" OR ("concepts"."provenance_kind" = 'unverified' AND "concepts"."verification_state" NOT IN ('verified', 'published'))),
	CONSTRAINT "concepts_compares_ck" CHECK (cardinality("concepts"."compares") = 0 OR "concepts"."type" = 'comparison')
);
--> statement-breakpoint
CREATE TABLE "content_packages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"format_version" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"alt_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text,
	"source_path" text,
	"file_sha256" text,
	"imported_at" timestamp with time zone,
	"imported_by" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_packages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "content_packages_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "content_packages_slug_ck" CHECK ("content_packages"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "content_packages_kind_ck" CHECK ("content_packages"."kind" IN ('tradition', 'shared', 'comparisons', 'cms')),
	CONSTRAINT "content_packages_sha_ck" CHECK ("content_packages"."file_sha256" IS NULL OR "content_packages"."file_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "content_packages_demo_ck" CHECK ("content_packages"."is_demo" = ("content_packages"."slug" LIKE 'demo%'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_categories" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"template_group" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_categories_position_unique" UNIQUE("position"),
	CONSTRAINT "knowledge_categories_code_ck" CHECK ("knowledge_categories"."code" ~ '^[a-z][a-z_]*$')
);
--> statement-breakpoint
CREATE TABLE "relationship_sources" (
	"relationship_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"quote" text,
	"locator" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_sources_relationship_id_source_id_pk" PRIMARY KEY("relationship_id","source_id"),
	CONSTRAINT "relationship_sources_quote_ck" CHECK ("relationship_sources"."quote" IS NULL OR array_length(regexp_split_to_array(btrim("relationship_sources"."quote"), '\s+'), 1) <= 25)
);
--> statement-breakpoint
CREATE TABLE "relationship_types" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"inverse_label" text,
	"description" text NOT NULL,
	"semantics" "relationship_semantics" NOT NULL,
	"directed" boolean DEFAULT true NOT NULL,
	"allows_cycles" boolean DEFAULT true NOT NULL,
	"ordered" boolean DEFAULT false NOT NULL,
	"requires_evidence" boolean DEFAULT true NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_types_code_ck" CHECK ("relationship_types"."code" ~ '^[A-Z][A-Z0-9_]*$'),
	CONSTRAINT "relationship_types_ordered_ck" CHECK (NOT "relationship_types"."ordered" OR ("relationship_types"."directed" AND "relationship_types"."semantics" = 'sequential')),
	CONSTRAINT "relationship_types_undirected_ck" CHECK ("relationship_types"."directed" OR "relationship_types"."inverse_label" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"source_concept_id" uuid NOT NULL,
	"target_concept_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"package_id" uuid,
	"explanation" text,
	"conditions" text,
	"strength" double precision,
	"ordinal" integer,
	"provenance_kind" "provenance_kind" NOT NULL,
	"verification_state" "verification_state" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "relationships_edge_uq" UNIQUE("source_concept_id","target_concept_id","type_code"),
	CONSTRAINT "relationships_no_self_loop_ck" CHECK ("relationships"."source_concept_id" <> "relationships"."target_concept_id"),
	CONSTRAINT "relationships_strength_ck" CHECK ("relationships"."strength" IS NULL OR ("relationships"."strength" >= 0 AND "relationships"."strength" <= 1)),
	CONSTRAINT "relationships_ordinal_ck" CHECK ("relationships"."ordinal" IS NULL OR "relationships"."ordinal" > 0),
	CONSTRAINT "relationships_demo_state_ck" CHECK (NOT "relationships"."is_demo" OR ("relationships"."provenance_kind" = 'unverified' AND "relationships"."verification_state" NOT IN ('verified', 'published')))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"package_id" uuid,
	"local_key" text,
	"kind" "provenance_kind" NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"publisher" text,
	"year" integer,
	"url" text,
	"accessed_on" date,
	"reliability" "source_reliability",
	"citation" text,
	"notes" text,
	"verification_state" "verification_state" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "sources_package_local_key_uq" UNIQUE("package_id","local_key"),
	CONSTRAINT "sources_year_ck" CHECK ("sources"."year" IS NULL OR "sources"."year" BETWEEN 0 AND 2100),
	CONSTRAINT "sources_url_ck" CHECK ("sources"."url" IS NULL OR "sources"."url" ~ '^https?://'),
	CONSTRAINT "sources_local_key_ck" CHECK ("sources"."local_key" IS NULL OR "sources"."package_id" IS NOT NULL),
	CONSTRAINT "sources_demo_ck" CHECK (NOT "sources"."is_demo" OR "sources"."title" LIKE 'Demo:%'),
	CONSTRAINT "sources_demo_state_ck" CHECK (NOT "sources"."is_demo" OR ("sources"."kind" = 'unverified' AND "sources"."verification_state" NOT IN ('verified', 'published')))
);
--> statement-breakpoint
CREATE TABLE "tradition_sources" (
	"tradition_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"purpose" text DEFAULT 'general' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tradition_sources_tradition_id_source_id_purpose_pk" PRIMARY KEY("tradition_id","source_id","purpose"),
	CONSTRAINT "tradition_sources_purpose_ck" CHECK ("tradition_sources"."purpose" IN ('gi', 'summary', 'region', 'general'))
);
--> statement-breakpoint
CREATE TABLE "traditions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"package_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"alt_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"summary" text,
	"region_place" text,
	"region_district" text,
	"region_state" text,
	"region_country" text,
	"latitude" double precision,
	"longitude" double precision,
	"gi_registered" boolean,
	"gi_application_no" text,
	"gi_year" integer,
	"verification_state" "verification_state" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traditions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "traditions_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "traditions_slug_ck" CHECK ("traditions"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "traditions_lat_ck" CHECK ("traditions"."latitude" IS NULL OR "traditions"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "traditions_lon_ck" CHECK ("traditions"."longitude" IS NULL OR "traditions"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "traditions_gi_year_ck" CHECK ("traditions"."gi_year" IS NULL OR "traditions"."gi_year" BETWEEN 1999 AND 2100),
	CONSTRAINT "traditions_demo_ck" CHECK ("traditions"."is_demo" = ("traditions"."slug" LIKE 'demo%') AND (NOT "traditions"."is_demo" OR ("traditions"."name" LIKE 'Demo:%' AND "traditions"."verification_state" NOT IN ('verified', 'published'))))
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_kind" "verifiable_entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_state" "verification_state",
	"to_state" "verification_state" NOT NULL,
	"actor_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_records_actor_ck" CHECK ("verification_records"."to_state" NOT IN ('verified', 'published') OR "verification_records"."actor_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "content_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"version_label" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "snapshot_status" DEFAULT 'draft' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_sha256" text GENERATED ALWAYS AS (ie_jsonb_sha256(payload)) STORED NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"includes_unverified" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "content_snapshots_versionLabel_unique" UNIQUE("version_label"),
	CONSTRAINT "content_snapshots_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "content_snapshots_label_ck" CHECK ("content_snapshots"."version_label" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
	CONSTRAINT "content_snapshots_payload_ck" CHECK (jsonb_typeof("content_snapshots"."payload") = 'object'),
	CONSTRAINT "content_snapshots_published_ck" CHECK ("content_snapshots"."status" <> 'published' OR ("content_snapshots"."published_at" IS NOT NULL AND ("content_snapshots"."published_by" IS NOT NULL OR "content_snapshots"."is_demo"))),
	CONSTRAINT "content_snapshots_demo_ck" CHECK ("content_snapshots"."is_demo" = ("content_snapshots"."version_label" LIKE 'demo%') AND (NOT "content_snapshots"."is_demo" OR "content_snapshots"."title" LIKE 'Demo:%')),
	CONSTRAINT "content_snapshots_item_count_ck" CHECK ("content_snapshots"."item_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "snapshot_items" (
	"snapshot_id" uuid NOT NULL,
	"item_kind" "snapshot_item_kind" NOT NULL,
	"entity_ref" text NOT NULL,
	"entity_key" text,
	"item_sha256" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "snapshot_items_snapshot_id_item_kind_entity_ref_pk" PRIMARY KEY("snapshot_id","item_kind","entity_ref"),
	CONSTRAINT "snapshot_items_sha_ck" CHECK ("snapshot_items"."item_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "manual_overrides" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"target_element_id" text NOT NULL,
	"target_concept_id" uuid,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by" text,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	CONSTRAINT "manual_overrides_reason_ck" CHECK (length(btrim("manual_overrides"."reason")) >= 3),
	CONSTRAINT "manual_overrides_field_ck" CHECK ("manual_overrides"."field" ~ '^(/[^/]+)+$'),
	CONSTRAINT "manual_overrides_revoke_ck" CHECK (("manual_overrides"."revoked_at" IS NULL) = ("manual_overrides"."revoked_by" IS NULL) AND ("manual_overrides"."revoked_at" IS NULL OR "manual_overrides"."revoke_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mapping_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"config_sha256" text GENERATED ALWAYS AS (ie_jsonb_sha256(config)) STORED NOT NULL,
	"status" "rule_set_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"frozen_by" text,
	"frozen_at" timestamp with time zone,
	CONSTRAINT "mapping_rule_sets_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "mapping_rule_sets_name_version_uq" UNIQUE("name","version"),
	CONSTRAINT "mapping_rule_sets_version_ck" CHECK ("mapping_rule_sets"."version" > 0),
	CONSTRAINT "mapping_rule_sets_config_ck" CHECK (jsonb_typeof("mapping_rule_sets"."config") = 'object'),
	CONSTRAINT "mapping_rule_sets_frozen_ck" CHECK ("mapping_rule_sets"."status" <> 'frozen' OR "mapping_rule_sets"."frozen_at" IS NOT NULL),
	CONSTRAINT "mapping_rule_sets_demo_ck" CHECK (NOT "mapping_rule_sets"."is_demo" OR "mapping_rule_sets"."name" LIKE 'Demo:%')
);
--> statement-breakpoint
CREATE TABLE "spatial_element_encodings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"manifest_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"relationship_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"encoding" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spatial_element_encodings_uq" UNIQUE("manifest_id","element_id","relationship_id","rule_id")
);
--> statement-breakpoint
CREATE TABLE "spatial_elements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"manifest_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"kind" "spatial_element_kind" NOT NULL,
	"parent_element_id" text,
	"concept_id" uuid,
	"rule_id" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spatial_elements_manifest_element_uq" UNIQUE("manifest_id","element_id")
);
--> statement-breakpoint
CREATE TABLE "spatial_manifests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"compiler_version" text NOT NULL,
	"seed" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"manifest_hash" text GENERATED ALWAYS AS (ie_jsonb_sha256(manifest)) STORED NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "manifest_status" DEFAULT 'draft' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	CONSTRAINT "spatial_manifests_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "spatial_manifests_inputs_uq" UNIQUE("snapshot_id","rule_set_id","compiler_version","seed"),
	CONSTRAINT "spatial_manifests_manifest_ck" CHECK (jsonb_typeof("spatial_manifests"."manifest") = 'object'),
	CONSTRAINT "spatial_manifests_published_ck" CHECK ("spatial_manifests"."status" NOT IN ('published', 'superseded') OR "spatial_manifests"."published_at" IS NOT NULL),
	CONSTRAINT "spatial_manifests_compiler_ck" CHECK (length("spatial_manifests"."compiler_version") > 0)
);
--> statement-breakpoint
CREATE TABLE "parity_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"spatial_manifest_id" uuid,
	"release_manifest_id" uuid,
	"generator_version" text NOT NULL,
	"passed" boolean NOT NULL,
	"checks" jsonb NOT NULL,
	"report" jsonb NOT NULL,
	"report_sha256" text GENERATED ALWAYS AS (ie_jsonb_sha256(report)) STORED NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parity_reports_checks_ck" CHECK (jsonb_typeof("parity_reports"."checks") = 'array')
);
--> statement-breakpoint
CREATE TABLE "release_manifests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"version_label" text NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"spatial_manifest_id" uuid,
	"app_build" text NOT NULL,
	"notes" text,
	"status" "release_status" DEFAULT 'candidate' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by" text,
	"released_at" timestamp with time zone,
	CONSTRAINT "release_manifests_versionLabel_unique" UNIQUE("version_label"),
	CONSTRAINT "release_manifests_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "release_manifests_released_ck" CHECK ("release_manifests"."status" = 'candidate' OR "release_manifests"."released_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "asset_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asset_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"role" "asset_link_role" DEFAULT 'illustration' NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"caption_override" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_links_uq" UNIQUE("asset_id","concept_id","role")
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"variant" text DEFAULT 'original' NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_versions_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "asset_versions_uq" UNIQUE("asset_id","version","variant"),
	CONSTRAINT "asset_versions_version_ck" CHECK ("asset_versions"."version" > 0),
	CONSTRAINT "asset_versions_variant_ck" CHECK ("asset_versions"."variant" ~ '^[a-z0-9_-]+$'),
	CONSTRAINT "asset_versions_sha_ck" CHECK ("asset_versions"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "asset_versions_mime_ck" CHECK ("asset_versions"."mime_type" ~ '^[a-z]+/[a-z0-9][a-z0-9.+-]*$'),
	CONSTRAINT "asset_versions_size_ck" CHECK ("asset_versions"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"alt_text" text,
	"caption" text,
	"credit" text,
	"licence" text,
	"licence_url" text,
	"source_url" text,
	"source_id" uuid,
	"provenance_kind" "provenance_kind" NOT NULL,
	"verification_state" "verification_state" DEFAULT 'draft' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "assets_id_demo_uq" UNIQUE("id","is_demo"),
	CONSTRAINT "assets_sha_ck" CHECK ("assets"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "assets_mime_ck" CHECK ("assets"."mime_type" ~ '^[a-z]+/[a-z0-9][a-z0-9.+-]*$'),
	CONSTRAINT "assets_size_ck" CHECK ("assets"."byte_size" > 0),
	CONSTRAINT "assets_dims_ck" CHECK (("assets"."width" IS NULL OR "assets"."width" > 0) AND ("assets"."height" IS NULL OR "assets"."height" > 0)),
	CONSTRAINT "assets_duration_ck" CHECK ("assets"."duration_ms" IS NULL OR "assets"."duration_ms" >= 0),
	CONSTRAINT "assets_alt_ck" CHECK ("assets"."kind" NOT IN ('image', 'texture') OR "assets"."alt_text" IS NOT NULL),
	CONSTRAINT "assets_accepted_licence_ck" CHECK ("assets"."verification_state" NOT IN ('verified', 'published') OR "assets"."licence" IS NOT NULL),
	CONSTRAINT "assets_demo_ck" CHECK (NOT "assets"."is_demo" OR ("assets"."title" LIKE 'Demo:%' AND "assets"."provenance_kind" = 'unverified' AND "assets"."verification_state" NOT IN ('verified', 'published'))),
	CONSTRAINT "assets_current_version_ck" CHECK ("assets"."current_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "media_candidates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"package_id" uuid,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"licence" text,
	"author" text,
	"depicts_key" text,
	"depicts_concept_id" uuid,
	"status" "media_candidate_status" DEFAULT 'candidate' NOT NULL,
	"asset_id" uuid,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_candidates_uq" UNIQUE NULLS NOT DISTINCT("package_id","url","depicts_key"),
	CONSTRAINT "media_candidates_url_ck" CHECK ("media_candidates"."url" ~ '^https?://'),
	CONSTRAINT "media_candidates_imported_ck" CHECK ("media_candidates"."status" <> 'imported' OR "media_candidates"."asset_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"study_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"period" smallint DEFAULT 1 NOT NULL,
	"algorithm" "allocation_algorithm" NOT NULL,
	"seed" text NOT NULL,
	"sequence_index" integer NOT NULL,
	"block_index" integer,
	"stratum" text,
	"study_protocol_version" text NOT NULL,
	"override_reason" text,
	"allocated_by" text,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allocations_sequence_uq" UNIQUE("study_id","sequence_index","period"),
	CONSTRAINT "allocations_participant_period_uq" UNIQUE("participant_id","period"),
	CONSTRAINT "allocations_id_participant_condition_uq" UNIQUE("id","participant_id","condition_id"),
	CONSTRAINT "allocations_period_ck" CHECK ("allocations"."period" > 0),
	CONSTRAINT "allocations_sequence_ck" CHECK ("allocations"."sequence_index" >= 0),
	CONSTRAINT "allocations_manual_ck" CHECK ("allocations"."algorithm" <> 'manual' OR "allocations"."override_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"participant_id" uuid NOT NULL,
	"consent_version" text NOT NULL,
	"consent_text_sha256" text NOT NULL,
	"decision" "consent_decision" NOT NULL,
	"method" text DEFAULT 'on_screen' NOT NULL,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_records_sha_ck" CHECK ("consent_records"."consent_text_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "consent_records_method_ck" CHECK ("consent_records"."method" IN ('on_screen', 'paper', 'verbal_witnessed'))
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"study_id" uuid NOT NULL,
	"code" text NOT NULL,
	"access_token_hash" text,
	"status" "participant_status" DEFAULT 'enrolled' NOT NULL,
	"stratum" text,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawal_reason" text,
	"exclusion_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_accessTokenHash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "participants_code_uq" UNIQUE("study_id","code"),
	CONSTRAINT "participants_id_study_uq" UNIQUE("id","study_id"),
	CONSTRAINT "participants_code_ck" CHECK ("participants"."code" ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$'),
	CONSTRAINT "participants_token_ck" CHECK ("participants"."access_token_hash" IS NULL OR "participants"."access_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "participants_withdrawn_ck" CHECK ("participants"."status" <> 'withdrawn' OR "participants"."withdrawn_at" IS NOT NULL),
	CONSTRAINT "participants_excluded_ck" CHECK ("participants"."status" <> 'excluded' OR "participants"."exclusion_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "protocol_deviations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"study_id" uuid NOT NULL,
	"session_id" uuid,
	"participant_id" uuid,
	"category" text NOT NULL,
	"severity" "deviation_severity" NOT NULL,
	"description" text NOT NULL,
	"resolution" text,
	"reported_by" text NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "protocol_deviations_category_ck" CHECK ("protocol_deviations"."category" IN ('procedure', 'technical', 'consent', 'timing', 'allocation', 'content', 'other')),
	CONSTRAINT "protocol_deviations_description_ck" CHECK (length(btrim("protocol_deviations"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "session_annotations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_annotations_kind_ck" CHECK ("session_annotations"."kind" IN ('note', 'observation', 'technical_issue', 'data_quality')),
	CONSTRAINT "session_annotations_body_ck" CHECK (length(btrim("session_annotations"."body")) > 0)
);
--> statement-breakpoint
CREATE TABLE "studies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"protocol_version" text NOT NULL,
	"snapshot_id" uuid,
	"manifest_id" uuid,
	"release_manifest_id" uuid,
	"design" "study_design" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "study_status" DEFAULT 'draft' NOT NULL,
	"allow_unverified_content" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_by" text,
	"activated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "studies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "studies_slug_ck" CHECK ("studies"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "studies_demo_ck" CHECK ("studies"."is_demo" = ("studies"."slug" LIKE 'demo%') AND (NOT "studies"."is_demo" OR "studies"."title" LIKE 'Demo:%')),
	CONSTRAINT "studies_active_ck" CHECK ("studies"."status" = 'draft' OR ("studies"."snapshot_id" IS NOT NULL AND "studies"."activated_at" IS NOT NULL)),
	CONSTRAINT "studies_closed_ck" CHECK ("studies"."status" <> 'closed' OR "studies"."closed_at" IS NOT NULL),
	CONSTRAINT "studies_config_ck" CHECK (jsonb_typeof("studies"."config") = 'object')
);
--> statement-breakpoint
CREATE TABLE "study_conditions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"study_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"interface" "condition_interface" NOT NULL,
	"allocation_weight" smallint DEFAULT 1 NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_conditions_code_uq" UNIQUE("study_id","code"),
	CONSTRAINT "study_conditions_id_study_uq" UNIQUE("id","study_id"),
	CONSTRAINT "study_conditions_code_ck" CHECK ("study_conditions"."code" ~ '^[a-z][a-z0-9_]{0,47}$'),
	CONSTRAINT "study_conditions_weight_ck" CHECK ("study_conditions"."allocation_weight" > 0)
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"study_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"period" smallint DEFAULT 1 NOT NULL,
	"snapshot_id" uuid,
	"manifest_id" uuid,
	"assessment_versions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"app_build" text NOT NULL,
	"compiler_version" text,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"interrupted" boolean DEFAULT false NOT NULL,
	"interruption_count" integer DEFAULT 0 NOT NULL,
	"device" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"exclusion_reason" text,
	"excluded_by" text,
	"excluded_at" timestamp with time zone,
	"withdrawn" boolean DEFAULT false NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_participant_period_uq" UNIQUE("participant_id","period"),
	CONSTRAINT "study_sessions_id_participant_uq" UNIQUE("id","participant_id"),
	CONSTRAINT "study_sessions_identity_uq" UNIQUE("id","study_id","participant_id","condition_id"),
	CONSTRAINT "study_sessions_started_ck" CHECK ("study_sessions"."status" = 'scheduled' OR "study_sessions"."started_at" IS NOT NULL),
	CONSTRAINT "study_sessions_completed_ck" CHECK ("study_sessions"."status" <> 'completed' OR ("study_sessions"."completed_at" IS NOT NULL AND "study_sessions"."completed_at" >= "study_sessions"."started_at")),
	CONSTRAINT "study_sessions_excluded_ck" CHECK (NOT "study_sessions"."excluded" OR ("study_sessions"."exclusion_reason" IS NOT NULL AND "study_sessions"."excluded_at" IS NOT NULL)),
	CONSTRAINT "study_sessions_withdrawn_ck" CHECK (NOT "study_sessions"."withdrawn" OR "study_sessions"."withdrawn_at" IS NOT NULL),
	CONSTRAINT "study_sessions_interruptions_ck" CHECK ("study_sessions"."interruption_count" >= 0 AND ("study_sessions"."interrupted" OR "study_sessions"."interruption_count" = 0))
);
--> statement-breakpoint
CREATE TABLE "derived_metrics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"study_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"metric_name" text NOT NULL,
	"metric_version" text NOT NULL,
	"value" double precision,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input_event_count" integer NOT NULL,
	"input_sha256" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derived_metrics_uq" UNIQUE("session_id","metric_name","metric_version"),
	CONSTRAINT "derived_metrics_metric_ck" CHECK ("derived_metrics"."metric_name" ~ '^[a-z][a-z0-9_.]{0,63}$'),
	CONSTRAINT "derived_metrics_sha_ck" CHECK ("derived_metrics"."input_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "derived_metrics_count_ck" CHECK ("derived_metrics"."input_event_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_types" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"requirement_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"analytic_concept" text NOT NULL,
	"scope" "event_scope" DEFAULT 'both' NOT NULL,
	"schema_version" smallint DEFAULT 1 NOT NULL,
	"is_technical" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_types_code_ck" CHECK ("event_types"."code" ~ '^[a-z][a-z0-9_]{1,63}$'),
	CONSTRAINT "event_types_concept_ck" CHECK ("event_types"."analytic_concept" ~ '^[a-z][a-z0-9_]{1,63}$')
);
--> statement-breakpoint
CREATE TABLE "sequence_gaps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "sequence_anomaly_kind" NOT NULL,
	"from_seq" integer NOT NULL,
	"to_seq" integer NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "sequence_gaps_uq" UNIQUE("session_id","kind","from_seq"),
	CONSTRAINT "sequence_gaps_range_ck" CHECK ("sequence_gaps"."from_seq" >= 0 AND "sequence_gaps"."to_seq" >= "sequence_gaps"."from_seq")
);
--> statement-breakpoint
CREATE TABLE "telemetry_batches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"idempotency_key" text NOT NULL,
	"session_id" uuid NOT NULL,
	"schema_version" smallint NOT NULL,
	"app_build" text NOT NULL,
	"client_sent_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_count" integer NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"quarantined_count" integer DEFAULT 0 NOT NULL,
	"status" "batch_status" NOT NULL,
	"payload_sha256" text,
	CONSTRAINT "telemetry_batches_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "telemetry_batches_key_ck" CHECK ("telemetry_batches"."idempotency_key" ~ '^[A-Za-z0-9_:.-]{8,128}$'),
	CONSTRAINT "telemetry_batches_counts_ck" CHECK ("telemetry_batches"."event_count" >= 0 AND "telemetry_batches"."accepted_count" >= 0 AND "telemetry_batches"."duplicate_count" >= 0 AND "telemetry_batches"."quarantined_count" >= 0 AND "telemetry_batches"."accepted_count" + "telemetry_batches"."duplicate_count" + "telemetry_batches"."quarantined_count" = "telemetry_batches"."event_count"),
	CONSTRAINT "telemetry_batches_sha_ck" CHECK ("telemetry_batches"."payload_sha256" IS NULL OR "telemetry_batches"."payload_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "telemetry_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"batch_id" uuid,
	"schema_version" smallint NOT NULL,
	"study_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"client_ts" timestamp with time zone NOT NULL,
	"client_mono_ms" double precision,
	"server_ts" timestamp with time zone DEFAULT now() NOT NULL,
	"seq" integer NOT NULL,
	"event_type_code" text NOT NULL,
	"concept_id" uuid,
	"category_code" text,
	"tradition_id" uuid,
	"room_or_page_id" text,
	"target" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"app_build" text NOT NULL,
	"content_version" text NOT NULL,
	"snapshot_id" uuid,
	"compiler_version" text,
	CONSTRAINT "telemetry_events_eventId_unique" UNIQUE("event_id"),
	CONSTRAINT "telemetry_events_session_seq_uq" UNIQUE("session_id","seq"),
	CONSTRAINT "telemetry_events_seq_ck" CHECK ("telemetry_events"."seq" >= 0),
	CONSTRAINT "telemetry_events_metadata_ck" CHECK (jsonb_typeof("telemetry_events"."metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "telemetry_quarantine" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"batch_id" uuid,
	"session_id" uuid,
	"event_id" uuid,
	"reason" text NOT NULL,
	"raw" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolution" text
);
--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_items" ADD CONSTRAINT "assessment_items_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_map_edges" ADD CONSTRAINT "concept_map_edges_concept_map_id_concept_maps_id_fk" FOREIGN KEY ("concept_map_id") REFERENCES "public"."concept_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_map_edges" ADD CONSTRAINT "concept_map_edges_source_concept_id_concepts_id_fk" FOREIGN KEY ("source_concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_map_edges" ADD CONSTRAINT "concept_map_edges_target_concept_id_concepts_id_fk" FOREIGN KEY ("target_concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_map_edges" ADD CONSTRAINT "concept_map_edges_relationship_type_code_relationship_types_code_fk" FOREIGN KEY ("relationship_type_code") REFERENCES "public"."relationship_types"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concept_maps" ADD CONSTRAINT "concept_maps_session_fk" FOREIGN KEY ("session_id","participant_id") REFERENCES "public"."study_sessions"("id","participant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_maps" ADD CONSTRAINT "concept_maps_item_fk" FOREIGN KEY ("item_id","assessment_id") REFERENCES "public"."assessment_items"("id","assessment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_scores" ADD CONSTRAINT "derived_scores_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_scores" ADD CONSTRAINT "derived_scores_concept_map_id_concept_maps_id_fk" FOREIGN KEY ("concept_map_id") REFERENCES "public"."concept_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_scores" ADD CONSTRAINT "derived_scores_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_scores" ADD CONSTRAINT "derived_scores_reference_map_id_reference_maps_id_fk" FOREIGN KEY ("reference_map_id") REFERENCES "public"."reference_maps"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_scores" ADD CONSTRAINT "derived_scores_rubric_id_scoring_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."scoring_rubrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_scores" ADD CONSTRAINT "derived_scores_session_fk" FOREIGN KEY ("session_id","participant_id") REFERENCES "public"."study_sessions"("id","participant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_map_edges" ADD CONSTRAINT "reference_map_edges_reference_map_id_reference_maps_id_fk" FOREIGN KEY ("reference_map_id") REFERENCES "public"."reference_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_map_edges" ADD CONSTRAINT "reference_map_edges_source_concept_id_concepts_id_fk" FOREIGN KEY ("source_concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_map_edges" ADD CONSTRAINT "reference_map_edges_target_concept_id_concepts_id_fk" FOREIGN KEY ("target_concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_map_edges" ADD CONSTRAINT "reference_map_edges_relationship_type_code_relationship_types_code_fk" FOREIGN KEY ("relationship_type_code") REFERENCES "public"."relationship_types"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reference_map_raters" ADD CONSTRAINT "reference_map_raters_reference_map_id_reference_maps_id_fk" FOREIGN KEY ("reference_map_id") REFERENCES "public"."reference_maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_map_raters" ADD CONSTRAINT "reference_map_raters_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_maps" ADD CONSTRAINT "reference_maps_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_maps" ADD CONSTRAINT "reference_maps_snapshot_id_content_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."content_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_maps" ADD CONSTRAINT "reference_maps_adjudicated_by_users_id_fk" FOREIGN KEY ("adjudicated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_maps" ADD CONSTRAINT "reference_maps_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_session_fk" FOREIGN KEY ("session_id","participant_id") REFERENCES "public"."study_sessions"("id","participant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_item_fk" FOREIGN KEY ("item_id","assessment_id") REFERENCES "public"."assessment_items"("id","assessment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rubrics" ADD CONSTRAINT "scoring_rubrics_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rubrics" ADD CONSTRAINT "scoring_rubrics_item_id_assessment_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."assessment_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rubrics" ADD CONSTRAINT "scoring_rubrics_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_assessments" ADD CONSTRAINT "study_assessments_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_assessments" ADD CONSTRAINT "study_assessments_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_claim_sources" ADD CONSTRAINT "concept_claim_sources_claim_fk" FOREIGN KEY ("claim_id","is_demo") REFERENCES "public"."concept_claims"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_claim_sources" ADD CONSTRAINT "concept_claim_sources_source_fk" FOREIGN KEY ("source_id","is_demo") REFERENCES "public"."sources"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_claims" ADD CONSTRAINT "concept_claims_concept_fk" FOREIGN KEY ("concept_id","is_demo") REFERENCES "public"."concepts"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_category_code_knowledge_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."knowledge_categories"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_tradition_fk" FOREIGN KEY ("tradition_id","is_demo") REFERENCES "public"."traditions"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_package_fk" FOREIGN KEY ("package_id","is_demo") REFERENCES "public"."content_packages"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_packages" ADD CONSTRAINT "content_packages_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_sources" ADD CONSTRAINT "relationship_sources_relationship_fk" FOREIGN KEY ("relationship_id","is_demo") REFERENCES "public"."relationships"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_sources" ADD CONSTRAINT "relationship_sources_source_fk" FOREIGN KEY ("source_id","is_demo") REFERENCES "public"."sources"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_type_code_relationship_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."relationship_types"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_fk" FOREIGN KEY ("source_concept_id","is_demo") REFERENCES "public"."concepts"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_fk" FOREIGN KEY ("target_concept_id","is_demo") REFERENCES "public"."concepts"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_package_fk" FOREIGN KEY ("package_id","is_demo") REFERENCES "public"."content_packages"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_package_fk" FOREIGN KEY ("package_id","is_demo") REFERENCES "public"."content_packages"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradition_sources" ADD CONSTRAINT "tradition_sources_tradition_fk" FOREIGN KEY ("tradition_id","is_demo") REFERENCES "public"."traditions"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tradition_sources" ADD CONSTRAINT "tradition_sources_source_fk" FOREIGN KEY ("source_id","is_demo") REFERENCES "public"."sources"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traditions" ADD CONSTRAINT "traditions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traditions" ADD CONSTRAINT "traditions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traditions" ADD CONSTRAINT "traditions_package_fk" FOREIGN KEY ("package_id","is_demo") REFERENCES "public"."content_packages"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_snapshots" ADD CONSTRAINT "content_snapshots_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_items" ADD CONSTRAINT "snapshot_items_snapshot_fk" FOREIGN KEY ("snapshot_id","is_demo") REFERENCES "public"."content_snapshots"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_target_concept_id_concepts_id_fk" FOREIGN KEY ("target_concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_overrides" ADD CONSTRAINT "manual_overrides_rule_set_fk" FOREIGN KEY ("rule_set_id","is_demo") REFERENCES "public"."mapping_rule_sets"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_rule_sets" ADD CONSTRAINT "mapping_rule_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mapping_rule_sets" ADD CONSTRAINT "mapping_rule_sets_frozen_by_users_id_fk" FOREIGN KEY ("frozen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_element_encodings" ADD CONSTRAINT "spatial_element_encodings_manifest_id_spatial_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."spatial_manifests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_element_encodings" ADD CONSTRAINT "spatial_element_encodings_relationship_id_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."relationships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_element_encodings" ADD CONSTRAINT "spatial_element_encodings_element_fk" FOREIGN KEY ("manifest_id","element_id") REFERENCES "public"."spatial_elements"("manifest_id","element_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_elements" ADD CONSTRAINT "spatial_elements_manifest_id_spatial_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."spatial_manifests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_elements" ADD CONSTRAINT "spatial_elements_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_manifests" ADD CONSTRAINT "spatial_manifests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_manifests" ADD CONSTRAINT "spatial_manifests_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_manifests" ADD CONSTRAINT "spatial_manifests_snapshot_fk" FOREIGN KEY ("snapshot_id","is_demo") REFERENCES "public"."content_snapshots"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_manifests" ADD CONSTRAINT "spatial_manifests_rule_set_fk" FOREIGN KEY ("rule_set_id","is_demo") REFERENCES "public"."mapping_rule_sets"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_release_manifest_id_release_manifests_id_fk" FOREIGN KEY ("release_manifest_id") REFERENCES "public"."release_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_snapshot_fk" FOREIGN KEY ("snapshot_id","is_demo") REFERENCES "public"."content_snapshots"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parity_reports" ADD CONSTRAINT "parity_reports_manifest_fk" FOREIGN KEY ("spatial_manifest_id","is_demo") REFERENCES "public"."spatial_manifests"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_manifests" ADD CONSTRAINT "release_manifests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_manifests" ADD CONSTRAINT "release_manifests_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_manifests" ADD CONSTRAINT "release_manifests_snapshot_fk" FOREIGN KEY ("snapshot_id","is_demo") REFERENCES "public"."content_snapshots"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_manifests" ADD CONSTRAINT "release_manifests_manifest_fk" FOREIGN KEY ("spatial_manifest_id","is_demo") REFERENCES "public"."spatial_manifests"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_asset_fk" FOREIGN KEY ("asset_id","is_demo") REFERENCES "public"."assets"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_concept_fk" FOREIGN KEY ("concept_id","is_demo") REFERENCES "public"."concepts"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_fk" FOREIGN KEY ("source_id","is_demo") REFERENCES "public"."sources"("id","is_demo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_candidates" ADD CONSTRAINT "media_candidates_package_fk" FOREIGN KEY ("package_id","is_demo") REFERENCES "public"."content_packages"("id","is_demo") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_candidates" ADD CONSTRAINT "media_candidates_concept_fk" FOREIGN KEY ("depicts_concept_id") REFERENCES "public"."concepts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_candidates" ADD CONSTRAINT "media_candidates_asset_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_participant_fk" FOREIGN KEY ("participant_id","study_id") REFERENCES "public"."participants"("id","study_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_condition_fk" FOREIGN KEY ("condition_id","study_id") REFERENCES "public"."study_conditions"("id","study_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_deviations" ADD CONSTRAINT "protocol_deviations_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_deviations" ADD CONSTRAINT "protocol_deviations_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_deviations" ADD CONSTRAINT "protocol_deviations_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protocol_deviations" ADD CONSTRAINT "protocol_deviations_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_annotations" ADD CONSTRAINT "session_annotations_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_annotations" ADD CONSTRAINT "session_annotations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_snapshot_id_content_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."content_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_manifest_id_spatial_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."spatial_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_release_manifest_id_release_manifests_id_fk" FOREIGN KEY ("release_manifest_id") REFERENCES "public"."release_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_conditions" ADD CONSTRAINT "study_conditions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_snapshot_id_content_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."content_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_manifest_id_spatial_manifests_id_fk" FOREIGN KEY ("manifest_id") REFERENCES "public"."spatial_manifests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_excluded_by_users_id_fk" FOREIGN KEY ("excluded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_participant_fk" FOREIGN KEY ("participant_id","study_id") REFERENCES "public"."participants"("id","study_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_condition_fk" FOREIGN KEY ("condition_id","study_id") REFERENCES "public"."study_conditions"("id","study_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_allocation_fk" FOREIGN KEY ("allocation_id","participant_id","condition_id") REFERENCES "public"."allocations"("id","participant_id","condition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_metrics" ADD CONSTRAINT "derived_metrics_session_fk" FOREIGN KEY ("session_id","study_id","participant_id","condition_id") REFERENCES "public"."study_sessions"("id","study_id","participant_id","condition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_gaps" ADD CONSTRAINT "sequence_gaps_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_batches" ADD CONSTRAINT "telemetry_batches_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_batch_id_telemetry_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."telemetry_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_event_type_code_event_types_code_fk" FOREIGN KEY ("event_type_code") REFERENCES "public"."event_types"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_category_code_knowledge_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."knowledge_categories"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_tradition_id_traditions_id_fk" FOREIGN KEY ("tradition_id") REFERENCES "public"."traditions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_snapshot_id_content_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."content_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_events" ADD CONSTRAINT "telemetry_events_session_fk" FOREIGN KEY ("session_id","study_id","participant_id","condition_id") REFERENCES "public"."study_sessions"("id","study_id","participant_id","condition_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_quarantine" ADD CONSTRAINT "telemetry_quarantine_batch_id_telemetry_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."telemetry_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telemetry_quarantine" ADD CONSTRAINT "telemetry_quarantine_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "concept_map_edges_concepts_idx" ON "concept_map_edges" USING btree ("source_concept_id","target_concept_id");--> statement-breakpoint
CREATE INDEX "responses_assessment_idx" ON "responses" USING btree ("assessment_id","participant_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "concept_claim_sources_source_idx" ON "concept_claim_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "concepts_type_idx" ON "concepts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "concepts_category_idx" ON "concepts" USING btree ("category_code");--> statement-breakpoint
CREATE INDEX "concepts_tradition_idx" ON "concepts" USING btree ("tradition_id");--> statement-breakpoint
CREATE INDEX "concepts_state_idx" ON "concepts" USING btree ("verification_state");--> statement-breakpoint
CREATE INDEX "concepts_title_trgm_idx" ON "concepts" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "concepts_search_idx" ON "concepts" USING gin ("search");--> statement-breakpoint
CREATE INDEX "concepts_local_terms_idx" ON "concepts" USING gin ("local_terms");--> statement-breakpoint
CREATE INDEX "relationship_sources_source_idx" ON "relationship_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "relationships_target_idx" ON "relationships" USING btree ("target_concept_id");--> statement-breakpoint
CREATE INDEX "relationships_type_idx" ON "relationships" USING btree ("type_code");--> statement-breakpoint
CREATE INDEX "relationships_state_idx" ON "relationships" USING btree ("verification_state");--> statement-breakpoint
CREATE INDEX "sources_title_trgm_idx" ON "sources" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "verification_records_entity_idx" ON "verification_records" USING btree ("entity_kind","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "snapshot_items_entity_idx" ON "snapshot_items" USING btree ("item_kind","entity_ref");--> statement-breakpoint
CREATE INDEX "manual_overrides_rule_set_idx" ON "manual_overrides" USING btree ("rule_set_id");--> statement-breakpoint
CREATE INDEX "spatial_element_encodings_relationship_idx" ON "spatial_element_encodings" USING btree ("relationship_id");--> statement-breakpoint
CREATE INDEX "spatial_elements_concept_idx" ON "spatial_elements" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "spatial_elements_rule_idx" ON "spatial_elements" USING btree ("manifest_id","rule_id");--> statement-breakpoint
CREATE INDEX "parity_reports_snapshot_idx" ON "parity_reports" USING btree ("snapshot_id","created_at");--> statement-breakpoint
CREATE INDEX "asset_links_concept_idx" ON "asset_links" USING btree ("concept_id","position");--> statement-breakpoint
CREATE INDEX "assets_sha_idx" ON "assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "consent_records_participant_idx" ON "consent_records" USING btree ("participant_id","recorded_at");--> statement-breakpoint
CREATE INDEX "protocol_deviations_study_idx" ON "protocol_deviations" USING btree ("study_id","reported_at");--> statement-breakpoint
CREATE INDEX "session_annotations_session_idx" ON "session_annotations" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "study_sessions_study_idx" ON "study_sessions" USING btree ("study_id","status");--> statement-breakpoint
CREATE INDEX "telemetry_batches_session_idx" ON "telemetry_batches" USING btree ("session_id","received_at");--> statement-breakpoint
CREATE INDEX "telemetry_events_study_type_idx" ON "telemetry_events" USING btree ("study_id","event_type_code");--> statement-breakpoint
CREATE INDEX "telemetry_events_concept_idx" ON "telemetry_events" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "telemetry_events_server_ts_idx" ON "telemetry_events" USING btree ("server_ts");--> statement-breakpoint
CREATE INDEX "telemetry_quarantine_session_idx" ON "telemetry_quarantine" USING btree ("session_id","received_at");