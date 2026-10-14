/**
 * Shared domain vocabularies. These const tuples are the single source of truth: the
 * Drizzle schema (db/schema/*) builds its Postgres enums from them and the Zod contracts
 * (src/features/{feature}/contracts.ts) build their validators from them.
 *
 * Pure TypeScript with no dependencies, so it is safe to import from client components.
 * Changing a value here requires a migration (`npm run db:generate`).
 */

/** Content review lifecycle (spec §6.5 plus publishing states). */
export const VERIFICATION_STATES = [
  "draft",
  "under_review",
  "verified",
  "published",
  "rejected",
  "needs_evidence",
  "archived",
] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

/** States that count as "accepted" content: only a human curator can set them. */
export const ACCEPTED_STATES = ["verified", "published"] as const satisfies readonly VerificationState[];

/** Epistemic kind of a statement or source. Matches content/FORMAT.md `kind` / `provenance_kind`. */
export const PROVENANCE_KINDS = [
  "practitioner_testimony",
  "historical_documentation",
  "scientific_evidence",
  "researcher_interpretation",
  "hypothesis",
  "unverified",
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export const SOURCE_RELIABILITIES = ["high", "medium", "low"] as const;
export type SourceReliability = (typeof SOURCE_RELIABILITIES)[number];

/** Concept types (content/FORMAT.md `type`). */
export const CONCEPT_TYPES = [
  "tradition",
  "material",
  "tool",
  "process_stage",
  "artisan_decision",
  "design_principle",
  "outcome",
  "scientific_mechanism",
  "environmental_condition",
  "comparison",
  "explanation",
  "historical_context",
  "open_question",
] as const;
export type ConceptType = (typeof CONCEPT_TYPES)[number];

/**
 * The 14 knowledge categories (content/FORMAT.md `category`). Stored as reference rows in
 * `knowledge_categories`; this list seeds them and validates imports.
 */
export const KNOWLEDGE_CATEGORY_CODES = [
  "tradition_identity",
  "geography_history",
  "artisan_knowledge",
  "tacit_decisions",
  "materials",
  "tools",
  "process_stages",
  "design_principles",
  "production_outcomes",
  "scientific_mechanisms",
  "environmental_conditions",
  "cross_tradition_comparisons",
  "supporting_evidence",
  "open_questions",
] as const;
export type KnowledgeCategoryCode = (typeof KNOWLEDGE_CATEGORY_CODES)[number];

/** Semantics class of a relationship type: never collapse these into one generic link. */
export const RELATIONSHIP_SEMANTICS = [
  "causal",
  "sequential",
  "associative",
  "compositional",
  "explanatory",
  "comparative",
] as const;
export type RelationshipSemantics = (typeof RELATIONSHIP_SEMANTICS)[number];

/** Relationship type codes used by content/FORMAT.md v1. The registry table may add more. */
export const CORE_RELATIONSHIP_TYPE_CODES = [
  "BELONGS_TO",
  "USES",
  "PRECEDES",
  "DEPENDS_ON",
  "PRODUCES",
  "AFFECTED_BY",
  "EXPLAINS",
  "CONTRASTS_WITH",
  "SIMILAR_TO",
  "REQUIRES",
  "ENABLES",
  "CAUSES",
  "PRACTITIONER_EXPLAINS",
  "SCIENTIFICALLY_EXPLAINED_BY",
] as const;
export type CoreRelationshipTypeCode = (typeof CORE_RELATIONSHIP_TYPE_CODES)[number];

/** Entities whose review state is tracked in `verification_records`. */
export const VERIFIABLE_ENTITY_KINDS = [
  "tradition",
  "concept",
  "relationship",
  "source",
  "asset",
] as const;
export type VerifiableEntityKind = (typeof VERIFIABLE_ENTITY_KINDS)[number];

// ---------------------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------------------

export const SNAPSHOT_STATUSES = ["draft", "published"] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUSES)[number];

export const SNAPSHOT_ITEM_KINDS = [
  "tradition",
  "category",
  "concept",
  "relationship_type",
  "relationship",
  "source",
  "claim",
  "asset",
] as const;
export type SnapshotItemKind = (typeof SNAPSHOT_ITEM_KINDS)[number];

