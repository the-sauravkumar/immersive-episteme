/**
 * Reference data (NOT demo data): the 14 knowledge categories, the relationship-type
 * registry and the telemetry event-type registry. These are vocabulary, not craft facts, and
 * they are needed by real content as much as by demo content.
 */
import type { KnowledgeCategoryCode } from "../../src/lib/validation/enums";
import type { RelationshipTypeDefinition } from "../../src/features/knowledge/contracts";

export { EVENT_TYPE_REGISTRY } from "../../src/features/telemetry/contracts";

/**
 * Template groups = the seven-part common epistemic template (requirements digest §3), plus
 * `cross_cutting` for evidence and open questions, which apply to every group.
 */
export const KNOWLEDGE_CATEGORIES: readonly {
  code: KnowledgeCategoryCode;
  label: string;
  description: string;
  templateGroup: string;
}[] = [
  { code: "tradition_identity", label: "Tradition identity", description: "What the tradition is, what it is called and who practises it.", templateGroup: "tradition_context" },
  { code: "geography_history", label: "Geography and history", description: "Where the tradition is practised and how it developed over time.", templateGroup: "tradition_context" },
  { code: "artisan_knowledge", label: "Artisan knowledge", description: "Knowledge held and explained by practitioners.", templateGroup: "artisan_decisions" },
  { code: "tacit_decisions", label: "Tacit decisions", description: "Experience-based judgements made during production.", templateGroup: "artisan_decisions" },
  { code: "materials", label: "Materials", description: "Substances used in production and their roles.", templateGroup: "materials_tools" },
  { code: "tools", label: "Tools", description: "Implements and equipment used in production.", templateGroup: "materials_tools" },
  { code: "process_stages", label: "Process stages", description: "Ordered production stages and their dependencies.", templateGroup: "process_sequence" },
  { code: "design_principles", label: "Design principles", description: "Design choices, motifs and composition rules.", templateGroup: "design_outcomes" },
  { code: "production_outcomes", label: "Production outcomes", description: "Material or visual results of the process.", templateGroup: "design_outcomes" },
  { code: "scientific_mechanisms", label: "Scientific mechanisms", description: "Scientific or technological explanations of what happens in the process.", templateGroup: "science_technology" },
  { code: "environmental_conditions", label: "Environmental conditions", description: "Water, climate and other conditions that affect outcomes.", templateGroup: "science_technology" },
  { code: "cross_tradition_comparisons", label: "Cross-tradition comparisons", description: "Similarities and differences between traditions.", templateGroup: "cross_tradition_comparison" },
  { code: "supporting_evidence", label: "Supporting evidence", description: "Records that document or support other knowledge.", templateGroup: "cross_cutting" },
  { code: "open_questions", label: "Open questions", description: "Unresolved or contested questions.", templateGroup: "cross_cutting" },
];

/**
 * Relationship-type registry. The 14 FORMAT.md v1 types are `isCore`. ASSOCIATED_WITH is the
 * one associative type (spec §6.4 "belongs to or is associated with"). Cycle rules:
 * PRECEDES allows cycles because real process content contains repeat loops (a resist/dye
 * cycle returns to an earlier stage); BELONGS_TO and DEPENDS_ON must stay acyclic.
 */
export const RELATIONSHIP_TYPES: readonly RelationshipTypeDefinition[] = [
  { code: "BELONGS_TO", label: "belongs to", inverseLabel: "includes", description: "A concept is part of a tradition or a larger whole.", semantics: "compositional", directed: true, allowsCycles: false, ordered: false, requiresEvidence: true, isCore: true },
  { code: "USES", label: "uses", inverseLabel: "is used in", description: "A process or tradition uses a material or tool.", semantics: "compositional", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "REQUIRES", label: "requires", inverseLabel: "is required by", description: "A stage or outcome cannot happen without an input or condition.", semantics: "compositional", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "PRECEDES", label: "precedes", inverseLabel: "follows", description: "An earlier process stage comes before a later one (ordinal gives the position).", semantics: "sequential", directed: true, allowsCycles: true, ordered: true, requiresEvidence: true, isCore: true },
  { code: "DEPENDS_ON", label: "depends on", inverseLabel: "is a prerequisite for", description: "A stage depends on an earlier stage having been completed.", semantics: "sequential", directed: true, allowsCycles: false, ordered: false, requiresEvidence: true, isCore: true },
  { code: "PRODUCES", label: "produces", inverseLabel: "is produced by", description: "A stage or material produces an outcome.", semantics: "causal", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "CAUSES", label: "causes", inverseLabel: "is caused by", description: "Direct causal effect; only with direct evidence (otherwise ENABLES or AFFECTED_BY).", semantics: "causal", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "ENABLES", label: "enables", inverseLabel: "is enabled by", description: "Makes an outcome or stage possible without fully determining it.", semantics: "causal", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "AFFECTED_BY", label: "is affected by", inverseLabel: "affects", description: "An outcome or stage is influenced by a condition.", semantics: "causal", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "EXPLAINS", label: "explains", inverseLabel: "is explained by", description: "An explanation accounts for an observed result.", semantics: "explanatory", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "PRACTITIONER_EXPLAINS", label: "practitioner explains", inverseLabel: "is explained by practitioners as", description: "Connects an artisan explanation to a process or result.", semantics: "explanatory", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "SCIENTIFICALLY_EXPLAINED_BY", label: "is scientifically explained by", inverseLabel: "scientifically explains", description: "Connects a process or result to a scientific mechanism.", semantics: "explanatory", directed: true, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "SIMILAR_TO", label: "is similar to", inverseLabel: null, description: "Two concepts (often from different traditions) resemble each other.", semantics: "comparative", directed: false, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "CONTRASTS_WITH", label: "contrasts with", inverseLabel: null, description: "Two concepts (often from different traditions) differ in a stated way.", semantics: "comparative", directed: false, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: true },
  { code: "ASSOCIATED_WITH", label: "is associated with", inverseLabel: null, description: "A documented association that is neither causal, sequential nor compositional.", semantics: "associative", directed: false, allowsCycles: true, ordered: false, requiresEvidence: true, isCore: false },
];
