/**
 * THE section map of a tradition, shared by BOTH learning conditions (DR-024): the 2D tradition
 * page, its index and rail list these sections, and the spatial compiler builds one wing room per
 * section (the cross-tradition section is the comparison hall). Same order, same names, same
 * numbers, and every concept in the same section in both, because both place a concept by its
 * TYPE through `sectionOfType` (the 3D rule set's zone groups are derived from this table).
 *
 * The order is the concept note's common epistemic template (requirements digest §3; Concept §6;
 * MP:278-286; TM:66-74): tradition and context; materials and tools; process sequence; artisan
 * decisions; design and outcomes; scientific and technological knowledge; comparison with other
 * traditions. Open questions (master spec: uncertainty is shown, not hidden) is the one addition,
 * placed with the tradition's own knowledge, so a tradition's sections are 1-7 without a gap and the
 * cross-tradition section, which spans the traditions (the museum's hall between the wings), is 8.
 *
 * Titles are interface labels, not craft content. Client-safe (pure data).
 */
import { CONCEPT_TYPES, type ConceptType, type KnowledgeCategoryCode } from "@/lib/validation/enums";

export interface KnowledgeSection {
  /** Stable id: the 2D DOM anchor (`#section-<id>`) and telemetry `layerId` (`section:<id>`). */
  id: string;
  /** 1-based number, shown in the 2D index and on the museum plan. */
  number: number;
  /** The one name of the section in both conditions (2D heading and index, 3D room plaque and plan). */
  title: string;
  /** Concept types listed in this section, in this order (the `tradition` concept is the tradition page itself; see `sectionOfType`). */
  types: readonly ConceptType[];
  /** The museum's zone group of this section: wing rooms are `room:<tradition slug>:<zoneGroup>`. */
  zoneGroup: string;
  /** "wing": one room per tradition wing; "hall": the one comparison hall shared by the wings. */
  scope: "wing" | "hall";
  /**
   * The knowledge categories that usually go with these types, in order. In 3D they only order the
   * category runs (and signs) inside the room; they never decide the room.
   */
  categories: readonly KnowledgeCategoryCode[];
}

export const KNOWLEDGE_SECTIONS = [
  { id: "context", number: 1, title: "Tradition and context", types: ["historical_context"], zoneGroup: "tradition_context", scope: "wing", categories: ["tradition_identity", "geography_history"] },
  { id: "materials-tools", number: 2, title: "Materials and tools", types: ["material", "tool"], zoneGroup: "materials_tools", scope: "wing", categories: ["materials", "tools"] },
  { id: "process", number: 3, title: "Process sequence", types: ["process_stage"], zoneGroup: "process_sequence", scope: "wing", categories: ["process_stages"] },
  { id: "artisan", number: 4, title: "Artisan decisions", types: ["artisan_decision"], zoneGroup: "artisan_decisions", scope: "wing", categories: ["artisan_knowledge", "tacit_decisions"] },
  { id: "design-outcomes", number: 5, title: "Design and outcomes", types: ["design_principle", "outcome"], zoneGroup: "design_outcomes", scope: "wing", categories: ["design_principles", "production_outcomes"] },
  {
    id: "science",
    number: 6,
    title: "Science and environment",
    types: ["scientific_mechanism", "explanation", "environmental_condition"],
    zoneGroup: "science_technology",
    scope: "wing",
    categories: ["scientific_mechanisms", "environmental_conditions"],
  },
  { id: "open-questions", number: 7, title: "Open questions", types: ["open_question"], zoneGroup: "open_questions", scope: "wing", categories: ["open_questions", "supporting_evidence"] },
  { id: "comparisons", number: 8, title: "Cross-tradition comparison", types: ["comparison"], zoneGroup: "cross_tradition_comparison", scope: "hall", categories: ["cross_tradition_comparisons"] },
] as const satisfies readonly KnowledgeSection[];

export type KnowledgeSectionId = (typeof KNOWLEDGE_SECTIONS)[number]["id"];

/** The section a concept is in, in both conditions, by its type (the `tradition` overview concept opens the context section). */
export function sectionOfType(type: ConceptType): KnowledgeSection {
  if (type === "tradition") return KNOWLEDGE_SECTIONS[0];
  return KNOWLEDGE_SECTIONS.find((s) => (s.types as readonly ConceptType[]).includes(type)) ?? KNOWLEDGE_SECTIONS[0];
}

/** Every concept type of a section, the `tradition` concept included (what the compiler places in its room). */
export function typesOfSection(section: KnowledgeSection): ConceptType[] {
  return CONCEPT_TYPES.filter((t) => sectionOfType(t).id === section.id);
}

/** The section of a museum zone group (a room's `group`), or null for rooms that are no section (lobby, shared commons). */
export function sectionOfZoneGroup(group: string | null | undefined): KnowledgeSection | null {
  return group ? (KNOWLEDGE_SECTIONS.find((s) => s.zoneGroup === group) ?? null) : null;
}
