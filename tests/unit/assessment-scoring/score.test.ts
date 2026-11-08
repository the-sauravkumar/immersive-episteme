import { describe, expect, it } from "vitest";

import { getScore, scoreConceptMap, ScoringInputError } from "@/features/assessment/scoring";

import { CATEGORIES, P1, pmap, R1, redge } from "./fixtures";

const s = (r: ReturnType<typeof scoreConceptMap>, n: string) => getScore(r, n);

describe("scoreConceptMap — worked example P1 vs R1 (defaults: directed_labelled, optional = neutral)", () => {
  const r = scoreConceptMap(P1, R1, {}, { conceptCategories: CATEGORIES });
  const cls = Object.fromEntries(r.participantEdges.map((e) => [e.edgeKey, e.class]));

  it("classifies every participant edge", () => {
    expect(cls).toEqual({
      e1: "correct",
      e2: "wrong_direction",
      e3: "wrong_type",
      e4: "correct",
      e5: "optional_match",
      e6: "unsupported",
      e7: "out_of_scope",
      e8: "duplicate",
      e9: "out_of_scope",
    });
    const byKey = Object.fromEntries(r.participantEdges.map((e) => [e.edgeKey, e]));
    expect(byKey.e7?.outOfScopeReason).toBe("concept_not_in_reference");
    expect(byKey.e9?.outOfScopeReason).toBe("free_node");
    expect(byKey.e8?.duplicateOf).toBe("e1");
    expect(byKey.e4?.canonicalKey).toBe("A~D#SIMILAR_TO");
  });

  it("valid / incorrect / missing counts", () => {
    expect(s(r, "cmap.valid_relationships")).toBe(2);
    expect(s(r, "cmap.incorrect_relationships")).toBe(3);
    expect(s(r, "cmap.missing_expected_relationships")).toBe(2);
    const missing = r.scores.find((x) => x.metricName === "cmap.missing_expected_relationships")!.details.missing;
    expect(missing).toEqual([
      { key: "B>C#CAUSES", partialMatchLevel: "undirected_unlabelled" },
      { key: "C>D#PRODUCES", partialMatchLevel: "directed_unlabelled" },
    ]);
  });

  it("direction and type correctness", () => {
    expect(s(r, "cmap.direction_correctness")).toBeCloseTo(0.8, 12);
    expect(s(r, "cmap.type_correctness")).toBeCloseTo(0.75, 12);
  });

  it("precision / recall / F1 / Jaccard at three levels", () => {
    expect(s(r, "cmap.precision.dl")).toBeCloseTo(2 / 5, 12);
    expect(s(r, "cmap.recall.dl")).toBeCloseTo(0.5, 12);
    expect(s(r, "cmap.f1.dl")).toBeCloseTo(4 / 9, 12);
    expect(s(r, "cmap.jaccard.dl")).toBeCloseTo(2 / 7, 12);
    expect(s(r, "cmap.precision.du")).toBeCloseTo(3 / 5, 12);
    expect(s(r, "cmap.recall.du")).toBeCloseTo(3 / 4, 12);
    expect(s(r, "cmap.f1.du")).toBeCloseTo(2 / 3, 12);
    expect(s(r, "cmap.jaccard.du")).toBeCloseTo(0.5, 12);
    expect(s(r, "cmap.precision.uu")).toBeCloseTo(4 / 5, 12);
    expect(s(r, "cmap.recall.uu")).toBe(1);
    expect(s(r, "cmap.f1.uu")).toBeCloseTo(8 / 9, 12);
    expect(s(r, "cmap.jaccard.uu")).toBeCloseTo(0.8, 12);
  });

  it("cross-category connections", () => {
    expect(s(r, "cmap.cross_category.total")).toBe(5);
    expect(s(r, "cmap.cross_category.valid")).toBe(1);
    expect(s(r, "cmap.cross_category.valid_normalised")).toBeCloseTo(1 / 3, 12);
  });

  it("causal-chain depth (valid causal edges only)", () => {
    expect(s(r, "cmap.causal_chain_depth")).toBe(1);
    expect(s(r, "cmap.causal_chain_depth_normalised")).toBeCloseTo(1 / 3, 12);
  });

  it("degree-profile similarity (Bray–Curtis over out/in/undirected degree)", () => {
    expect(s(r, "cmap.degree_profile_similarity")).toBeCloseTo(0.7, 12);
  });

  it("edit distance with documented unit costs", () => {
    expect(s(r, "cmap.edit_distance")).toBe(3);
    expect(s(r, "cmap.edit_distance_normalised")).toBeCloseTo(1 / 3, 12);
  });

  it("every score carries name, version, parameters and an itemised breakdown", () => {
    for (const x of r.scores) {
      expect(x.metricVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(x.parameters.validityLevel).toBe("directed_labelled");
      expect(Object.keys(x.details).length).toBeGreaterThan(0);
    }
    expect(new Set(r.scores.map((x) => x.metricName)).size).toBe(r.scores.length);
  });
});

describe("configuration variants", () => {
  it("optional matches are neutral by default (D2; pipeline 1.1.0)", () => {
    expect(scoreConceptMap(P1, R1).parameters.optionalMatch).toBe("neutral");
  });

  it("optionalMatch = valid counts optional matches in the valid count and precision", () => {
    const r = scoreConceptMap(P1, R1, { optionalMatch: "valid" }, { conceptCategories: CATEGORIES });
    expect(getScore(r, "cmap.valid_relationships")).toBe(3);
    expect(getScore(r, "cmap.incorrect_relationships")).toBe(3);
    expect(getScore(r, "cmap.precision.dl")).toBeCloseTo(0.5, 12);
    expect(getScore(r, "cmap.cross_category.valid")).toBe(2);
    expect(getScore(r, "cmap.cross_category.valid_normalised")).toBeCloseTo(1 / 3, 12);
  });

  it("outOfScopeEdges = count_as_incorrect counts free-node and unknown-concept edges", () => {
    const r = scoreConceptMap(P1, R1, { outOfScopeEdges: "count_as_incorrect" });
    expect(getScore(r, "cmap.incorrect_relationships")).toBe(5);
    expect(getScore(r, "cmap.precision.dl")).toBeCloseTo(2 / 7, 12);
    expect(getScore(r, "cmap.edit_distance")).toBe(5);
  });

  it("validityLevel = directed_unlabelled accepts a wrong type", () => {
    const r = scoreConceptMap(P1, R1, { validityLevel: "directed_unlabelled" });
    expect(getScore(r, "cmap.valid_relationships")).toBe(3);
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(1);
  });

  it("validityLevel = undirected_unlabelled accepts a reversed edge", () => {
    const r = scoreConceptMap(P1, R1, { validityLevel: "undirected_unlabelled" });
    expect(getScore(r, "cmap.valid_relationships")).toBe(4);
    expect(getScore(r, "cmap.incorrect_relationships")).toBe(1);
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(0);
  });
});

describe("normalised coverage metrics stay proportions (final review scoring-05)", () => {
  const ref = { conceptIds: ["A", "B", "C", "D"], edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "CAUSES", "optional"), redge("C", "D", "CAUSES", "optional")] };
  const cats = { A: "x", B: "y", C: "x", D: "y" };
  const p = pmap([
    ["e1", "A", "B", "CAUSES"],
    ["e2", "B", "C", "CAUSES"],
    ["e3", "C", "D", "CAUSES"],
  ]);

  for (const optionalMatch of ["valid", "neutral"] as const) {
    it(`optionalMatch = ${optionalMatch}: cross_category.valid_normalised and causal_chain_depth_normalised are 1, never 3`, () => {
      const r = scoreConceptMap(p, ref, { optionalMatch }, { conceptCategories: cats });
      expect(getScore(r, "cmap.recall.dl")).toBe(1);
      expect(getScore(r, "cmap.cross_category.valid_normalised")).toBe(1);
      expect(getScore(r, "cmap.causal_chain_depth_normalised")).toBe(1);
    });
  }

  it("the raw causal depth still counts every valid edge", () => {
    expect(getScore(scoreConceptMap(p, ref, { optionalMatch: "valid" }), "cmap.causal_chain_depth")).toBe(3);
    expect(getScore(scoreConceptMap(p, ref), "cmap.causal_chain_depth")).toBe(1);
  });

  it("at a lenient validity level two edges on one expected pair cover it once", () => {
    const q = pmap([
      ["e1", "A", "B", "CAUSES"],
      ["e2", "A", "B", "ENABLES"],
    ]);
    const r = scoreConceptMap(q, ref, { validityLevel: "undirected_unlabelled" }, { conceptCategories: cats });
    expect(getScore(r, "cmap.cross_category.valid")).toBe(2);
    expect(getScore(r, "cmap.cross_category.valid_normalised")).toBe(1);
  });
});

