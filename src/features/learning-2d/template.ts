/**
 * The common epistemic template (requirements digest §3; master spec §6.2) as the 2D section
 * order. Every tradition page renders the same sections in the same order, so traditions are
 * presented identically and no section is promoted for one tradition only.
 *
 * Section order follows the 2D task brief: context, materials and tools, process, artisan
 * decisions, design principles, outcomes, science, environmental conditions, comparisons, open
 * questions. Section titles are interface labels, not craft content. The labels and the exposure
 * layer rule shared with the 3D museum live in src/features/learning/labels.ts.
 *
 * Client-safe (pure data).
 */
import type { ConceptType } from "@/lib/validation/enums";

export interface EpistemicSection {
  /** Stable id: DOM anchor and telemetry `layerId` (`section:<id>`). */
  id: string;
  title: string;
  /** Concept types listed in this section, in this order. */
  types: readonly ConceptType[];
}

export const EPISTEMIC_SECTIONS = [
  { id: "context", title: "Tradition and context", types: ["historical_context"] },
  { id: "materials-tools", title: "Materials and tools", types: ["material", "tool"] },
  { id: "process", title: "Process sequence", types: ["process_stage"] },
  { id: "artisan", title: "Artisan decisions", types: ["artisan_decision"] },
  { id: "design", title: "Design principles", types: ["design_principle"] },
  { id: "outcomes", title: "Outcomes", types: ["outcome"] },
  { id: "science", title: "Scientific explanations", types: ["scientific_mechanism", "explanation"] },
  { id: "environment", title: "Environmental conditions", types: ["environmental_condition"] },
  { id: "comparisons", title: "Comparisons", types: ["comparison"] },
  { id: "open-questions", title: "Open questions", types: ["open_question"] },
] as const satisfies readonly EpistemicSection[];

export type EpistemicSectionId = (typeof EPISTEMIC_SECTIONS)[number]["id"];

/** The section a concept type is listed under (the `tradition` overview concept opens the context section). */
export function sectionOfType(type: ConceptType): EpistemicSection {
  if (type === "tradition") return EPISTEMIC_SECTIONS[0];
  return EPISTEMIC_SECTIONS.find((s) => (s.types as readonly ConceptType[]).includes(type)) ?? EPISTEMIC_SECTIONS[0];
}
