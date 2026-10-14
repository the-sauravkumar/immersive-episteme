/**
 * Structural similarity beyond edge overlap:
 *
 * Degree-profile similarity (Bray–Curtis). For every concept c of the reference concept set
 * take the vector (out-degree, in-degree, undirected-degree) over distinct directed-unlabelled
 * edges, for the participant (all in-scope edges, valid or not) and the reference (expected
 * edges). With p and r the concatenated vectors:
 *     S = 1 − Σ|p_i − r_i| / Σ(p_i + r_i)          (null when both maps have no edges)
 * It ignores which concepts are linked to which: it compares the shape (hubs, sources,
 * sinks), so it rewards a correct structure even with wrong partners.
 *
 * Edit distance with a fixed node correspondence (nodes are concept ids, so no node edits):
 * labelled participant edges are transformed into the expected labelled edges.
 *   exact matches cost 0; a participant edge and a reference edge on the same concept pair
 *   may be substituted at cost relabel·[type differs] + reverse·[direction differs], capped at
 *   delete + insert; every other participant edge is deleted, every other reference edge
 *   inserted. The cheapest assignment per concept pair is found exactly (bitmask DP).
 *   Participant edges that match only optional reference edges are left out; out-of-scope
 *   edges counted incorrect each cost one delete.
 *   normalised = cost / (|P|·delete + |E|·insert), in [0, 1]; null when both are empty.
 */
import { cmp, type ScoringConfig } from "../config";
import type { PreparedReference } from "../match";
import type { CanonicalEdge } from "../types";

export interface DegreeProfileResult {
  similarity: number | null;
  participant: Record<string, [number, number, number]>;
  reference: Record<string, [number, number, number]>;
  sumAbsDiff: number;
  sumTotal: number;
}

function degreeVector(edges: ReadonlyArray<CanonicalEdge>, conceptIds: ReadonlyArray<string>): Record<string, [number, number, number]> {
  const v: Record<string, [number, number, number]> = {};
  for (const c of conceptIds) v[c] = [0, 0, 0];
  const seen = new Set<string>();
  for (const e of edges) {
    if (seen.has(e.keys.directed_unlabelled)) continue;
    seen.add(e.keys.directed_unlabelled);
    const s = v[e.source];
    const t = v[e.target];
    if (!s || !t) continue;
    if (e.directed) {
      s[0] += 1;
      t[1] += 1;
    } else {
      s[2] += 1;
      t[2] += 1;
    }
  }
  return v;
}

export function degreeProfileSimilarity(kept: ReadonlyArray<CanonicalEdge>, ref: PreparedReference): DegreeProfileResult {
  const participant = degreeVector(kept, ref.conceptIds);
  const reference = degreeVector(ref.edges.filter((e) => e.expected), ref.conceptIds);
  let sumAbsDiff = 0;
  let sumTotal = 0;
  for (const c of ref.conceptIds) {
    const p = participant[c] ?? [0, 0, 0];
    const r = reference[c] ?? [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      sumAbsDiff += Math.abs((p[i] ?? 0) - (r[i] ?? 0));
      sumTotal += (p[i] ?? 0) + (r[i] ?? 0);
    }
  }
  return { similarity: sumTotal === 0 ? null : 1 - sumAbsDiff / sumTotal, participant, reference, sumAbsDiff, sumTotal };
}

export interface EditOperation {
  op: "match" | "substitute" | "delete" | "insert";
  participant?: string;
  reference?: string;
  cost: number;
}

export interface EditDistanceResult {
  cost: number;
  normalised: number | null;
  maxCost: number;
  operations: EditOperation[];
}

const MAX_GROUP = 16;

export function editDistance(
  kept: ReadonlyArray<CanonicalEdge>,
  ref: PreparedReference,
  outOfScopeIncorrect: number,
  costs: ScoringConfig["editCosts"],
): EditDistanceResult {
  const optionalOnly = new Set(ref.edges.filter((e) => !e.expected).map((e) => e.keys.directed_labelled));
  const expected = ref.edges.filter((e) => e.expected);
  const expectedKeys = new Set(expected.map((e) => e.keys.directed_labelled));
  for (const k of expectedKeys) optionalOnly.delete(k);
  const P = kept.filter((e) => !optionalOnly.has(e.keys.directed_labelled));
  const ops: EditOperation[] = [];
  const restP: CanonicalEdge[] = [];
  const matchedRef = new Set<string>();
  for (const e of P) {
    if (expectedKeys.has(e.keys.directed_labelled)) {
      ops.push({ op: "match", participant: e.keys.directed_labelled, reference: e.keys.directed_labelled, cost: 0 });
      matchedRef.add(e.keys.directed_labelled);
    } else restP.push(e);
  }
  const restR = expected.filter((e) => !matchedRef.has(e.keys.directed_labelled));
  const pairs = [...new Set([...restP, ...restR].map((e) => e.keys.undirected_unlabelled))].sort(cmp);
  const cap = costs.delete + costs.insert;
  const subCost = (p: CanonicalEdge, r: CanonicalEdge) =>
    Math.min(cap, (p.type !== r.type ? costs.relabel : 0) + (p.keys.directed_unlabelled !== r.keys.directed_unlabelled ? costs.reverse : 0));

  for (const pair of pairs) {
    const ps = restP.filter((e) => e.keys.undirected_unlabelled === pair);
    const rs = restR.filter((e) => e.keys.undirected_unlabelled === pair);
    if (rs.length > MAX_GROUP) throw new Error(`More than ${MAX_GROUP} reference edges on one concept pair`);
    // dp over participant index i and mask of used reference edges.
    const memo = new Map<string, { cost: number; choice: number }>();
    const solve = (i: number, mask: number): number => {
      if (i === ps.length) {
        let c = 0;
        for (let j = 0; j < rs.length; j++) if (!(mask & (1 << j))) c += costs.insert;
        return c;
      }
      const key = `${i}:${mask}`;
      const hit = memo.get(key);
      if (hit) return hit.cost;
      let best = costs.delete + solve(i + 1, mask);
      let choice = -1;
      for (let j = 0; j < rs.length; j++) {
        if (mask & (1 << j)) continue;
        const c = subCost(ps[i]!, rs[j]!) + solve(i + 1, mask | (1 << j));
        if (c < best) {
          best = c;
          choice = j;
        }
      }
      memo.set(key, { cost: best, choice });
      return best;
    };
    solve(0, 0);
    let mask = 0;
    for (let i = 0; i < ps.length; i++) {
      const choice = memo.get(`${i}:${mask}`)?.choice ?? -1;
      const p = ps[i]!;
      if (choice < 0) ops.push({ op: "delete", participant: p.keys.directed_labelled, cost: costs.delete });
      else {
        const r = rs[choice]!;
        ops.push({ op: "substitute", participant: p.keys.directed_labelled, reference: r.keys.directed_labelled, cost: subCost(p, r) });
        mask |= 1 << choice;
      }
    }
    rs.forEach((r, j) => {
      if (!(mask & (1 << j))) ops.push({ op: "insert", reference: r.keys.directed_labelled, cost: costs.insert });
    });
  }
  for (let i = 0; i < outOfScopeIncorrect; i++) ops.push({ op: "delete", participant: "(out of scope)", cost: costs.delete });
  const cost = ops.reduce((s, o) => s + o.cost, 0);
  const maxCost = (P.length + outOfScopeIncorrect) * costs.delete + expected.length * costs.insert;
  return { cost, normalised: maxCost === 0 ? null : cost / maxCost, maxCost, operations: ops };
}