describe("direction and type handling", () => {
  const ref = { conceptIds: ["A", "B"], edges: [redge("A", "B", "CAUSES", "expected")] };

  it("a reversed directed edge matches only at the undirected level", () => {
    const r = scoreConceptMap(pmap([["e", "B", "A", "CAUSES"]]), ref);
    expect(r.participantEdges[0]?.class).toBe("wrong_direction");
    expect(getScore(r, "cmap.recall.uu")).toBe(1);
    expect(getScore(r, "cmap.recall.du")).toBe(0);
    expect(getScore(r, "cmap.direction_correctness")).toBe(0);
    expect(getScore(r, "cmap.type_correctness")).toBeNull();
  });

  it("an edge drawn undirected in the editor does not match a directed reference edge in direction", () => {
    const r = scoreConceptMap(pmap([["e", "A", "B", "CAUSES", false]]), ref);
    expect(r.participantEdges[0]?.canonicalKey).toBe("A~B#CAUSES");
    expect(r.participantEdges[0]?.class).toBe("wrong_direction");
  });

  it("an untyped link matches a typed reference edge only up to directed_unlabelled", () => {
    const r = scoreConceptMap(pmap([["e", "A", "B", null]]), ref);
    expect(r.participantEdges[0]?.class).toBe("wrong_type");
    expect(getScore(r, "cmap.recall.du")).toBe(1);
    expect(getScore(r, "cmap.recall.dl")).toBe(0);
  });

  it("undirected types ignore the editor's direction flag and endpoint order", () => {
    const r = scoreConceptMap(pmap([["e", "B", "A", "SIMILAR_TO", true]]), { conceptIds: [], edges: [redge("A", "B", "SIMILAR_TO", "expected")] });
    expect(r.participantEdges[0]?.class).toBe("correct");
  });
});

