/**
 * Inter-rater agreement between expert reference maps.
 *
 * Each candidate edge (a key at the chosen match level) is an item; each rater either includes
 * it or not (binary category). The candidate universe is either
 *   "union"        : every edge proposed by at least one rater (default; no "both absent"
 *                    items, so kappa is conservative and percent agreement is not inflated), or
 *   "all_possible" : every possible edge over the concept set (and relationship types at the
 *                    labelled level), which adds many trivially agreed absences and inflates
 *                    percent agreement. Report which one was used.
 *
 * Percent agreement = Fleiss' P̄ (mean over items of the share of agreeing rater pairs); for
 * two raters it is the plain proportion of items on which they agree.
 * Fleiss' kappa (Fleiss 1971): κ = (P̄ − P̄e) / (1 − P̄e), P̄e = Σ_j p_j².
 * Cohen's kappa for every rater pair: κ = (po − pe) / (1 − pe), pe = Σ_k pA(k)·pB(k).
 * Kappa is null when chance agreement is 1 (every rating identical) or there are no items.
 */
import { canonicaliseEdge, ScoringInputError, uniqSorted } from "./canonical";
import { cmp, configParameters, resolveConfig, type MatchLevel, type ScoringConfigInput } from "./config";
import { METRIC_VERSIONS } from "./metrics/registry";
import type { CanonicalEdge, ReferenceEdgeInput } from "./types";

export interface RaterMapInput {
  raterId: string;
  /** Concepts the rater considered (optional; used for the "all_possible" universe). */
  conceptIds?: ReadonlyArray<string>;
  edges: ReadonlyArray<ReferenceEdgeInput>;
}

/** Cohen's kappa for two raters over the same items (any categorical labels). */
export function cohensKappa(a: ReadonlyArray<string>, b: ReadonlyArray<string>): { kappa: number | null; po: number | null; pe: number | null; n: number } {
  if (a.length !== b.length) throw new ScoringInputError("Cohen's kappa needs paired ratings");
  const n = a.length;
  if (n === 0) return { kappa: null, po: null, pe: null, n };
  let agree = 0;
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x === y) agree++;
    ca.set(x, (ca.get(x) ?? 0) + 1);
    cb.set(y, (cb.get(y) ?? 0) + 1);
  }
  const po = agree / n;
  let pe = 0;
  for (const [k, v] of ca) pe += (v / n) * ((cb.get(k) ?? 0) / n);
  return { kappa: pe === 1 ? null : (po - pe) / (1 - pe), po, pe, n };
}

/**
 * Fleiss' kappa from an items × categories count matrix; every row must sum to the same
 * number of raters n ≥ 2.
 */
export function fleissKappa(counts: ReadonlyArray<ReadonlyArray<number>>): { kappa: number | null; pBar: number | null; peBar: number | null; raters: number; items: number } {
  const N = counts.length;
  if (N === 0) return { kappa: null, pBar: null, peBar: null, raters: 0, items: 0 };
  const n = counts[0]!.reduce((s, x) => s + x, 0);
  if (n < 2) throw new ScoringInputError("Fleiss' kappa needs at least two raters per item");
  const k = counts[0]!.length;
  const colTotals = new Array<number>(k).fill(0);
  let sumPi = 0;
  for (const row of counts) {
    if (row.length !== k || row.reduce((s, x) => s + x, 0) !== n) throw new ScoringInputError("Every item needs the same number of ratings");
    let sq = 0;
    row.forEach((x, j) => {
      sq += x * x;
      colTotals[j] = (colTotals[j] ?? 0) + x;
    });
    sumPi += (sq - n) / (n * (n - 1));
  }
  const pBar = sumPi / N;
  const peBar = colTotals.reduce((s, t) => s + (t / (N * n)) ** 2, 0);
  return { kappa: peBar === 1 ? null : (pBar - peBar) / (1 - peBar), pBar, peBar, raters: n, items: N };
}

export interface RaterAgreementOptions {
  level?: MatchLevel;
  universe?: "union" | "all_possible";
  /** Concept set for "all_possible" (defaults to the union of the raters' concepts and endpoints). */
  conceptIds?: ReadonlyArray<string>;
  /** Relationship types for "all_possible" at the labelled level. */
  relationshipTypes?: ReadonlyArray<string>;
  config?: ScoringConfigInput;
}

export interface RaterAgreementResult {
  metricName: "cmap.rater_agreement";
  metricVersion: string;
  parameters: Record<string, unknown>;
  raters: string[];
  items: number;
  percentAgreement: number | null;
  fleissKappa: number | null;
  fleiss: ReturnType<typeof fleissKappa>;
  pairwise: Array<{ raterA: string; raterB: string; cohensKappa: number | null; percentAgreement: number | null; n: number }>;
  perEdge: Array<{ key: string; support: number; proportion: number; raters: string[] }>;
}

