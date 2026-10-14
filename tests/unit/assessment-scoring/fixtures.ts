/**
 * Hand-built maps for the scoring tests. Concept ids are short strings (the scorer only needs
 * ids without the reserved characters | > ~ #). Node keys are the lower-cased concept id.
 */
import type { ParticipantMapInput, ReferenceEdgeInput, ReferenceMapInput } from "@/features/assessment/scoring";

export type E = [key: string, source: string, target: string, type?: string | null, directed?: boolean];

/** Participant map from edge tuples; endpoints "x" -> concept "X", "free*" -> free node. */
export function pmap(edges: E[], extraConcepts: string[] = []): ParticipantMapInput {
  const ids = new Set<string>(extraConcepts);
  for (const [, s, t] of edges) {
    ids.add(s);
    ids.add(t);
  }
  return {
    nodes: [...ids].map((id) => ({ key: id.toLowerCase(), conceptId: id.toLowerCase().startsWith("free") ? null : id })),
    edges: edges.map(([key, s, t, type, directed]) => ({
      key,
      source: s.toLowerCase(),
      target: t.toLowerCase(),
      relationshipType: type ?? null,
      ...(directed === undefined ? {} : { directed }),
    })),
  };
}

export function redge(s: string, t: string, type: string | null, status: ReferenceEdgeInput["status"], extra: Partial<ReferenceEdgeInput> = {}): ReferenceEdgeInput {
  return { sourceConceptId: s, targetConceptId: t, relationshipTypeCode: type, status, ...extra };
}

/**
 * Reference R1 over concepts A..E:
 *   r1 A -CAUSES-> B        expected
 *   r2 B -CAUSES-> C        expected
 *   r3 C -PRODUCES-> D      expected
 *   r4 A -SIMILAR_TO- D     expected (undirected type)
 *   r5 B -USES-> D          optional
 */
export const R1: ReferenceMapInput = {
  conceptIds: ["A", "B", "C", "D", "E"],
  edges: [
    redge("A", "B", "CAUSES", "expected"),
    redge("B", "C", "CAUSES", "expected"),
    redge("C", "D", "PRODUCES", "expected"),
    redge("A", "D", "SIMILAR_TO", "expected"),
    redge("B", "D", "USES", "optional"),
  ],
};

/**
 * Participant P1 against R1:
 *   e1 A CAUSES B            correct
 *   e2 C CAUSES B            wrong_direction (reference has B -> C)
 *   e3 C ENABLES D           wrong_type      (reference has PRODUCES)
 *   e4 D SIMILAR_TO A        correct         (undirected, endpoint order irrelevant)
 *   e5 B USES D              optional_match
 *   e6 A CAUSES E            unsupported
 *   e7 A CAUSES X            out_of_scope    (X not in the reference concept set)
 *   e8 A CAUSES B            duplicate of e1
 *   e9 FREE1 CAUSES A        out_of_scope    (free node)
 */
export const P1 = pmap([
  ["e1", "A", "B", "CAUSES"],
  ["e2", "C", "B", "CAUSES"],
  ["e3", "C", "D", "ENABLES"],
  ["e4", "D", "A", "SIMILAR_TO"],
  ["e5", "B", "D", "USES"],
  ["e6", "A", "E", "CAUSES"],
  ["e7", "A", "X", "CAUSES"],
  ["e8", "A", "B", "CAUSES"],
  ["e9", "FREE1", "A", "CAUSES"],
]);

export const CATEGORIES: Record<string, string> = {
  A: "materials",
  B: "process_stages",
  C: "production_outcomes",
  D: "materials",
  E: "tools",
};

/** Deterministic shuffle (reverse + rotate) to check order independence. */
export function shuffled<T>(xs: ReadonlyArray<T>, rot = 3): T[] {
  const r = [...xs].reverse();
  const k = r.length === 0 ? 0 : rot % r.length;
  return [...r.slice(k), ...r.slice(0, k)];
}