describe("uncertain / optional / required / disputed reference edges", () => {
  const p = pmap([["e1", "A", "B", "CAUSES"]]);

  it("uncertain and optional edges are never missing", () => {
    const ref = {
      conceptIds: ["A", "B", "C"],
      edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "CAUSES", "uncertain"), redge("A", "C", "CAUSES", "optional")],
    };
    const r = scoreConceptMap(p, ref);
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(0);
    expect(getScore(r, "cmap.recall.dl")).toBe(1);
  });

  it("required = true means expected; required = false follows nonRequiredReferenceEdgeStatus", () => {
    const ref = {
      conceptIds: ["A", "B", "C"],
      edges: [redge("A", "B", "CAUSES", undefined, { required: true }), redge("B", "C", "CAUSES", undefined, { required: false })],
    };
    expect(getScore(scoreConceptMap(p, ref), "cmap.missing_expected_relationships")).toBe(0);
    expect(getScore(scoreConceptMap(p, ref, { nonRequiredReferenceEdgeStatus: "expected" }), "cmap.missing_expected_relationships")).toBe(1);
  });

  it("disputed edges block scoring unless explicitly treated as optional", () => {
    const ref = { conceptIds: ["A", "B", "C"], edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "CAUSES", "disputed")] };
    expect(() => scoreConceptMap(p, ref)).toThrow(ScoringInputError);
    const r = scoreConceptMap(p, ref, { disputedReferenceEdges: "treat_as_optional" });
    expect(r.referenceEdges.find((e) => e.canonicalKey === "B>C#CAUSES")?.status).toBe("disputed_as_optional");
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(0);
  });
});

