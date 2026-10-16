/**
 * Metric names and versions. Bump a metric's version whenever its definition, defaults or
 * edge cases change, so stored derived_scores stay attributable (names follow the
 * derived_scores.metric_name CHECK: ^[a-z][a-z0-9_.]{0,63}$).
 */
import type { MatchLevel } from "../config";
import type { ScoreItem } from "../types";

/*
 * 1.1.0 (final review scoring-05, -06): optionalMatch now defaults to "neutral", which changes the
 * default output of every metric built on valid edges or on precision (valid_relationships,
 * cross_category.valid, causal_chain_depth, precision, f1); cross_category.valid_normalised and
 * causal_chain_depth_normalised are now coverage proportions bounded by 1.
 */
export const METRIC_VERSIONS = {
  "cmap.valid_relationships": "1.1.0",
  "cmap.incorrect_relationships": "1.0.0",
  "cmap.missing_expected_relationships": "1.0.0",
  "cmap.direction_correctness": "1.0.0",
  "cmap.type_correctness": "1.0.0",
  "cmap.cross_category.total": "1.0.0",
  "cmap.cross_category.valid": "1.1.0",
  "cmap.cross_category.valid_normalised": "1.1.0",
  "cmap.causal_chain_depth": "1.1.0",
  "cmap.causal_chain_depth_normalised": "1.1.0",
  "cmap.precision": "1.1.0",
  "cmap.recall": "1.0.0",
  "cmap.f1": "1.1.0",
  "cmap.jaccard": "1.0.0",
  "cmap.degree_profile_similarity": "1.0.0",
  "cmap.edit_distance": "1.0.0",
  "cmap.edit_distance_normalised": "1.0.0",
  "cmap.change": "1.0.0",
  "cmap.rater_agreement": "1.0.0",
  "cmap.consensus": "1.0.0",
} as const;
export type MetricFamily = keyof typeof METRIC_VERSIONS;

/** Short level suffixes used in metric names, e.g. cmap.f1.dl. */
export const LEVEL_SUFFIX: Record<MatchLevel, string> = {
  undirected_unlabelled: "uu",
  directed_unlabelled: "du",
  directed_labelled: "dl",
};

export function scoreItem(
  family: MetricFamily,
  value: number | null,
  parameters: Record<string, unknown>,
  details: Record<string, unknown>,
  nameSuffix?: string,
): ScoreItem {
  return {
    metricName: nameSuffix ? `${family}.${nameSuffix}` : family,
    metricVersion: METRIC_VERSIONS[family],
    value: value === null || Number.isFinite(value) ? value : null,
    parameters,
    details,
  };
}

/** a / b, or null when b is 0. */
export function ratio(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}
