/**
 * Rule catalogue: every integrity issue has a stable code and a fixed severity. Codes are
 * never reused or renumbered; retire a rule by marking it, not by deleting its code.
 * Documented in docs/architecture/knowledge-graph-validation.md.
 */
import type { Severity } from "./types";

export interface RuleDefinition {
  code: string;
  severity: Severity;
  title: string;
}

const r = (code: string, severity: Severity, title: string): RuleDefinition => ({ code, severity, title });

export const RULES = {
  // 1xx entities and files
  FILE_SCHEMA: r("KG100", "error", "File does not satisfy the FORMAT v1 contract"),
  FILE_UNREADABLE: r("KG101", "error", "File is not readable JSON"),
  DUPLICATE_PACKAGE: r("KG102", "error", "Two files declare the same slug"),
  DUPLICATE_CONCEPT_KEY: r("KG103", "error", "Concept key defined in more than one file"),
  KEY_NAMESPACE: r("KG104", "error", "Concept key namespace differs from its file slug"),
  DEMO_IN_REAL: r("KG105", "error", "Demo marker in real content"),
  TRADITION_CONCEPT: r("KG107", "warning", "Tradition file without exactly one tradition concept"),
  COMPARISON_ARITY: r("KG108", "warning", "Comparison concept compares fewer than two concepts"),
  COMPARES_UNKNOWN: r("KG109", "error", "Comparison names an unknown concept"),
  MEDIA_DEPICTS_UNKNOWN: r("KG110", "warning", "Media candidate depicts an unknown concept"),
  // 2xx relationships
  UNKNOWN_TYPE: r("KG200", "error", "Relationship type not in the registry"),
  MISSING_ENDPOINT: r("KG201", "error", "Relationship endpoint does not exist"),
  SELF_LOOP: r("KG202", "error", "Relationship links a concept to itself"),
  DUPLICATE_EDGE: r("KG203", "error", "Duplicate typed edge"),
  UNDIRECTED_REVERSE: r("KG204", "error", "Undirected type stated in both directions"),
  ORDINAL_UNORDERED: r("KG205", "error", "Ordinal on a type that is not ordered"),
  ACCEPTED_EDGE_ENDPOINT: r("KG206", "error", "Accepted relationship has an unaccepted endpoint"),
  // 3xx cycles and process structure
  CYCLE_ACYCLIC_TYPE: r("KG300", "error", "Cycle in a type that forbids cycles"),
  PRECEDES_CYCLE: r("KG301", "error", "PRECEDES cycle without a marked loop edge"),
  PRECEDES_LOOP: r("KG302", "info", "PRECEDES loop closed by a marked loop edge"),
  DEPENDENCY_CYCLE: r("KG303", "error", "Cycle in the DEPENDS_ON/REQUIRES dependency graph"),
  ORDINAL_DUPLICATE: r("KG310", "error", "Duplicate PRECEDES ordinal within one chain"),
  ORDINAL_GAP: r("KG311", "error", "PRECEDES ordinals in a chain are not contiguous 1..n"),
  CHAIN_BREAK: r("KG312", "warning", "Ordered PRECEDES chain is not continuous"),
  FORK_WITHOUT_CONDITIONS: r("KG313", "error", "Process fork without conditions"),
  PRECEDES_UNORDINALLED: r("KG314", "info", "PRECEDES edge outside the ordered chain"),
  PRECEDES_NON_STAGE: r("KG315", "info", "PRECEDES between concepts that are not process stages"),
  STAGE_OUTSIDE_SEQUENCE: r("KG316", "warning", "Process stage not in any sequence or dependency"),
  // 4xx provenance
  CONCEPT_NO_CLAIMS: r("KG400", "error", "Concept has no claims"),
  CLAIM_NO_SOURCE: r("KG401", "error", "Claim cites no source"),
  CLAIM_UNKNOWN_SOURCE: r("KG402", "error", "Claim cites an unknown source"),
  REL_NO_EVIDENCE: r("KG403", "error", "Relationship type requires evidence but cites no source"),
  REL_UNKNOWN_SOURCE: r("KG404", "error", "Relationship cites an unknown source"),
  CAUSES_WITHOUT_DIRECT_EVIDENCE: r("KG405", "error", "CAUSES without direct evidence"),
  CAUSES_LOW_RELIABILITY: r("KG406", "warning", "CAUSES supported only by low-reliability sources"),
  CLAIM_LOW_RELIABILITY: r("KG407", "info", "Claim supported only by low-reliability sources"),
  SOURCE_UNCITED: r("KG408", "info", "Source is never cited"),
  SOURCE_NOT_ARCHIVED: r("KG409", "warning", "Source URL missing from the source manifest"),
  QUALIFIED_SOURCE_MISMATCH: r("KG410", "warning", "Qualified source id does not match its origin file"),
  GI_UNKNOWN_SOURCE: r("KG411", "error", "GI record cites an unknown source"),
  // 5xx duplicates
  DUPLICATE_TITLE: r("KG500", "error", "Same title and type twice in one file"),
  NEAR_DUPLICATE_TITLE: r("KG501", "warning", "Near-duplicate titles of the same type in one file"),
  DUPLICATE_CLAIM: r("KG502", "warning", "Same claim text twice in one concept"),
  // 6xx claims-only prose
  SUMMARY_NOT_FROM_CLAIMS: r("KG600", "error", "Summary is not the first claim (claims-only policy)"),
  BODY_NOT_FROM_CLAIMS: r("KG601", "error", "body_md is not derived from claims (claims-only policy)"),
  PROSE_NOT_DERIVABLE: r("KG602", "warning", "Free prose not derivable from claims"),
  // 7xx never collapse semantics
  SEMANTICS_WORDING_MIX: r("KG700", "warning", "Explanation wording belongs to another semantics class"),
  MULTI_SEMANTICS_PAIR: r("KG701", "info", "Concept pair linked by several semantics classes"),
  // 8xx orphans and coverage
  ORPHAN: r("KG800", "warning", "Concept has no relationships"),
  BELONGS_ONLY: r("KG801", "info", "Concept is attached only by BELONGS_TO"),
  COVERAGE_BELOW_TARGET: r("KG802", "info", "Tradition below a FORMAT.md depth target"),
} as const satisfies Record<string, RuleDefinition>;

export type RuleName = keyof typeof RULES;

/** Why a snapshot was refused (snapshot builder, not graph integrity). */
export const SNAPSHOT_REFUSALS = {
  ERRORS_PRESENT: "SNAP001",
  UNACCEPTED_CONTENT: "SNAP002",
  BUNDLE_INVALID: "SNAP003",
  DEMO_CONTENT: "SNAP004",
} as const;

export const ALL_RULES: readonly RuleDefinition[] = Object.values(RULES).sort((a, b) => (a.code < b.code ? -1 : 1));
