import { z } from "zod";

import { relationshipTypeCodeSchema } from "@/lib/validation/primitives";

export const SCORING_PIPELINE_VERSION = "cmap-scoring@1.1.0";

export const MATCH_LEVELS = ["undirected_unlabelled", "directed_unlabelled", "directed_labelled"] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];
const matchLevelSchema = z.enum(MATCH_LEVELS);

const typeEquivalenceSchema = z
  .object({
    from: relationshipTypeCodeSchema,
    to: relationshipTypeCodeSchema,
    reverse: z.boolean().default(false),
  })
  .refine((e) => e.from !== e.to || e.reverse, { message: "A non-reversing equivalence must change the type" });

const causalOrientationSchema = z.enum(["forward", "reverse"]);
export type ReferenceEdgeStatus = "expected" | "optional" | "uncertain" | "disputed";

export const scoringConfigSchema = z
  .object({
    validityLevel: matchLevelSchema.default("directed_labelled"),
    typeEquivalences: z.array(typeEquivalenceSchema).default([]),
    undirectedTypes: z.array(relationshipTypeCodeSchema).default(["SIMILAR_TO", "CONTRASTS_WITH", "ASSOCIATED_WITH"]),
    causalTypes: z
      .record(relationshipTypeCodeSchema, causalOrientationSchema)
      .default({ CAUSES: "forward", ENABLES: "forward", PRODUCES: "forward", AFFECTED_BY: "reverse" }),
    nonRequiredReferenceEdgeStatus: z.enum(["expected", "optional"]).default("optional"),
    optionalMatch: z.enum(["valid", "neutral"]).default("neutral"),
    outOfScopeEdges: z.enum(["exclude", "count_as_incorrect"]).default("exclude"),
    disputedReferenceEdges: z.enum(["error", "treat_as_optional"]).default("error"),
    editCosts: z
      .object({
        insert: z.number().positive().default(1),
        delete: z.number().positive().default(1),
        relabel: z.number().nonnegative().default(1),
        reverse: z.number().nonnegative().default(1),
      })
      .prefault({}),
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

export function resolveConfig(input: ScoringConfigInput = {}): ScoringConfig {
  return scoringConfigSchema.parse(input);
}

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

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort(cmp)) out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}
