/**
 * Adjudicated consensus reference map from several expert raters (labelled level).
 *
 * For each candidate edge (union of all raters' canonical labelled edges), with K raters,
 * support s = raters who include it and x = raters who include it as expected (a rater edge is
 * expected when status = "expected", or required = true, or required is false and
 * nonRequiredReferenceEdgeStatus = "expected"):
 *
 *   2x > K                    -> expected
 *   2s > K and 2x = K         -> disputed (expected vs optional: exact tie)
 *   2s > K                    -> optional
 *   2s = K                    -> disputed (include vs exclude: exact tie)
 *   otherwise                 -> excluded
 *
 * Disputed edges stay disputed until an adjudication decides them; the consensus is complete
 * only when no dispute is left. Adjudications may also override majority decisions; every
 * override is recorded. `agreement` = s / K (reference_map_edges.agreement).
 */
import { ScoringInputError, uniqSorted } from "./canonical";
import { cmp, configParameters, resolveConfig, type ScoringConfigInput } from "./config";
import { canonicalRaterEdges, type RaterMapInput } from "./agreement";
import { METRIC_VERSIONS } from "./metrics/registry";
import type { ReferenceEdgeInput, ReferenceMapInput } from "./types";

export type ConsensusDecision = "expected" | "optional" | "excluded" | "disputed";

export interface Adjudication {
  /** Canonical labelled key of the edge, as listed in the consensus result. */
  key: string;
  decision: Exclude<ConsensusDecision, "disputed">;
  adjudicatorId: string;
  note?: string;
}

export interface ConsensusEdge {
  key: string;
  source: string;
  target: string;
  type: string | null;
  directed: boolean;
  support: number;
  expectedSupport: number;
  agreement: number;
  raters: string[];
  majorityDecision: ConsensusDecision;
  decision: ConsensusDecision;
  decidedBy: "majority" | "adjudication";
  adjudication?: Adjudication;
}

export interface ConsensusResult {
  metricName: "cmap.consensus";
  metricVersion: string;
  parameters: Record<string, unknown>;
  raterCount: number;
  edges: ConsensusEdge[];
  unresolved: string[];
  isComplete: boolean;
  /** Ready to score; disputed edges are kept as "disputed" so scoring refuses by default. */
  referenceMap: ReferenceMapInput;
}

export interface ConsensusOptions {
  adjudications?: ReadonlyArray<Adjudication>;
  config?: ScoringConfigInput;
}

export function majorityDecision(support: number, expectedSupport: number, raters: number): ConsensusDecision {
  if (2 * expectedSupport > raters) return "expected";
  if (2 * support > raters) return 2 * expectedSupport === raters ? "disputed" : "optional";
  if (2 * support === raters) return "disputed";
  return "excluded";
}

export function buildConsensus(raters: ReadonlyArray<RaterMapInput>, options: ConsensusOptions = {}): ConsensusResult {
  const config = resolveConfig(options.config ?? {});
  const canon = canonicalRaterEdges(raters, config);
  const K = raters.length;
  type Acc = { edge: ConsensusEdge; ratersSet: Set<string>; expectedSet: Set<string> };
  const acc = new Map<string, Acc>();
  for (const r of raters) {
    const list = canon.get(r.raterId) ?? [];
    list.forEach((c, i) => {
      const src = r.edges[i]!;
      const status = src.status ?? (src.required ? "expected" : config.nonRequiredReferenceEdgeStatus);
      const key = c.keys.directed_labelled;
      const a: Acc = acc.get(key) ?? {
        edge: { key, source: c.source, target: c.target, type: c.type, directed: c.directed, support: 0, expectedSupport: 0, agreement: 0, raters: [], majorityDecision: "excluded", decision: "excluded", decidedBy: "majority" },
        ratersSet: new Set(),
        expectedSet: new Set(),
      };
      a.ratersSet.add(r.raterId);
      if (status === "expected") a.expectedSet.add(r.raterId);
      acc.set(key, a);
    });
  }
  const adjudications = new Map<string, Adjudication>();
  for (const adj of options.adjudications ?? []) {
    if (!acc.has(adj.key)) throw new ScoringInputError(`Adjudication for unknown edge ${adj.key}`);
    if (adjudications.has(adj.key)) throw new ScoringInputError(`Two adjudications for edge ${adj.key}`);
    adjudications.set(adj.key, adj);
  }
  const edges = [...acc.values()]
    .map(({ edge, ratersSet, expectedSet }): ConsensusEdge => {
      const support = ratersSet.size;
      const expectedSupport = expectedSet.size;
      const majority = majorityDecision(support, expectedSupport, K);
      const adj = adjudications.get(edge.key);
      return {
        ...edge,
        support,
        expectedSupport,
        agreement: support / K,
        raters: [...ratersSet].sort(cmp),
        majorityDecision: majority,
        decision: adj ? adj.decision : majority,
        decidedBy: adj ? "adjudication" : "majority",
        ...(adj ? { adjudication: adj } : {}),
      };
    })
    .sort((a, b) => cmp(a.key, b.key));
  const unresolved = edges.filter((e) => e.decision === "disputed").map((e) => e.key);
  const refEdges: ReferenceEdgeInput[] = edges.flatMap((e): ReferenceEdgeInput[] =>
    e.decision === "excluded"
      ? []
      : [
          {
            sourceConceptId: e.source,
            targetConceptId: e.target,
            relationshipTypeCode: e.type,
            directed: e.directed,
            required: e.decision === "expected",
            status: e.decision,
          },
        ],
  );
  const conceptIds = uniqSorted([...raters.flatMap((r) => r.conceptIds ?? []), ...edges.flatMap((e) => [e.source, e.target])]);
  return {
    metricName: "cmap.consensus",
    metricVersion: METRIC_VERSIONS["cmap.consensus"],
    parameters: { rule: "strict_majority_ties_disputed", raterCount: K, scoring: configParameters(config) },
    raterCount: K,
    edges,
    unresolved,
    isComplete: unresolved.length === 0,
    referenceMap: { conceptIds, edges: refEdges },
  };
}
