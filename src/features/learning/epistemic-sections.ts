import { KNOWLEDGE_SECTIONS, sectionOfType as sharedSectionOfType, type KnowledgeSection } from "@/features/learning/sections";
import type { ConceptType } from "@/lib/validation/enums";

export type EpistemicSection = KnowledgeSection;

export const EPISTEMIC_SECTIONS = KNOWLEDGE_SECTIONS;

export function sectionOfType(type: ConceptType): EpistemicSection {
  return sharedSectionOfType(type);
}
