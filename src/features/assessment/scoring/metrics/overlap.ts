/**
 * Set-overlap measures at each match level. Edges are projected to their level key and
 * de-duplicated, so at "undirected_unlabelled" A->B and B->A are one item.
 *
 *   P = participant keys (in scope, distinct)     E = expected reference keys
 *   O = optional/uncertain reference keys not in E
 *   X = out-of-scope participant edges, only when outOfScopeEdges = "count_as_incorrect"
 *
 *   optionalMatch = "valid":   precision = |P ∩ (E ∪ O)| / (|P| + X)
 *   optionalMatch = "neutral": precision = |(P \ O) ∩ E| / (|P \ O| + X)
 *   recall  = |P ∩ E| / |E|
 *   F1      = 2·p·r / (p + r); 0 when p + r = 0; 0 when P is empty and E is not;
 *             null when recall is undefined (E empty)
 *   Jaccard = |P' ∩ E| / (|P' ∪ E| + X), with P' = P \ O (optional matches neither help nor hurt)
 */
import { cmp, MATCH_LEVELS, type MatchLevel, type ScoringConfig } from "../config";
import type { PreparedReference } from "../match";
import type { CanonicalEdge, ScoreItem } from "../types";
import { LEVEL_SUFFIX, ratio, scoreItem } from "./registry";

export interface OverlapCounts {
  level: MatchLevel;
  participant: string[];
  expected: string[];
  optional: string[];
  outOfScopeIncorrect: number;
}

export function overlapSets(
  kept: ReadonlyArray<CanonicalEdge>,
  ref: PreparedReference,
  level: MatchLevel,
  outOfScopeIncorrect: number,
): OverlapCounts {
  const participant = [...new Set(kept.map((e) => e.keys[level]))].sort(cmp);
  const expectedSet = new Set(ref.edges.filter((e) => e.expected).map((e) => e.keys[level]));
  const optional = [...new Set(ref.edges.filter((e) => !e.expected).map((e) => e.keys[level]))].filter((k) => !expectedSet.has(k)).sort(cmp);
  return { level, participant, expected: [...expectedSet].sort(cmp), optional, outOfScopeIncorrect };
}

export function overlapMetrics(sets: OverlapCounts, config: ScoringConfig, parameters: Record<string, unknown>): ScoreItem[] {
  const E = new Set(sets.expected);
  const O = new Set(sets.optional);
  const X = sets.outOfScopeIncorrect;
  const Pall = sets.participant;
  const Pnon = Pall.filter((k) => !O.has(k));
  const hitsExpected = Pall.filter((k) => E.has(k));
  const hitsOptional = Pall.filter((k) => O.has(k));
  const unmatched = Pall.filter((k) => !E.has(k) && !O.has(k));
  const missed = sets.expected.filter((k) => !Pall.includes(k));

  const neutral = config.optionalMatch === "neutral";
  const precNum = neutral ? hitsExpected.length : hitsExpected.length + hitsOptional.length;
  const precDen = (neutral ? Pnon.length : Pall.length) + X;
  const precision = ratio(precNum, precDen);
  const recall = ratio(hitsExpected.length, E.size);
  let f1: number | null;
  if (recall === null) f1 = null;
  else if (precision === null) f1 = 0;
  else f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const unionSize = new Set([...Pnon, ...sets.expected]).size + X;
  const jaccard = ratio(hitsExpected.length, unionSize);

  const s = LEVEL_SUFFIX[sets.level];
  const details = {
    level: sets.level,
    matchedExpected: hitsExpected,
    matchedOptional: hitsOptional,
    unmatchedParticipant: unmatched,
    missedExpected: missed,
    outOfScopeCountedIncorrect: X,
  };
  return [
    scoreItem("cmap.precision", precision, parameters, { ...details, numerator: precNum, denominator: precDen }, s),
    scoreItem("cmap.recall", recall, parameters, { ...details, numerator: hitsExpected.length, denominator: E.size }, s),
    scoreItem("cmap.f1", f1, parameters, { ...details, precision, recall }, s),
    scoreItem("cmap.jaccard", jaccard, parameters, { ...details, intersection: hitsExpected.length, union: unionSize }, s),
  ];
}

export function allOverlapMetrics(
  kept: ReadonlyArray<CanonicalEdge>,
  ref: PreparedReference,
  outOfScopeIncorrect: number,
  config: ScoringConfig,
  parameters: Record<string, unknown>,
): ScoreItem[] {
  return MATCH_LEVELS.flatMap((l) => overlapMetrics(overlapSets(kept, ref, l, outOfScopeIncorrect), config, parameters));
}
