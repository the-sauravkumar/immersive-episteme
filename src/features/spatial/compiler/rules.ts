/**
 * Rule registry: which algorithms ("strategies") the compiler supports, which spatial
 * encodings each may emit, and how a relationship is matched to exactly one primary rule.
 *
 * Resolution for a relationship r:
 *   1. candidate rules = rules whose `match.relationshipTypes` contains r.type or whose
 *      `match.semantics` contains the semantics of r.type, restricted to relationship
 *      strategies that apply to r (e.g. comparison-zone only applies across traditions);
 *   2. the primary rule is the candidate with the highest priority; ties between different
 *      strategies are a contradictory mapping (reported, then the lowest rule id wins);
 *   3. the secondary "architectural-connection" rule additionally applies whenever both
 *      endpoints sit in different rooms of the same wing.
 */
import type { MappingRule, MappingRuleSetConfig } from "@/features/spatial/contracts";
import type { RelationshipSemantics } from "@/lib/validation/enums";

import { compareStrings } from "./prng";
import type { SpatialEncoding } from "./types";

export const STRATEGIES = {
  "tradition-wing": { target: "both", encodings: ["containment", "explicit_link"], proximityOnly: true },
  "category-zone": { target: "concept", encodings: ["containment"], proximityOnly: true },
  circulation: { target: "structure", encodings: [], proximityOnly: false },
  "sequence-path": { target: "relationship", encodings: ["sequence_path"], proximityOnly: false },
  threshold: { target: "relationship", encodings: ["threshold"], proximityOnly: false },
  adjacency: { target: "relationship", encodings: ["adjacency", "explicit_link"], proximityOnly: true },
  "comparison-zone": { target: "both", encodings: ["juxtaposition"], proximityOnly: false },
  "explanation-trigger": { target: "relationship", encodings: ["explicit_link"], proximityOnly: false },
  "progressive-layer": { target: "relationship", encodings: ["layer"], proximityOnly: false },
  "architectural-connection": { target: "secondary", encodings: ["adjacency", "explicit_link"], proximityOnly: true },
} as const satisfies Record<
  string,
  { target: "concept" | "relationship" | "both" | "structure" | "secondary"; encodings: readonly SpatialEncoding[]; proximityOnly: boolean }
>;
export type StrategyId = keyof typeof STRATEGIES;

/** Strategies every rule set must provide (the layout cannot be built without them). */
export const REQUIRED_STRATEGIES: readonly StrategyId[] = ["category-zone", "circulation"];

export function strategyOf(rule: MappingRule): StrategyId | null {
  const s = rule.emit.params?.strategy;
  return typeof s === "string" && s in STRATEGIES ? (s as StrategyId) : null;
}

export interface RuleIssue {
  ruleId: string;
  message: string;
}

/** Unsupported rules: unknown strategy, encoding the strategy cannot emit, missing required strategy. */
export function unsupportedRuleIssues(config: MappingRuleSetConfig, knownTypes: ReadonlySet<string>): {
  errors: RuleIssue[];
  warnings: RuleIssue[];
} {
  const errors: RuleIssue[] = [];
  const warnings: RuleIssue[] = [];
  for (const rule of config.rules) {
    const raw = rule.emit.params?.strategy;
    const strategy = strategyOf(rule);
    if (!strategy) {
      errors.push({ ruleId: rule.id, message: `Unsupported strategy ${JSON.stringify(raw ?? null)}` });
      continue;
    }
    const allowed = STRATEGIES[strategy].encodings as readonly string[];
    if (rule.emit.encoding && !allowed.includes(rule.emit.encoding)) {
      errors.push({ ruleId: rule.id, message: `Strategy ${strategy} cannot emit encoding ${rule.emit.encoding}` });
    }
    for (const t of rule.match.relationshipTypes ?? []) {
      if (!knownTypes.has(t)) warnings.push({ ruleId: rule.id, message: `Matches relationship type ${t}, which the snapshot does not define` });
    }
  }
  for (const s of REQUIRED_STRATEGIES) {
    if (!config.rules.some((r) => strategyOf(r) === s)) errors.push({ ruleId: "(rule set)", message: `No rule provides the required strategy ${s}` });
  }
  return { errors, warnings };
}

export function rulesWithStrategy(config: MappingRuleSetConfig, strategy: StrategyId): MappingRule[] {
  return config.rules.filter((r) => strategyOf(r) === strategy).sort((a, b) => b.priority - a.priority || compareStrings(a.id, b.id));
}

/** `minTraditions` when the rule set's comparison-zone rule does not set it. */
export const DEFAULT_COMPARISON_MIN_TRADITIONS = 2;

/**
 * How many selected traditions a tradition-less comparison concept must compare to be in the
 * study scope: the highest-priority comparison-zone rule's `minTraditions`. The compiler's scope
 * (3D) and the 2D scope checker both read it from here, from the same rule set.
 */
export function comparisonMinTraditions(config: MappingRuleSetConfig): number {
  return Number(rulesWithStrategy(config, "comparison-zone")[0]?.emit.params?.minTraditions ?? DEFAULT_COMPARISON_MIN_TRADITIONS);
}

export interface RelationshipContext {
  type: string;
  semantics: RelationshipSemantics | null;
  /** Both endpoints are placed in wings of two different traditions. */
  crossTradition: boolean;
}

function relationshipRuleMatches(rule: MappingRule, ctx: RelationshipContext): boolean {
  const byType = rule.match.relationshipTypes?.includes(ctx.type) ?? false;
  const bySemantics = ctx.semantics !== null && (rule.match.semantics?.includes(ctx.semantics) ?? false);
  return byType || bySemantics;
}

function strategyApplies(strategy: StrategyId, ctx: RelationshipContext): boolean {
  switch (strategy) {
    case "comparison-zone":
      return ctx.crossTradition;
    case "category-zone":
    case "circulation":
    case "architectural-connection":
      return false;
    default:
      return true;
  }
}

export interface Resolution {
  primary: MappingRule | null;
  /** Equal-priority rules with a different strategy (contradictory mapping). */
  conflicts: MappingRule[];
}

export function resolveRelationshipRule(config: MappingRuleSetConfig, ctx: RelationshipContext): Resolution {
  const candidates = config.rules
    .filter((r) => {
      const s = strategyOf(r);
      return s !== null && relationshipRuleMatches(r, ctx) && strategyApplies(s, ctx);
    })
    .sort((a, b) => b.priority - a.priority || compareStrings(a.id, b.id));
  const primary = candidates[0] ?? null;
  if (!primary) return { primary: null, conflicts: [] };
  const conflicts = candidates.filter(
    (r) => r !== primary && r.priority === primary.priority && strategyOf(r) !== strategyOf(primary),
  );
  return { primary, conflicts };
}

/** True if this strategy would express the relationship by proximity / containment only. */
export function isProximityOnly(rule: MappingRule): boolean {
  const s = strategyOf(rule);
  return s ? STRATEGIES[s].proximityOnly : true;
}
