/**
 * Cross-category connections: an in-scope participant edge whose two concepts belong to
 * different knowledge categories (by `conceptCategories`). Edges with an uncategorised
 * endpoint are never counted and are listed separately.
 *   total            = cross-category edges (valid or not)
 *   valid            = cross-category edges that are valid
 *   valid_normalised = (cross-category expected reference edges the participant covered, as recall
 *                      counts them) / (cross-category expected reference edges); null when 0.
 *                      A coverage proportion in [0, 1] (v1.1.0). v1.0.0 divided the count of valid
 *                      participant edges, which includes optional-only matches under
 *                      optionalMatch = "valid" and could exceed 1 (final review scoring-05).
 */
import { cmp } from "../config";
import type { PreparedReference } from "../match";
import type { ParticipantEdgeBreakdown, ReferenceEdgeBreakdown } from "../types";

export interface CrossCategoryResult {
  available: boolean;
  total: string[];
  valid: string[];
  uncategorised: string[];
  referenceExpectedCross: string[];
  /** Keys of the cross-category expected reference edges matched at the validity level (not missing). */
  referenceExpectedCrossMatched: string[];
}

export function crossCategory(
  edges: ReadonlyArray<ParticipantEdgeBreakdown>,
  ref: PreparedReference,
  categories: Readonly<Record<string, string>> | undefined,
  referenceEdges: ReadonlyArray<ReferenceEdgeBreakdown> = [],
): CrossCategoryResult {
  if (!categories) return { available: false, total: [], valid: [], uncategorised: [], referenceExpectedCross: [], referenceExpectedCrossMatched: [] };
  const total: string[] = [];
  const valid: string[] = [];
  const uncategorised: string[] = [];
  for (const e of edges) {
    if (e.class === "out_of_scope" || e.class === "duplicate" || !e.sourceConceptId || !e.targetConceptId) continue;
    const a = categories[e.sourceConceptId];
    const b = categories[e.targetConceptId];
    if (a === undefined || b === undefined) {
      uncategorised.push(e.edgeKey);
      continue;
    }
    if (a !== b) {
      total.push(e.edgeKey);
      if (e.valid) valid.push(e.edgeKey);
    }
  }
  const referenceExpectedCross = ref.edges
    .filter((r) => r.expected && categories[r.source] !== undefined && categories[r.target] !== undefined && categories[r.source] !== categories[r.target])
    .map((r) => r.keys.directed_labelled);
  const expectedCross = new Set(referenceExpectedCross);
  const referenceExpectedCrossMatched = referenceEdges.filter((r) => expectedCross.has(r.canonicalKey) && !r.missing).map((r) => r.canonicalKey);
  return {
    available: true,
    total: total.sort(cmp),
    valid: valid.sort(cmp),
    uncategorised: uncategorised.sort(cmp),
    referenceExpectedCross: referenceExpectedCross.sort(cmp),
    referenceExpectedCrossMatched: [...new Set(referenceExpectedCrossMatched)].sort(cmp),
  };
}
