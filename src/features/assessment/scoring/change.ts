/**
 * Pre/post graph change between two submissions of the same participant (e.g. pre and post
 * phase, or two revisions). Concept-id based and independent of any reference map:
 *
 *   unchanged  : same labelled key in both maps
 *   retyped    : same concept pair and direction, different type (paired in key order)
 *   reoriented : same concept pair, different direction / directedness (type may also differ)
 *   added      : present only after;  removed : present only before
 *
 * Edges are canonicalised with the same configuration as scoring (so synonym rules apply);
 * edges touching a free node (or joining a concept to itself) are excluded and listed. When a reference is given, both maps are scored
 * and each metric's delta (post − pre; null if either is null) is reported.
 */
import { cmp, configParameters, resolveConfig, type ScoringConfig, type ScoringConfigInput } from "./config";
import { keptEdges, prepareParticipant } from "./match";
import { scoreItem } from "./metrics/registry";
import { scoreConceptMap } from "./score";
import type { CanonicalEdge, ParticipantMapInput, ReferenceMapInput, ScoreItem, ScoringContext } from "./types";

export interface EdgeChange {
  kind: "unchanged" | "retyped" | "reoriented" | "added" | "removed";
  before: string | null;
  after: string | null;
}

export interface ScoreDelta {
  metricName: string;
  metricVersion: string;
  pre: number | null;
  post: number | null;
  delta: number | null;
}

export interface ConceptMapChangeResult {
  parameters: Record<string, unknown>;
  changes: EdgeChange[];
  excludedEdges: { pre: string[]; post: string[] };
  scores: ScoreItem[];
  scoreDeltas: ScoreDelta[] | null;
}

function pairOff(
  before: CanonicalEdge[],
  after: CanonicalEdge[],
  groupKey: (e: CanonicalEdge) => string,
  kind: EdgeChange["kind"],
  out: EdgeChange[],
): [CanonicalEdge[], CanonicalEdge[]] {
  const restB: CanonicalEdge[] = [];
  const usedA = new Set<CanonicalEdge>();
  const byGroup = new Map<string, CanonicalEdge[]>();
  for (const a of after) byGroup.set(groupKey(a), [...(byGroup.get(groupKey(a)) ?? []), a]);
  for (const b of before) {
    const cand = (byGroup.get(groupKey(b)) ?? []).find((a) => !usedA.has(a));
    if (cand) {
      usedA.add(cand);
      out.push({ kind, before: b.keys.directed_labelled, after: cand.keys.directed_labelled });
    } else restB.push(b);
  }
  return [restB, after.filter((a) => !usedA.has(a))];
}

export function compareConceptMaps(
  pre: ParticipantMapInput,
  post: ParticipantMapInput,
  configInput: ScoringConfigInput | ScoringConfig = {},
  reference?: ReferenceMapInput,
  context: ScoringContext = {},
): ConceptMapChangeResult {
  const config = resolveConfig(configInput as ScoringConfigInput);
  const parameters = configParameters(config);
  const pPre = prepareParticipant(pre, null, config);
  const pPost = prepareParticipant(post, null, config);
  const before = keptEdges(pPre);
  const after = keptEdges(pPost);
  const changes: EdgeChange[] = [];

  const afterKeys = new Set(after.map((e) => e.keys.directed_labelled));
  const beforeKeys = new Set(before.map((e) => e.keys.directed_labelled));
  for (const b of before) if (afterKeys.has(b.keys.directed_labelled)) changes.push({ kind: "unchanged", before: b.keys.directed_labelled, after: b.keys.directed_labelled });
  let restB = before.filter((e) => !afterKeys.has(e.keys.directed_labelled));
  let restA = after.filter((e) => !beforeKeys.has(e.keys.directed_labelled));
  [restB, restA] = pairOff(restB, restA, (e) => e.keys.directed_unlabelled, "retyped", changes);
  [restB, restA] = pairOff(restB, restA, (e) => e.keys.undirected_unlabelled, "reoriented", changes);
  for (const b of restB) changes.push({ kind: "removed", before: b.keys.directed_labelled, after: null });
  for (const a of restA) changes.push({ kind: "added", before: null, after: a.keys.directed_labelled });
  changes.sort((x, y) => cmp(x.kind, y.kind) || cmp(x.before ?? "", y.before ?? "") || cmp(x.after ?? "", y.after ?? ""));

  const count = (k: EdgeChange["kind"]) => changes.filter((c) => c.kind === k);
  const scores = (["added", "removed", "retyped", "reoriented", "unchanged"] as const).map((k) =>
    scoreItem("cmap.change", count(k).length, parameters, { changes: count(k) }, k),
  );

  let scoreDeltas: ScoreDelta[] | null = null;
  if (reference) {
    const sPre = scoreConceptMap(pre, reference, config, context);
    const sPost = scoreConceptMap(post, reference, config, context);
    scoreDeltas = sPost.scores.map((s) => {
      const p = sPre.scores.find((x) => x.metricName === s.metricName);
      const preV = p?.value ?? null;
      return {
        metricName: s.metricName,
        metricVersion: s.metricVersion,
        pre: preV,
        post: s.value,
        delta: preV === null || s.value === null ? null : s.value - preV,
      };
    });
  }

  const free = (ps: ReturnType<typeof prepareParticipant>) => ps.filter((p) => !p.canonical).map((p) => p.edgeKey).sort(cmp);
  return { parameters, changes, excludedEdges: { pre: free(pPre), post: free(pPost) }, scores, scoreDeltas };
}