export const RELEASE_STATUSES = ["candidate", "released", "withdrawn"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

// ---------------------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------------------

export const ASSET_KINDS = ["image", "video", "audio", "model_3d", "texture", "document"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_LINK_ROLES = [
  "primary",
  "illustration",
  "evidence",
  "exhibit_model",
  "thumbnail",
] as const;
export type AssetLinkRole = (typeof ASSET_LINK_ROLES)[number];

export const MEDIA_CANDIDATE_STATUSES = ["candidate", "approved", "rejected", "imported"] as const;
export type MediaCandidateStatus = (typeof MEDIA_CANDIDATE_STATUSES)[number];

// ---------------------------------------------------------------------------------------
// Spatial
// ---------------------------------------------------------------------------------------

export const RULE_SET_STATUSES = ["draft", "frozen"] as const;
export type RuleSetStatus = (typeof RULE_SET_STATUSES)[number];

export const MANIFEST_STATUSES = ["draft", "valid", "invalid", "published", "superseded"] as const;
export type ManifestStatus = (typeof MANIFEST_STATUSES)[number];

export const SPATIAL_ELEMENT_KINDS = [
  "zone",
  "room",
  "exhibit",
  "station",
  "path",
  "portal",
  "landmark",
  "label",
  "cue",
] as const;
export type SpatialElementKind = (typeof SPATIAL_ELEMENT_KINDS)[number];

// ---------------------------------------------------------------------------------------
// Study
// ---------------------------------------------------------------------------------------

export const STUDY_DESIGNS = ["between", "within"] as const;
export type StudyDesign = (typeof STUDY_DESIGNS)[number];

export const STUDY_STATUSES = ["draft", "active", "closed"] as const;
export type StudyStatus = (typeof STUDY_STATUSES)[number];

/** The two experimental interfaces. */
export const CONDITION_INTERFACES = ["conventional_2d", "immersive_3d"] as const;
export type ConditionInterface = (typeof CONDITION_INTERFACES)[number];

export const PARTICIPANT_STATUSES = ["enrolled", "active", "completed", "withdrawn", "excluded"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const CONSENT_DECISIONS = ["granted", "declined", "withdrawn"] as const;
export type ConsentDecision = (typeof CONSENT_DECISIONS)[number];

export const ALLOCATION_ALGORITHMS = [
  "simple",
  "block",
  "stratified_block",
  "counterbalanced",
  "manual",
] as const;
export type AllocationAlgorithm = (typeof ALLOCATION_ALGORITHMS)[number];

export const SESSION_STATUSES = ["scheduled", "in_progress", "completed", "abandoned"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const DEVIATION_SEVERITIES = ["minor", "major"] as const;
export type DeviationSeverity = (typeof DEVIATION_SEVERITIES)[number];

export const STUDY_PHASES = ["pre", "learning", "post", "follow_up"] as const;
export type StudyPhase = (typeof STUDY_PHASES)[number];

// ---------------------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------------------

export const ASSESSMENT_KINDS = [
  "pretest",
  "posttest",
  "reconstruction",
  "transfer",
  "questionnaire",
] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_ITEM_KINDS = [
  "single_choice",
  "multiple_choice",
  "short_text",
  "long_text",
  "likert",
  "numeric",
  "ranking",
  "concept_map",
] as const;
export type AssessmentItemKind = (typeof ASSESSMENT_ITEM_KINDS)[number];

export const RESPONSE_STATUSES = ["answered", "skipped", "timed_out"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const LOCKABLE_STATUSES = ["draft", "locked"] as const;
export type LockableStatus = (typeof LOCKABLE_STATUSES)[number];

export const REFERENCE_MAP_STATUSES = ["draft", "adjudicated", "locked"] as const;
export type ReferenceMapStatus = (typeof REFERENCE_MAP_STATUSES)[number];

export const RATER_ROLES = ["rater", "adjudicator"] as const;
export type RaterRole = (typeof RATER_ROLES)[number];

export const CONCEPT_MAP_PHASES = ["pre", "post"] as const;
export type ConceptMapPhase = (typeof CONCEPT_MAP_PHASES)[number];

// ---------------------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------------------

export const EVENT_SCOPES = ["both", "conventional_2d", "immersive_3d"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export const BATCH_STATUSES = ["accepted", "partial", "rejected"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const SEQUENCE_ANOMALY_KINDS = ["gap", "duplicate", "out_of_order"] as const;
export type SequenceAnomalyKind = (typeof SEQUENCE_ANOMALY_KINDS)[number];
