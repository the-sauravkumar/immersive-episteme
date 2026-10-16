/**
 * scoreConceptMap(participant, reference, config): the single entry point that produces every
 * concept-map score, fully itemised. Pure and deterministic: the same inputs (in any order)
 * and the same configuration always give byte-identical output.
 */
import { configParameters, resolveConfig, SCORING_PIPELINE_VERSION, type ScoringConfig, type ScoringConfigInput } from "./config";
import { classify, keptEdges, prepareParticipant, prepareReference } from "./match";
import { causalChainDepth } from "./metrics/causal-depth";
import {
  directionCorrectness,
  incorrectRelationships,
  missingExpectedRelationships,
  typeCorrectness,
  validRelationships,
} from "./metrics/counts";
import { crossCategory } from "./metrics/cross-category";
import { allOverlapMetrics } from "./metrics/overlap";
import { ratio, scoreItem } from "./metrics/registry";
import { degreeProfileSimilarity, editDistance } from "./metrics/structure";
import type { CanonicalEdge, ConceptMapScoreResult, ParticipantMapInput, ReferenceMapInput, ScoringContext } from "./types";

export function scoreConceptMap(
  participant: ParticipantMapInput,
  reference: ReferenceMapInput,
  configInput: ScoringConfigInput | ScoringConfig = {},
  context: ScoringContext = {},
): ConceptMapScoreResult {
  const config = resolveConfig(configInput as ScoringConfigInput);
  const parameters = configParameters(config);
  const ref = prepareReference(reference, config);
  const prepared = prepareParticipant(participant, ref.conceptSet, config);
  const { participantEdges, referenceEdges } = classify(prepared, ref, config);
  const kept = keptEdges(prepared);
  const outOfScopeIncorrect = participantEdges.filter((e) => e.class === "out_of_scope" && e.incorrect).length;

  const scores = [
    validRelationships(participantEdges, parameters),
    incorrectRelationships(participantEdges, parameters),
    missingExpectedRelationships(referenceEdges, parameters),
    directionCorrectness(participantEdges, parameters),
    typeCorrectness(participantEdges, parameters),
  ];

  const cc = crossCategory(participantEdges, ref, context.conceptCategories, referenceEdges);
  const ccDetails = {
    available: cc.available,
    total: cc.total,
    valid: cc.valid,
    uncategorised: cc.uncategorised,
    referenceExpectedCross: cc.referenceExpectedCross,
    referenceExpectedCrossMatched: cc.referenceExpectedCrossMatched,
  };
  scores.push(
    scoreItem("cmap.cross_category.total", cc.available ? cc.total.length : null, parameters, ccDetails),
    scoreItem("cmap.cross_category.valid", cc.available ? cc.valid.length : null, parameters, ccDetails),
    scoreItem("cmap.cross_category.valid_normalised", cc.available ? ratio(cc.referenceExpectedCrossMatched.length, cc.referenceExpectedCross.length) : null, parameters, ccDetails),
  );

  const validKeys = new Set(participantEdges.filter((e) => e.valid && e.canonicalKey).map((e) => e.canonicalKey));
  const validEdges: CanonicalEdge[] = kept.filter((e) => validKeys.has(e.keys.directed_labelled));
  const pDepth = causalChainDepth(validEdges, config);
  const rDepth = causalChainDepth(ref.edges.filter((e) => e.expected), config);
  // The normalised depth compares like with like (final review scoring-05, v1.1.0): the longest
  // chain of the EXPECTED reference edges the participant covered (not missing at the validity
  // level, as recall counts them), against the longest chain of all expected reference edges.
  // A subgraph's longest path is never longer, so the ratio stays in [0, 1] whatever
  // optionalMatch or validityLevel is set to; v1.0.0 divided the participant's depth over every
  // valid edge (optional-only matches included) and could exceed 1. The raw depth is unchanged.
  const covered = new Set(referenceEdges.filter((r) => !r.missing).map((r) => r.canonicalKey));
  const pExpectedDepth = causalChainDepth(
    ref.edges.filter((e) => e.expected && covered.has(e.keys.directed_labelled)),
    config,
  );
  const depthDetails = { participant: pDepth, coveredExpected: pExpectedDepth, reference: rDepth };
  scores.push(
    scoreItem("cmap.causal_chain_depth", pDepth.depth, parameters, depthDetails),
    scoreItem(
      "cmap.causal_chain_depth_normalised",
      pExpectedDepth.depth === null || rDepth.depth === null ? null : ratio(pExpectedDepth.depth, rDepth.depth),
      parameters,
      depthDetails,
    ),
  );

  scores.push(...allOverlapMetrics(kept, ref, outOfScopeIncorrect, config, parameters));

  const dp = degreeProfileSimilarity(kept, ref);
  scores.push(scoreItem("cmap.degree_profile_similarity", dp.similarity, parameters, { ...dp }));

  const ged = editDistance(kept, ref, outOfScopeIncorrect, config.editCosts);
  scores.push(
    scoreItem("cmap.edit_distance", ged.cost, parameters, { ...ged }),
    scoreItem("cmap.edit_distance_normalised", ged.normalised, parameters, { ...ged }),
  );

  return { pipelineVersion: SCORING_PIPELINE_VERSION, parameters, participantEdges, referenceEdges, scores };
}

/** Looks up a score by metric name (throws if absent, to keep callers honest). */
export function getScore(result: { scores: ReadonlyArray<{ metricName: string; value: number | null }> }, metricName: string): number | null {
  const s = result.scores.find((x) => x.metricName === metricName);
  if (!s) throw new Error(`No score named ${metricName}`);
  return s.value;
}