export function canonicalRaterEdges(raters: ReadonlyArray<RaterMapInput>, config: ReturnType<typeof resolveConfig>): Map<string, CanonicalEdge[]> {
  const ids = raters.map((r) => r.raterId);
  if (new Set(ids).size !== ids.length) throw new ScoringInputError("Duplicate rater id");
  if (raters.length < 2) throw new ScoringInputError("Agreement and consensus need at least two raters");
  const out = new Map<string, CanonicalEdge[]>();
  for (const r of raters) {
    out.set(r.raterId, r.edges.map((e) => canonicaliseEdge(e.sourceConceptId, e.targetConceptId, e.relationshipTypeCode, e.directed, config)));
  }
  return out;
}

function allPossibleKeys(conceptIds: string[], level: MatchLevel, types: ReadonlyArray<string> | undefined, undirectedTypes: ReadonlyArray<string>): string[] {
  const keys: string[] = [];
  for (const a of conceptIds) {
    for (const b of conceptIds) {
      if (a === b) continue;
      if (level === "undirected_unlabelled") {
        if (cmp(a, b) < 0) keys.push(`${a}|${b}`);
      } else if (level === "directed_unlabelled") {
        keys.push(`${a}>${b}`);
        if (cmp(a, b) < 0) keys.push(`${a}~${b}`);
      } else {
        if (!types || types.length === 0) throw new ScoringInputError("all_possible at the labelled level needs relationshipTypes");
        for (const t of types) {
          if (undirectedTypes.includes(t)) {
            if (cmp(a, b) < 0) keys.push(`${a}~${b}#${t}`);
          } else keys.push(`${a}>${b}#${t}`);
        }
      }
    }
  }
  return keys;
}

export function raterAgreement(raters: ReadonlyArray<RaterMapInput>, options: RaterAgreementOptions = {}): RaterAgreementResult {
  const config = resolveConfig(options.config ?? {});
  const level = options.level ?? "directed_labelled";
  const universeKind = options.universe ?? "union";
  const canon = canonicalRaterEdges(raters, config);
  const raterIds = [...canon.keys()].sort(cmp);
  const sets = new Map(raterIds.map((id) => [id, new Set((canon.get(id) ?? []).map((e) => e.keys[level]))]));
  const proposed = uniqSorted(raterIds.flatMap((id) => [...(sets.get(id) ?? [])]));
  let universe = proposed;
  if (universeKind === "all_possible") {
    const concepts = uniqSorted([
      ...(options.conceptIds ?? raters.flatMap((r) => r.conceptIds ?? [])),
      ...raterIds.flatMap((id) => (canon.get(id) ?? []).flatMap((e) => [e.source, e.target])),
    ]);
    universe = uniqSorted([...allPossibleKeys(concepts, level, options.relationshipTypes, config.undirectedTypes), ...proposed]);
  }
  const ratingsOf = (id: string) => universe.map((k) => (sets.get(id)?.has(k) ? "present" : "absent"));
  const counts = universe.map((k) => {
    const present = raterIds.filter((id) => sets.get(id)?.has(k)).length;
    return [present, raterIds.length - present];
  });
  const fleiss = fleissKappa(counts);
  const pairwise: RaterAgreementResult["pairwise"] = [];
  for (let i = 0; i < raterIds.length; i++) {
    for (let j = i + 1; j < raterIds.length; j++) {
      const a = raterIds[i]!;
      const b = raterIds[j]!;
      const c = cohensKappa(ratingsOf(a), ratingsOf(b));
      pairwise.push({ raterA: a, raterB: b, cohensKappa: c.kappa, percentAgreement: c.po, n: c.n });
    }
  }
  const perEdge = proposed.map((key) => {
    const rs = raterIds.filter((id) => sets.get(id)?.has(key));
    return { key, support: rs.length, proportion: rs.length / raterIds.length, raters: rs };
  });
  return {
    metricName: "cmap.rater_agreement",
    metricVersion: METRIC_VERSIONS["cmap.rater_agreement"],
    parameters: { level, universe: universeKind, relationshipTypes: options.relationshipTypes ? uniqSorted(options.relationshipTypes) : null, scoring: configParameters(config) },
    raters: raterIds,
    items: universe.length,
    percentAgreement: fleiss.pBar,
    fleissKappa: fleiss.kappa,
    fleiss,
    pairwise,
    perEdge,
  };
}
