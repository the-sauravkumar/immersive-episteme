/**
 * Preparation and edge matching: turns raw participant / reference maps into canonical edges,
 * applies scope and duplicate rules, and classifies every participant and reference edge.
 * Everything is sorted by canonical key (then edge key), so input order never matters.
 */
import { canonicaliseEdge, ScoringInputError, assertConceptId, uniqSorted } from "./canonical";
import { cmp, MATCH_LEVELS, type MatchLevel, type ScoringConfig } from "./config";
import type {
  CanonicalEdge,
  ParticipantEdgeBreakdown,
  ParticipantMapInput,
  ReferenceEdgeBreakdown,
  ReferenceMapInput,
} from "./types";

export const LEVEL_RANK: Record<MatchLevel, number> = {
  undirected_unlabelled: 1,
  directed_unlabelled: 2,
  directed_labelled: 3,
};

export function atLeast(level: MatchLevel | null, min: MatchLevel): boolean {
  return level !== null && LEVEL_RANK[level] >= LEVEL_RANK[min];
}

export interface PreparedReferenceEdge extends CanonicalEdge {
  status: ReferenceEdgeBreakdown["status"];
  /** "expected" counts towards recall / missing; everything else is optional. */
  expected: boolean;
  weight: number;
}

export interface PreparedReference {
  conceptIds: string[];
  conceptSet: ReadonlySet<string>;
  /** One edge per canonical labelled key, sorted by that key. */
  edges: PreparedReferenceEdge[];
  index: Record<MatchLevel, Map<string, PreparedReferenceEdge[]>>;
}

/**
 * Status of a reference edge: explicit `status`, else `required` -> expected, else the
 * configured status for non-required edges. Duplicates after canonicalisation are merged:
 * expected beats optional beats uncertain beats disputed, weight = max.
 */
export function prepareReference(reference: ReferenceMapInput, config: ScoringConfig): PreparedReference {
  const byKey = new Map<string, PreparedReferenceEdge>();
  const rank = { expected: 4, optional: 3, uncertain: 2, disputed_as_optional: 1 } as const;
  for (const e of reference.edges) {
    const raw = e.status ?? (e.required ? "expected" : config.nonRequiredReferenceEdgeStatus);
    if (raw === "disputed" && config.disputedReferenceEdges === "error") {
      throw new ScoringInputError(
        `Reference edge ${e.sourceConceptId} -> ${e.targetConceptId} (${e.relationshipTypeCode ?? "untyped"}) is disputed; adjudicate it before scoring`,
      );
    }
    const status: PreparedReferenceEdge["status"] = raw === "disputed" ? "disputed_as_optional" : raw;
    const c = canonicaliseEdge(e.sourceConceptId, e.targetConceptId, e.relationshipTypeCode, e.directed, config);
    const weight = e.weight ?? 1;
    const prev = byKey.get(c.keys.directed_labelled);
    if (!prev) {
      byKey.set(c.keys.directed_labelled, { ...c, status, expected: status === "expected", weight });
    } else {
      const best = rank[status] > rank[prev.status] ? status : prev.status;
      byKey.set(c.keys.directed_labelled, { ...prev, status: best, expected: best === "expected", weight: Math.max(prev.weight, weight) });
    }
  }
  const edges = [...byKey.values()].sort((a, b) => cmp(a.keys.directed_labelled, b.keys.directed_labelled));
  reference.conceptIds.forEach(assertConceptId);
  const conceptIds = uniqSorted([...reference.conceptIds, ...edges.flatMap((e) => [e.source, e.target])]);
  const index = Object.fromEntries(MATCH_LEVELS.map((l) => [l, new Map<string, PreparedReferenceEdge[]>()])) as PreparedReference["index"];
  for (const e of edges) {
    for (const l of MATCH_LEVELS) {
      const list = index[l].get(e.keys[l]) ?? [];
      list.push(e);
      index[l].set(e.keys[l], list);
    }
  }
  return { conceptIds, conceptSet: new Set(conceptIds), edges, index };
}

export interface PreparedParticipantEdge {
  edgeKey: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  sourceConceptId: string | null;
  targetConceptId: string | null;
  originalType: string | null;
  canonical: CanonicalEdge | null;
  outOfScopeReason?: ParticipantEdgeBreakdown["outOfScopeReason"];
  duplicateOf?: string;
}

/**
 * Resolves node keys to concept ids and canonicalises. An edge is out of scope when an endpoint
 * is a free node, a concept outside `conceptSet`, or both endpoints are the same concept.
 * Among in-scope edges with the same labelled key, the one with the smallest edge key is kept;
 * the others are marked `duplicateOf`. Pass `conceptSet = null` to accept every concept.
 */
