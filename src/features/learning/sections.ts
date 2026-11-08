import type { ConceptType, KnowledgeCategoryCode } from "@/lib/validation/enums";

export interface KnowledgeSection {
  id: string;
  number: number;
  title: string;
  types: readonly ConceptType[];
  zoneGroup: string;
  scope: "wing" | "hall";
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

export function sectionOfType(type: ConceptType): KnowledgeSection {
  if (type === "tradition") return KNOWLEDGE_SECTIONS[0];
  return KNOWLEDGE_SECTIONS.find((s) => (s.types as readonly ConceptType[]).includes(type)) ?? KNOWLEDGE_SECTIONS[0];
}

