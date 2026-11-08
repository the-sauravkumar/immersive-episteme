import type { ExposureLayer } from "@/features/telemetry/contracts";
import type { ConceptType, KnowledgeCategoryCode } from "@/lib/validation/enums";

export const CONCEPT_TYPE_LABELS: Record<ConceptType, string> = {
  tradition: "Tradition",
  material: "Material",
  tool: "Tool",
  process_stage: "Process stage",
  artisan_decision: "Artisan decision",
  design_principle: "Design principle",
  outcome: "Outcome",
  scientific_mechanism: "Scientific mechanism",
  environmental_condition: "Environmental condition",
  comparison: "Comparison",
  explanation: "Explanation",
  historical_context: "Historical context",
  open_question: "Open question",
};

export const CATEGORY_LABELS: Record<KnowledgeCategoryCode, string> = {
  tradition_identity: "Tradition identity",
  geography_history: "Geography and history",
  artisan_knowledge: "Artisan knowledge",
  tacit_decisions: "Tacit decisions",
  materials: "Materials",
  tools: "Tools",
  process_stages: "Process stages",
  design_principles: "Design principles",
  production_outcomes: "Production outcomes",
  scientific_mechanisms: "Scientific mechanisms",
  environmental_conditions: "Environmental conditions",
  cross_tradition_comparisons: "Cross-tradition comparisons",
  supporting_evidence: "Supporting evidence",
  open_questions: "Open questions",
};

export const SEMANTICS_LABELS = {
  causal: "Causes and effects",
  sequential: "Sequence",
  associative: "Associated with",
  compositional: "Parts and uses",
  explanatory: "Explanations",
  comparative: "Comparisons",
} as const;

export function exposureLayerOf(type: ConceptType): ExposureLayer {
  switch (type) {
    case "artisan_decision":
      return "artisan";
    case "process_stage":
      return "process";
    case "scientific_mechanism":
    case "explanation":
      return "science";
    case "comparison":
      return "comparison";
    default:
      return "overview";
  }
}

export const humanise = (code: string) => code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, " ");

export const KNOWLEDGE_LAYERS = [
  { id: "overview", label: "Overview" },
  { id: "artisan", label: "Artisan" },
  { id: "process", label: "Process" },
  { id: "science", label: "Science" },
  { id: "comparison", label: "Compare" },
] as const;

export type KnowledgeLayerId = (typeof KNOWLEDGE_LAYERS)[number]["id"];

export const KNOWLEDGE_LAYER_LABELS: Record<KnowledgeLayerId, string> = Object.fromEntries(KNOWLEDGE_LAYERS.map((l) => [l.id, l.label])) as Record<KnowledgeLayerId, string>;

export function orderLayers(ids: Iterable<string>): KnowledgeLayerId[] {
  const set = new Set(ids);
  return KNOWLEDGE_LAYERS.map((l) => l.id).filter((id) => set.has(id));
}

export const CANONICAL_TRADITION_SLUGS = ["ajrakh", "bagh", "bagru", "dabu", "machilipatnam-kalamkari", "sanganeri"] as const;

export const STUDY_TRADITION_SLUGS = ["ajrakh", "machilipatnam-kalamkari", "sanganeri"] as const;

const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

export function compareTraditions(a: { name: string; slug?: string }, b: { name: string; slug?: string }): number {
  return nameCollator.compare(a.name, b.name) || nameCollator.compare(a.slug ?? "", b.slug ?? "");
}

export function inCanonicalOrder<T extends { name: string; slug?: string }>(items: readonly T[]): T[] {
  return [...items].sort(compareTraditions);
}

export function canonicalSlugIndex(slug: string): number {
  const i = (CANONICAL_TRADITION_SLUGS as readonly string[]).indexOf(slug);
  return i === -1 ? CANONICAL_TRADITION_SLUGS.length : i;
}

export function compareTraditionSlugs(a: string, b: string): number {
  return canonicalSlugIndex(a) - canonicalSlugIndex(b) || nameCollator.compare(a, b);
}

