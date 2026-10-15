/**
 * Navigation-to-concept-map correspondence v1 (CN-20: "compare a participant's navigation
 * structure with the concept map produced after learning"; spec §10.3). Pure.
 *
 * OBSERVATIONAL: a description of overlap between what was navigated and what was later drawn.
 * It is not a learning-outcome score (those are derived_scores from the assessment scoring
 * pipeline against the adjudicated reference map) and supports no causal claim.
 *
 * Inputs: the session's raw events, its final post-learning concept map (nodes with concept ids,
 * edges), and the relationships of the session's snapshot (ground truth for "correct" here).
 *
 *  conceptsExposed       concepts with concept_encountered or exposure_started
 *  conceptsInspected     concepts with a completed exposure interval (exposure_ended, activeMs > 0)
 *  relationshipsFollowed distinct relationship_followed relationship ids
 *  mapEdges              edges of the map whose two endpoints are snapshot concepts
 *  correct / incorrect   a map edge is correct when the snapshot has a relationship between the
 *                        two concepts (direction must match when both the map edge and the
 *                        relationship type are directed; the type must match when the map edge
 *                        is typed); otherwise incorrect
 *  value                 Jaccard index between the undirected concept pairs NAVIGATED (consecutive
 *                        visits and followed relationships) and the undirected concept pairs of the
 *                        map's edges; null when both sets are empty
 */
import { visitSequence, type MetricValue, type NavEvent } from "./navigation";

export const CORRESPONDENCE_METRIC = "nav.map_correspondence";
export const CORRESPONDENCE_VERSION = "1";

export interface MapEdgeInput {
  sourceConceptId: string | null;
  targetConceptId: string | null;
  relationshipTypeCode: string | null;
  directed: boolean;
}

export interface SnapshotRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  directed: boolean;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function computeMapCorrespondence(
  events: readonly NavEvent[],
  mapEdges: readonly MapEdgeInput[] | null,
  relationships: readonly SnapshotRelationship[],
): MetricValue {
  const exposed = new Set<string>();
  const inspected = new Set<string>();
  const followed = new Set<string>();
  const navPairs = new Set<string>();
  const relById = new Map(relationships.map((r) => [r.id, r]));
  for (const e of events) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    if ((e.type === "concept_encountered" || e.type === "exposure_started") && e.conceptId) exposed.add(e.conceptId);
    if (e.type === "exposure_ended" && e.conceptId && Number(m.activeMs) > 0) inspected.add(e.conceptId);
    if (e.type === "relationship_followed" && typeof m.relationshipId === "string") {
      followed.add(m.relationshipId);
      const r = relById.get(m.relationshipId);
      const from = typeof m.fromConceptId === "string" ? m.fromConceptId : r?.sourceId;
      const to = typeof m.toConceptId === "string" ? m.toConceptId : r?.targetId;
      if (from && to && from !== to) navPairs.add(pairKey(from, to));
    }
  }
  const visits = visitSequence(events);
  for (let i = 1; i < visits.length; i++) navPairs.add(pairKey(visits[i - 1]!.conceptId, visits[i]!.conceptId));

  const relsByPair = new Map<string, SnapshotRelationship[]>();
  for (const r of relationships) relsByPair.set(pairKey(r.sourceId, r.targetId), [...(relsByPair.get(pairKey(r.sourceId, r.targetId)) ?? []), r]);

  const details: Record<string, unknown> = {
    conceptsExposed: exposed.size,
    conceptsInspected: inspected.size,
    relationshipsFollowed: followed.size,
    navigatedPairs: navPairs.size,
    mapAvailable: mapEdges !== null,
  };
  if (mapEdges === null) {
    return { metricName: CORRESPONDENCE_METRIC, metricVersion: CORRESPONDENCE_VERSION, value: null, details };
  }
  const mapPairs = new Set<string>();
  let correct = 0;
  let incorrect = 0;
  let correctFollowed = 0;
  let correctBothInspected = 0;
  let incorrectBothInspected = 0;
  let mapEdgesWithConcepts = 0;
  const mapConcepts = new Set<string>();
  for (const e of mapEdges) {
    if (!e.sourceConceptId || !e.targetConceptId || e.sourceConceptId === e.targetConceptId) continue;
    mapEdgesWithConcepts++;
    mapConcepts.add(e.sourceConceptId).add(e.targetConceptId);
    const k = pairKey(e.sourceConceptId, e.targetConceptId);
    mapPairs.add(k);
    const matches = (relsByPair.get(k) ?? []).filter(
      (r) =>
        (!e.relationshipTypeCode || r.type === e.relationshipTypeCode) &&
        (!(e.directed && r.directed) || (r.sourceId === e.sourceConceptId && r.targetId === e.targetConceptId)),
    );
    const both = inspected.has(e.sourceConceptId) && inspected.has(e.targetConceptId);
    if (matches.length) {
      correct++;
      if (matches.some((r) => followed.has(r.id))) correctFollowed++;
      if (both) correctBothInspected++;
    } else {
      incorrect++;
      if (both) incorrectBothInspected++;
    }
  }
  let inter = 0;
  for (const p of mapPairs) if (navPairs.has(p)) inter++;
  const union = navPairs.size + mapPairs.size - inter;
  Object.assign(details, {
    mapEdges: mapEdgesWithConcepts,
    mapConcepts: mapConcepts.size,
    mapConceptsInspected: [...mapConcepts].filter((c) => inspected.has(c)).length,
    mapConceptsExposed: [...mapConcepts].filter((c) => exposed.has(c)).length,
    reconstructedCorrect: correct,
    reconstructedIncorrect: incorrect,
    correctAndFollowed: correctFollowed,
    correctWithBothEndpointsInspected: correctBothInspected,
    incorrectWithBothEndpointsInspected: incorrectBothInspected,
    sharedPairs: inter,
  });
  return {
    metricName: CORRESPONDENCE_METRIC,
    metricVersion: CORRESPONDENCE_VERSION,
    value: union === 0 ? null : Math.round((inter / union) * 1e6) / 1e6,
    details,
  };
}
