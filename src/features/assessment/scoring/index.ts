/**
 * Concept-map scoring (pure TypeScript, no DB/React). Definitions and open questions:
 * docs/research/concept-map-scoring.md.
 */
export * from "./config";
export * from "./types";
export { canonicaliseEdge, levelKeys, ScoringInputError } from "./canonical";
export { classify, keptEdges, prepareParticipant, prepareReference } from "./match";
export { METRIC_VERSIONS, LEVEL_SUFFIX } from "./metrics/registry";
export { causalArcs, causalChainDepth, longestSimplePath } from "./metrics/causal-depth";
export { degreeProfileSimilarity, editDistance } from "./metrics/structure";
export { overlapMetrics, overlapSets } from "./metrics/overlap";
export { scoreConceptMap, getScore } from "./score";
export { compareConceptMaps } from "./change";
export { cohensKappa, fleissKappa, raterAgreement, type RaterMapInput } from "./agreement";
export { buildConsensus, majorityDecision, type Adjudication, type ConsensusResult } from "./consensus";
export { toDerivedScores } from "./derived-scores";