describe("synonym / equivalence configuration", () => {
  it("off by default; ENABLES≈PRODUCES when configured", () => {
    expect(scoreConceptMap(P1, R1).participantEdges.find((e) => e.edgeKey === "e3")?.class).toBe("wrong_type");
    const r = scoreConceptMap(P1, R1, { typeEquivalences: [{ from: "ENABLES", to: "PRODUCES" }] });
    expect(r.participantEdges.find((e) => e.edgeKey === "e3")?.class).toBe("correct");
    expect(getScore(r, "cmap.valid_relationships")).toBe(3);
  });

  it("reversing equivalence: A DEPENDS_ON B ≈ B ENABLES A only when configured", () => {
    const ref = { conceptIds: [], edges: [redge("B", "C", "ENABLES", "expected")] };
    const p = pmap([["e", "C", "B", "DEPENDS_ON"]]);
    expect(scoreConceptMap(p, ref).participantEdges[0]?.class).toBe("wrong_direction");
    const r = scoreConceptMap(p, ref, { typeEquivalences: [{ from: "DEPENDS_ON", to: "ENABLES", reverse: true }] });
    expect(r.participantEdges[0]?.class).toBe("correct");
    expect(r.participantEdges[0]?.canonicalKey).toBe("B>C#ENABLES");
  });

  it("rejects chained equivalences", () => {
    expect(() =>
      scoreConceptMap(P1, R1, { typeEquivalences: [{ from: "ENABLES", to: "PRODUCES" }, { from: "PRODUCES", to: "CAUSES" }] }),
    ).toThrow();
  });
});

describe("empty and identical maps", () => {
  it("empty participant vs R1", () => {
    const r = scoreConceptMap(pmap([]), R1);
    expect(getScore(r, "cmap.valid_relationships")).toBe(0);
    expect(getScore(r, "cmap.incorrect_relationships")).toBe(0);
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(4);
    expect(getScore(r, "cmap.precision.dl")).toBeNull();
    expect(getScore(r, "cmap.recall.dl")).toBe(0);
    expect(getScore(r, "cmap.f1.dl")).toBe(0);
    expect(getScore(r, "cmap.jaccard.dl")).toBe(0);
    expect(getScore(r, "cmap.direction_correctness")).toBeNull();
    expect(getScore(r, "cmap.causal_chain_depth")).toBe(0);
    expect(getScore(r, "cmap.causal_chain_depth_normalised")).toBe(0);
    expect(getScore(r, "cmap.degree_profile_similarity")).toBe(0);
    expect(getScore(r, "cmap.edit_distance")).toBe(4);
    expect(getScore(r, "cmap.edit_distance_normalised")).toBe(1);
    expect(getScore(r, "cmap.cross_category.total")).toBeNull();
  });

  it("both empty: undefined ratios are null, not 0 or 1", () => {
    const r = scoreConceptMap(pmap([]), { conceptIds: ["A", "B"], edges: [] });
    for (const n of ["cmap.precision.dl", "cmap.recall.dl", "cmap.f1.dl", "cmap.jaccard.dl", "cmap.degree_profile_similarity", "cmap.edit_distance_normalised", "cmap.causal_chain_depth_normalised"]) {
      expect(getScore(r, n), n).toBeNull();
    }
    expect(getScore(r, "cmap.edit_distance")).toBe(0);
  });

  it("participant identical to the expected reference scores perfectly", () => {
    const p = pmap([
      ["a", "A", "B", "CAUSES"],
      ["b", "B", "C", "CAUSES"],
      ["c", "C", "D", "PRODUCES"],
      ["d", "A", "D", "SIMILAR_TO"],
    ]);
    const r = scoreConceptMap(p, R1);
    for (const lvl of ["uu", "du", "dl"]) {
      expect(getScore(r, `cmap.precision.${lvl}`)).toBe(1);
      expect(getScore(r, `cmap.recall.${lvl}`)).toBe(1);
      expect(getScore(r, `cmap.f1.${lvl}`)).toBe(1);
      expect(getScore(r, `cmap.jaccard.${lvl}`)).toBe(1);
    }
    expect(getScore(r, "cmap.degree_profile_similarity")).toBe(1);
    expect(getScore(r, "cmap.edit_distance")).toBe(0);
    expect(getScore(r, "cmap.causal_chain_depth_normalised")).toBe(1);
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(0);
  });
});

describe("input validation", () => {
  it("rejects edges to unknown node keys and duplicate edge keys", () => {
    expect(() => scoreConceptMap({ nodes: [{ key: "a", conceptId: "A" }], edges: [{ key: "e", source: "a", target: "z" }] }, R1)).toThrow(ScoringInputError);
    const dup = pmap([["e", "A", "B", "CAUSES"], ["e", "B", "C", "CAUSES"]]);
    expect(() => scoreConceptMap(dup, R1)).toThrow(ScoringInputError);
  });

  it("rejects concept ids with reserved key characters", () => {
    expect(() => scoreConceptMap(pmap([]), { conceptIds: ["A|B"], edges: [] })).toThrow(ScoringInputError);
  });
});
