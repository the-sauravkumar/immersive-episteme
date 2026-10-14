/**
 * Edge normalisation and match keys. Node identity is the concept id (never the label).
 *
 * 1. Equivalence rewrite: if the type has a rule `from -> to`, the type becomes `to` and, when
 *    the rule says `reverse`, source and target swap.
 * 2. Directedness: an edge is undirected if its `directed` flag is false or its (rewritten)
 *    type is listed in `undirectedTypes`. Undirected endpoints are sorted so (A,B) == (B,A).
 * 3. Keys:  undirected_unlabelled  "A|B"        (sorted pair)
 *           directed_unlabelled    "A>B" | "A~B"  (ordered for directed, "~" + sorted for undirected)
 *           directed_labelled      "<L2 key>#TYPE" ("#" alone for an untyped link)
 * Two edges match at a level iff their keys at that level are equal.
 */
import { cmp, type MatchLevel, type ScoringConfig } from "./config";
import type { CanonicalEdge } from "./types";

const RESERVED = /[|>~#]/;

export class ScoringInputError extends Error {
  override name = "ScoringInputError";
}

export function assertConceptId(id: string): void {
  if (id.length === 0 || RESERVED.test(id)) {
    throw new ScoringInputError(`Concept id ${JSON.stringify(id)} is empty or contains a reserved character (| > ~ #)`);
  }
}

export function levelKeys(source: string, target: string, type: string | null, directed: boolean): Record<MatchLevel, string> {
  const [lo, hi] = cmp(source, target) <= 0 ? [source, target] : [target, source];
  const l2 = directed ? `${source}>${target}` : `${lo}~${hi}`;
  return {
    undirected_unlabelled: `${lo}|${hi}`,
    directed_unlabelled: l2,
    directed_labelled: `${l2}#${type ?? ""}`,
  };
}

export function canonicaliseEdge(
  sourceConceptId: string,
  targetConceptId: string,
  type: string | null | undefined,
  directedFlag: boolean | undefined,
  config: Pick<ScoringConfig, "typeEquivalences" | "undirectedTypes">,
): CanonicalEdge {
  assertConceptId(sourceConceptId);
  assertConceptId(targetConceptId);
  if (sourceConceptId === targetConceptId) throw new ScoringInputError("Self-links cannot be canonicalised");
  const originalType = type ?? null;
  let s = sourceConceptId;
  let t = targetConceptId;
  let canonicalType = originalType;
  let reversedByEquivalence = false;
  const rule = originalType === null ? undefined : config.typeEquivalences.find((e) => e.from === originalType);
  if (rule) {
    canonicalType = rule.to;
    if (rule.reverse) {
      [s, t] = [t, s];
      reversedByEquivalence = true;
    }
  }
  const directed = directedFlag !== false && !(canonicalType !== null && config.undirectedTypes.includes(canonicalType));
  if (!directed && cmp(s, t) > 0) [s, t] = [t, s];
  return {
    source: s,
    target: t,
    type: canonicalType,
    directed,
    originalType,
    reversedByEquivalence,
    keys: levelKeys(s, t, canonicalType, directed),
  };
}

/** Sorted, de-duplicated list of strings. */
export function uniqSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(cmp);
}
