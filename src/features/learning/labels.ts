/**
 * Interface labels and the exposure-layer rule SHARED by both learning conditions: the 2D pages
 * and the 3D museum (exhibit kickers, information panel, signage) import them from here, so a
 * concept carries the same type, category and relation wording, and reports the same exposure
 * layer, in both. Labels are interface text, not craft content. Client-safe (pure data).
 */
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

/**
 * The exposure layer a concept's content is reported under (EXPOSURE_LAYERS), by concept type.
 * The 2D concept page and the 3D information panel both use it for the concept on screen, so
 * per-layer exposure is comparable. Comparison concepts report `comparison` in both conditions.
 */
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

// ---------------------------------------------------------------------------------------
// Knowledge layers (DESIGN.md 9.6, 12.1 rule 2)
// ---------------------------------------------------------------------------------------

/**
 * The knowledge layers of one concept, in their ONE order, for both conditions: the shared
 * `LayerTabs` (2D concept page and 3D information panel) reads names and order only from here.
 * The ids equal the 3D panel's tab ids (`PANEL_TABS`) and the exposure layers where they overlap,
 * so telemetry keeps its existing values.
 */
export const KNOWLEDGE_LAYERS = [
  { id: "overview", label: "Overview" },
  { id: "artisan", label: "Artisan" },
  { id: "process", label: "Process" },
  { id: "science", label: "Science" },
  { id: "comparison", label: "Compare" },
] as const;

export type KnowledgeLayerId = (typeof KNOWLEDGE_LAYERS)[number]["id"];

export const KNOWLEDGE_LAYER_LABELS: Record<KnowledgeLayerId, string> = Object.fromEntries(KNOWLEDGE_LAYERS.map((l) => [l.id, l.label])) as Record<KnowledgeLayerId, string>;

/** Orders any subset of layer ids by the one canonical layer order (unknown ids dropped). */
export function orderLayers(ids: Iterable<string>): KnowledgeLayerId[] {
  const set = new Set(ids);
  return KNOWLEDGE_LAYERS.map((l) => l.id).filter((id) => set.has(id));
}

// ---------------------------------------------------------------------------------------
// Canonical tradition order (DESIGN.md 12.3 rule 12; DR-019)
// ---------------------------------------------------------------------------------------

/**
 * The canonical tradition order: alphabetical by display name, fixed and identical in both
 * conditions, on every list, table column, comparison matrix, dashboard facet and museum wing
 * sequence. It is not counterbalanced (DR-019). The slugs below are listed in that order.
 * `compareTraditions` sorts by display name, so a tradition added later still lands in its
 * alphabetical position.
 */
export const CANONICAL_TRADITION_SLUGS = ["ajrakh", "bagh", "bagru", "dabu", "machilipatnam-kalamkari", "sanganeri"] as const;

/** The three study traditions (DR-017), in the canonical order. */
export const STUDY_TRADITION_SLUGS = ["ajrakh", "machilipatnam-kalamkari", "sanganeri"] as const;

const nameCollator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Comparator for the canonical order: by display name (alphabetical), then by slug. */
export function compareTraditions(a: { name: string; slug?: string }, b: { name: string; slug?: string }): number {
  return nameCollator.compare(a.name, b.name) || nameCollator.compare(a.slug ?? "", b.slug ?? "");
}

/** A copy of `items` in the canonical tradition order. */
export function inCanonicalOrder<T extends { name: string; slug?: string }>(items: readonly T[]): T[] {
  return [...items].sort(compareTraditions);
}

/**
 * Canonical position of a tradition slug (for data that carries only slugs). Unknown slugs sort
 * after the known six, alphabetically by slug.
 */
export function canonicalSlugIndex(slug: string): number {
  const i = (CANONICAL_TRADITION_SLUGS as readonly string[]).indexOf(slug);
  return i === -1 ? CANONICAL_TRADITION_SLUGS.length : i;
}

export function compareTraditionSlugs(a: string, b: string): number {
  return canonicalSlugIndex(a) - canonicalSlugIndex(b) || nameCollator.compare(a, b);
}
