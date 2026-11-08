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

export const ACCEPTED_STATES = ["verified", "published"] as const satisfies readonly VerificationState[];

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

export const RELATIONSHIP_SEMANTICS = [
  "causal",
  "sequential",
  "associative",
  "compositional",
  "explanatory",
  "comparative",
] as const;
export type RelationshipSemantics = (typeof RELATIONSHIP_SEMANTICS)[number];

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

export const VERIFIABLE_ENTITY_KINDS = [
  "tradition",
  "concept",
  "relationship",
  "source",
  "asset",
] as const;

export const SNAPSHOT_STATUSES = ["draft", "published"] as const;

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

export const RELEASE_STATUSES = ["candidate", "released", "withdrawn"] as const;

export const ASSET_KINDS = ["image", "video", "audio", "model_3d", "texture", "document"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_LINK_ROLES = [
  "primary",
  "illustration",
  "evidence",
  "exhibit_model",
  "thumbnail",
] as const;

export const MEDIA_CANDIDATE_STATUSES = ["candidate", "approved", "rejected", "imported"] as const;

export const RULE_SET_STATUSES = ["draft", "frozen"] as const;

export const MANIFEST_STATUSES = ["draft", "valid", "invalid", "published", "superseded"] as const;

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

export const STUDY_DESIGNS = ["between"] as const;

export const STUDY_STATUSES = ["draft", "active", "closed"] as const;

export const CONDITION_INTERFACES = ["conventional_2d", "immersive_3d"] as const;
export type ConditionInterface = (typeof CONDITION_INTERFACES)[number];

export const PARTICIPANT_STATUSES = ["enrolled", "active", "completed", "withdrawn", "excluded"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const CONSENT_DECISIONS = ["granted", "declined", "withdrawn"] as const;

export const ALLOCATION_ALGORITHMS = [
  "simple",
  "block",
  "stratified_block",
  "counterbalanced",
  "manual",
] as const;

export const SESSION_STATUSES = ["scheduled", "in_progress", "completed", "abandoned"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const DEVIATION_SEVERITIES = ["minor", "major"] as const;

export const STUDY_PHASES = ["pre", "learning", "post", "follow_up"] as const;

export const ASSESSMENT_KINDS = [
  "pretest",
  "posttest",
  "reconstruction",
  "transfer",
  "questionnaire",
  "sketch",
] as const;

export const ASSESSMENT_ITEM_KINDS = [
  "single_choice",
  "multiple_choice",
  "short_text",
  "long_text",
  "likert",
  "numeric",
  "ranking",
  "concept_map",
  "matching",
  "sketch",
] as const;

export const RESPONSE_STATUSES = ["answered", "skipped", "timed_out"] as const;

export const LOCKABLE_STATUSES = ["draft", "locked"] as const;

export const REFERENCE_MAP_STATUSES = ["draft", "adjudicated", "locked"] as const;

export const RATER_ROLES = ["rater", "adjudicator"] as const;

export const CONCEPT_MAP_PHASES = ["pre", "post"] as const;

export const EVENT_SCOPES = ["both", "conventional_2d", "immersive_3d"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export const BATCH_STATUSES = ["accepted", "partial", "rejected"] as const;

export const SEQUENCE_ANOMALY_KINDS = ["gap", "duplicate", "out_of_order"] as const;
