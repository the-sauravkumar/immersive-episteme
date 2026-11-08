import { cmp } from "../config";
import { atLeast } from "../match";
import type { ParticipantEdgeBreakdown, ReferenceEdgeBreakdown, ScoreItem } from "../types";
import { ratio, scoreItem } from "./registry";

const keysOf = (edges: ParticipantEdgeBreakdown[]) => edges.map((e) => e.edgeKey).sort(cmp);

export function validRelationships(edges: ParticipantEdgeBreakdown[], parameters: Record<string, unknown>): ScoreItem {
  const valid = edges.filter((e) => e.valid);
  return scoreItem("cmap.valid_relationships", valid.length, parameters, {
    edges: keysOf(valid),
    viaOptionalMatch: keysOf(valid.filter((e) => e.matchAtValidityLevel === "optional_only")),
  });
}

export function incorrectRelationships(edges: ParticipantEdgeBreakdown[], parameters: Record<string, unknown>): ScoreItem {
  const bad = edges.filter((e) => e.incorrect);
  const byClass: Record<string, string[]> = {};
  for (const e of bad) (byClass[e.class] ??= []).push(e.edgeKey);
  for (const k of Object.keys(byClass)) byClass[k]?.sort(cmp);
  const excluded = edges.filter((e) => !e.valid && !e.incorrect);
  return scoreItem("cmap.incorrect_relationships", bad.length, parameters, {
    edges: keysOf(bad),
    byClass,
    notCounted: keysOf(excluded),
  });
}

export function missingExpectedRelationships(refs: ReferenceEdgeBreakdown[], parameters: Record<string, unknown>): ScoreItem {
  const expected = refs.filter((r) => r.status === "expected");
  const missing = expected.filter((r) => r.missing);
  return scoreItem("cmap.missing_expected_relationships", missing.length, parameters, {
    expectedCount: expected.length,
    missing: missing.map((r) => ({ key: r.canonicalKey, partialMatchLevel: r.matchedLevel })),
    notCountedOptional: refs.filter((r) => r.status !== "expected").map((r) => r.canonicalKey),
  });
}

function inScope(edges: ParticipantEdgeBreakdown[]) {
  return edges.filter((e) => e.class !== "out_of_scope" && e.class !== "duplicate");
}

export function directionCorrectness(edges: ParticipantEdgeBreakdown[], parameters: Record<string, unknown>): ScoreItem {
  const denom = inScope(edges).filter((e) => atLeast(e.matchedLevel, "undirected_unlabelled"));
  const num = denom.filter((e) => atLeast(e.matchedLevel, "directed_unlabelled"));
  return scoreItem("cmap.direction_correctness", ratio(num.length, denom.length), parameters, {
    numerator: num.length,
    denominator: denom.length,
    correctDirection: keysOf(num),
    wrongDirection: keysOf(denom.filter((e) => !num.includes(e))),
  });
}

export function typeCorrectness(edges: ParticipantEdgeBreakdown[], parameters: Record<string, unknown>): ScoreItem {
  const denom = inScope(edges).filter((e) => atLeast(e.matchedLevel, "directed_unlabelled"));
  const num = denom.filter((e) => e.matchedLevel === "directed_labelled");
  return scoreItem("cmap.type_correctness", ratio(num.length, denom.length), parameters, {
    numerator: num.length,
    denominator: denom.length,
    correctType: keysOf(num),
    wrongType: keysOf(denom.filter((e) => !num.includes(e))),
  });
}
