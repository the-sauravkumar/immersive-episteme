/**
 * Scoring configuration for concept-map reconstruction (docs/research/concept-map-scoring.md).
 *
 * Every parameter that changes a number lives here, has an explicit default, and is copied
 * verbatim into the `parameters` of every score, so a score can be recomputed from the raw
 * map, the reference map and this object alone. Defaults are engineering placeholders, not
 * study decisions: the researchers own the final values (Q-R4, Q-R18).
 */
import { z } from "zod";

import { relationshipTypeCodeSchema } from "@/lib/validation/primitives";

/** Version of the whole scoring pipeline (stored in derived_scores.pipeline_version). */
export const SCORING_PIPELINE_VERSION = "cmap-scoring@1.1.0";

/** The three edge match levels, from most lenient to strictest. */
export const MATCH_LEVELS = ["undirected_unlabelled", "directed_unlabelled", "directed_labelled"] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];
export const matchLevelSchema = z.enum(MATCH_LEVELS);

/**
 * A relationship-type equivalence: an edge `s -from-> t` is rewritten to `s -to-> t`, or to
 * `t -to-> s` when `reverse` is true (e.g. `A DEPENDS_ON B` ~ `B ENABLES A`). Applied to
 * participant, reference and rater edges alike before any matching. Empty by default.
 */
export const typeEquivalenceSchema = z
  .object({
    from: relationshipTypeCodeSchema,
    to: relationshipTypeCodeSchema,
    reverse: z.boolean().default(false),
  })
  .refine((e) => e.from !== e.to || e.reverse, { message: "A non-reversing equivalence must change the type" });
export type TypeEquivalence = z.infer<typeof typeEquivalenceSchema>;

/** Orientation of a causal type along the causal flow (AFFECTED_BY points from effect to cause). */
export const causalOrientationSchema = z.enum(["forward", "reverse"]);

export const REFERENCE_EDGE_STATUSES = ["expected", "optional", "uncertain", "disputed"] as const;
export type ReferenceEdgeStatus = (typeof REFERENCE_EDGE_STATUSES)[number];
export const referenceEdgeStatusSchema = z.enum(REFERENCE_EDGE_STATUSES);

export const scoringConfigSchema = z
  .object({
    /** Level at which a participant edge counts as a valid relationship. */
    validityLevel: matchLevelSchema.default("directed_labelled"),
    /** Synonym / equivalence rules for relationship types. Not chained: a `to` may not be a `from`. */
    typeEquivalences: z.array(typeEquivalenceSchema).default([]),
    /** Types that are symmetric whatever the editor's `directed` flag says (seed registry: directed = false). */
    undirectedTypes: z.array(relationshipTypeCodeSchema).default(["SIMILAR_TO", "CONTRASTS_WITH", "ASSOCIATED_WITH"]),
    /** Types that form causal chains, with their orientation along the causal flow. */
    causalTypes: z
      .record(relationshipTypeCodeSchema, causalOrientationSchema)
      .default({ CAUSES: "forward", ENABLES: "forward", PRODUCES: "forward", AFFECTED_BY: "reverse" }),
    /**
     * Status of a reference edge that has no explicit `status`. `required = true` always means
     * "expected"; this decides what `required = false` means. The contract documents
     * `required = false` as "acceptable-but-optional", hence the default.
     */
    nonRequiredReferenceEdgeStatus: z.enum(["expected", "optional"]).default("optional"),
    /**
     * A participant edge matching only an optional/uncertain reference edge:
     * "valid" = counts as valid (precision numerator and denominator);
     * "neutral" = removed from precision, Jaccard and edit distance entirely.
     * Never counted in recall (optional edges are never missing).
     * Default "neutral" (pipeline 1.1.0, final review scoring-06): study decision D2 and the
     * published definitions (metric-definitions.ts) say optional edges are neutral; the 1.0.0
     * default "valid" contradicted them. Every score stores the value it used.
     */
    optionalMatch: z.enum(["valid", "neutral"]).default("neutral"),
    /**
     * Participant edges with an endpoint outside the reference concept set (free nodes, unknown
     * concepts, two nodes with the same concept): excluded from scoring, or counted as incorrect.
     */
    outOfScopeEdges: z.enum(["exclude", "count_as_incorrect"]).default("exclude"),
    /** Reference edges still marked disputed: refuse to score, or treat them as optional. */
    disputedReferenceEdges: z.enum(["error", "treat_as_optional"]).default("error"),
    /** Edit-distance costs (fixed node correspondence by concept id). */
    editCosts: z
      .object({
        insert: z.number().positive().default(1),
        delete: z.number().positive().default(1),
        relabel: z.number().nonnegative().default(1),
        reverse: z.number().nonnegative().default(1),
      })
      .prefault({}),
    /** DFS step budget for the exact longest-simple-path search; exceeding it yields null. */
    causalDepthSearchBudget: z.number().int().positive().default(1_000_000),
  })
  .superRefine((c, ctx) => {
    const froms = new Set<string>();
    c.typeEquivalences.forEach((e, i) => {
      if (froms.has(e.from)) ctx.addIssue({ code: "custom", path: ["typeEquivalences", i, "from"], message: "Each type may be rewritten by one rule only" });
      froms.add(e.from);
    });
    c.typeEquivalences.forEach((e, i) => {
      if (e.from !== e.to && froms.has(e.to)) {
        ctx.addIssue({ code: "custom", path: ["typeEquivalences", i, "to"], message: "Equivalences may not chain: map every synonym directly to the canonical type" });
      }
    });
  });
export type ScoringConfig = z.output<typeof scoringConfigSchema>;
export type ScoringConfigInput = z.input<typeof scoringConfigSchema>;

/** Parse a partial configuration into a complete, validated one (throws ZodError if invalid). */
export function resolveConfig(input: ScoringConfigInput = {}): ScoringConfig {
  return scoringConfigSchema.parse(input);
}

/** A plain JSON copy of the configuration with sorted keys, for embedding into score details. */
export function configParameters(config: ScoringConfig): Record<string, unknown> {
  return sortKeysDeep({
    ...config,
    typeEquivalences: [...config.typeEquivalences].sort((a, b) => cmp(a.from, b.from)),
    undirectedTypes: [...config.undirectedTypes].sort(cmp),
  }) as Record<string, unknown>;
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort(cmp)) out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}