export function prepareParticipant(
  map: ParticipantMapInput,
  conceptSet: ReadonlySet<string> | null,
  config: ScoringConfig,
): PreparedParticipantEdge[] {
  const nodes = new Map<string, string | null>();
  for (const n of map.nodes) {
    if (nodes.has(n.key)) throw new ScoringInputError(`Duplicate node key ${n.key}`);
    nodes.set(n.key, n.conceptId);
  }
  const seenEdgeKeys = new Set<string>();
  const out: PreparedParticipantEdge[] = [];
  for (const e of map.edges) {
    if (seenEdgeKeys.has(e.key)) throw new ScoringInputError(`Duplicate edge key ${e.key}`);
    seenEdgeKeys.add(e.key);
    if (!nodes.has(e.source) || !nodes.has(e.target)) throw new ScoringInputError(`Edge ${e.key} references an unknown node`);
    const s = nodes.get(e.source) ?? null;
    const t = nodes.get(e.target) ?? null;
    const base = {
      edgeKey: e.key,
      sourceNodeKey: e.source,
      targetNodeKey: e.target,
      sourceConceptId: s,
      targetConceptId: t,
      originalType: e.relationshipType ?? null,
    };
    let reason: PreparedParticipantEdge["outOfScopeReason"];
    if (s === null || t === null) reason = "free_node";
    else if (s === t) reason = "same_concept";
    else if (conceptSet && (!conceptSet.has(s) || !conceptSet.has(t))) reason = "concept_not_in_reference";
    if (reason || s === null || t === null) {
      out.push({ ...base, canonical: null, outOfScopeReason: reason });
      continue;
    }
    out.push({ ...base, canonical: canonicaliseEdge(s, t, e.relationshipType, e.directed, config) });
  }
  out.sort((a, b) => cmp(a.canonical?.keys.directed_labelled ?? "￿", b.canonical?.keys.directed_labelled ?? "￿") || cmp(a.edgeKey, b.edgeKey));
  const keptByKey = new Map<string, string>();
  for (const p of out) {
    if (!p.canonical) continue;
    const k = p.canonical.keys.directed_labelled;
    const kept = keptByKey.get(k);
    if (kept === undefined) keptByKey.set(k, p.edgeKey);
    else p.duplicateOf = kept;
  }
  return out.sort((a, b) => cmp(a.edgeKey, b.edgeKey));
}

/** In-scope, non-duplicate participant edges, sorted by labelled key. */
export function keptEdges(prepared: ReadonlyArray<PreparedParticipantEdge>): CanonicalEdge[] {
  return prepared
    .filter((p) => p.canonical && !p.duplicateOf)
    .map((p) => p.canonical as CanonicalEdge)
    .sort((a, b) => cmp(a.keys.directed_labelled, b.keys.directed_labelled));
}

function highestMatch(edge: CanonicalEdge, ref: PreparedReference): { level: MatchLevel | null; hits: PreparedReferenceEdge[] } {
  for (const l of [...MATCH_LEVELS].reverse()) {
    const hits = ref.index[l].get(edge.keys[l]);
    if (hits && hits.length > 0) return { level: l, hits };
  }
  return { level: null, hits: [] };
}

export interface Classification {
  participantEdges: ParticipantEdgeBreakdown[];
  referenceEdges: ReferenceEdgeBreakdown[];
}

/** Classifies every participant edge and every reference edge (see docs, "Edge classes"). */
export function classify(prepared: ReadonlyArray<PreparedParticipantEdge>, ref: PreparedReference, config: ScoringConfig): Classification {
  const v = config.validityLevel;
  const participantEdges = prepared.map((p): ParticipantEdgeBreakdown => {
    const base = {
      edgeKey: p.edgeKey,
      sourceNodeKey: p.sourceNodeKey,
      targetNodeKey: p.targetNodeKey,
      sourceConceptId: p.sourceConceptId,
      targetConceptId: p.targetConceptId,
      originalType: p.originalType,
      canonicalKey: p.canonical?.keys.directed_labelled ?? null,
    };
    if (!p.canonical) {
      const incorrect = config.outOfScopeEdges === "count_as_incorrect";
      return { ...base, class: "out_of_scope", valid: false, incorrect, outOfScopeReason: p.outOfScopeReason, matchAtValidityLevel: null, matchedLevel: null, matchedReferenceKeys: [] };
    }
    if (p.duplicateOf) {
      return { ...base, class: "duplicate", valid: false, incorrect: false, duplicateOf: p.duplicateOf, matchAtValidityLevel: null, matchedLevel: null, matchedReferenceKeys: [] };
    }
    const { level, hits } = highestMatch(p.canonical, ref);
    const matchedReferenceKeys = hits.map((h) => h.keys.directed_labelled).sort(cmp);
    let cls: ParticipantEdgeBreakdown["class"];
    if (level === "directed_labelled") cls = hits.some((h) => h.expected) ? "correct" : "optional_match";
    else if (level === "directed_unlabelled") cls = "wrong_type";
    else if (level === "undirected_unlabelled") cls = "wrong_direction";
    else cls = "unsupported";
    // Validity is judged at the configured level, against expected edges first.
    const atV = ref.index[v].get(p.canonical.keys[v]) ?? [];
    const matchesExpected = atV.some((h) => h.expected);
    const matchesOptionalOnly = !matchesExpected && atV.length > 0;
    const valid = matchesExpected || (matchesOptionalOnly && config.optionalMatch === "valid");
    const incorrect = !matchesExpected && !matchesOptionalOnly;
    const matchAtValidityLevel = matchesExpected ? "expected" : matchesOptionalOnly ? "optional_only" : null;
    return { ...base, class: cls, valid, incorrect, matchAtValidityLevel, matchedLevel: level, matchedReferenceKeys };
  });

  const kept = prepared.filter((p) => p.canonical && !p.duplicateOf);
  const referenceEdges = ref.edges.map((r): ReferenceEdgeBreakdown => {
    let level: MatchLevel | null = null;
    let matchedBy: string[] = [];
    for (const l of [...MATCH_LEVELS].reverse()) {
      const by = kept.filter((p) => p.canonical?.keys[l] === r.keys[l]).map((p) => p.edgeKey);
      if (by.length > 0) {
        level = l;
        matchedBy = by.sort(cmp);
        break;
      }
    }
    return {
      canonicalKey: r.keys.directed_labelled,
      source: r.source,
      target: r.target,
      type: r.type,
      directed: r.directed,
      status: r.status,
      weight: r.weight,
      matchedLevel: level,
      matchedBy,
      missing: r.expected && !atLeast(level, v),
    };
  });
  return { participantEdges, referenceEdges };
}
