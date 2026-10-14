import { describe, expect, it } from "vitest";

import { buildConsensus, getScore, majorityDecision, scoreConceptMap, ScoringInputError } from "@/features/assessment/scoring";

import { pmap, redge } from "./fixtures";

const r1 = { raterId: "r1", edges: [redge("A", "B", "CAUSES", undefined, { required: true }), redge("B", "C", "CAUSES", undefined, { required: true }), redge("C", "D", "PRODUCES", "optional")] };
const r2 = { raterId: "r2", edges: [redge("A", "B", "CAUSES", undefined, { required: true }), redge("B", "C", "CAUSES", undefined, { required: false }), redge("A", "D", "CAUSES", undefined, { required: true })] };
const r3 = { raterId: "r3", edges: [redge("A", "B", "CAUSES", undefined, { required: true }), redge("C", "D", "PRODUCES", undefined, { required: true })] };
const r4 = { raterId: "r4", edges: [redge("A", "D", "CAUSES", undefined, { required: true })] };

describe("majorityDecision (K raters, s support, x expected support)", () => {
  it.each([
    [3, 3, 3, "expected"], // 2x=6 > 3
    [2, 1, 3, "optional"], // 2s=4 > 3, 2x=2 ≠ 3
    [1, 1, 3, "excluded"], // 2s=2 < 3
    [2, 2, 4, "disputed"], // 2s=4 = 4 (include/exclude tie)
    [2, 1, 2, "disputed"], // 2s>2, 2x=2 = K (expected/optional tie)
    [3, 2, 4, "disputed"], // 2s=6>4, 2x=4 = K
  ] as const)("s=%i x=%i K=%i -> %s", (s, x, k, d) => {
    expect(majorityDecision(s, x, k)).toBe(d);
  });
});

describe("buildConsensus", () => {
  it("three raters: strict majority, no ties", () => {
    const c = buildConsensus([r3, r1, r2]);
    const dec = Object.fromEntries(c.edges.map((e) => [e.key, [e.decision, e.support, e.expectedSupport]]));
    expect(dec).toEqual({
      "A>B#CAUSES": ["expected", 3, 3],
      "A>D#CAUSES": ["excluded", 1, 1],
      "B>C#CAUSES": ["optional", 2, 1],
      "C>D#PRODUCES": ["optional", 2, 1],
    });
    expect(c.isComplete).toBe(true);
    expect(c.edges.find((e) => e.key === "B>C#CAUSES")?.agreement).toBeCloseTo(2 / 3, 12);
    expect(c.referenceMap.edges).toHaveLength(3);
  });

  it("four raters: ties are flagged as disputed and block scoring until adjudicated", () => {
    const c = buildConsensus([r1, r2, r3, r4]);
    expect(c.unresolved).toEqual(["A>D#CAUSES", "B>C#CAUSES", "C>D#PRODUCES"]);
    expect(c.isComplete).toBe(false);
    const p = pmap([["e", "A", "B", "CAUSES"]]);
    expect(() => scoreConceptMap(p, c.referenceMap)).toThrow(ScoringInputError);

    const adj = buildConsensus([r1, r2, r3, r4], {
      adjudications: [
        { key: "A>D#CAUSES", decision: "expected", adjudicatorId: "adj" },
        { key: "B>C#CAUSES", decision: "optional", adjudicatorId: "adj" },
        { key: "C>D#PRODUCES", decision: "excluded", adjudicatorId: "adj", note: "out of scope for this item" },
      ],
    });
    expect(adj.isComplete).toBe(true);
    expect(adj.edges.filter((e) => e.decidedBy === "adjudication").map((e) => e.majorityDecision)).toEqual(["disputed", "disputed", "disputed"]);
    const r = scoreConceptMap(p, adj.referenceMap);
    // expected: A>B, A>D -> participant has A>B only
    expect(getScore(r, "cmap.recall.dl")).toBeCloseTo(0.5, 12);
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(1);
  });

  it("rejects adjudications of unknown edges", () => {
    expect(() => buildConsensus([r1, r2], { adjudications: [{ key: "X>Y#CAUSES", decision: "expected", adjudicatorId: "a" }] })).toThrow(ScoringInputError);
  });

  it("applies equivalence rules before counting support", () => {
    const a = { raterId: "a", edges: [redge("A", "B", "DEPENDS_ON", "expected")] };
    const b = { raterId: "b", edges: [redge("B", "A", "ENABLES", "expected")] };
    const off = buildConsensus([a, b]);
    expect(off.unresolved).toHaveLength(2);
    const on = buildConsensus([a, b], { config: { typeEquivalences: [{ from: "DEPENDS_ON", to: "ENABLES", reverse: true }] } });
    expect(on.edges).toHaveLength(1);
    expect(on.edges[0]).toMatchObject({ key: "B>A#ENABLES", decision: "expected", support: 2 });
  });
});
