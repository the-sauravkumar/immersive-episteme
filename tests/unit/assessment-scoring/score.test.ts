import { describe, expect, it } from "vitest";

import { getScore, scoreConceptMap, ScoringInputError } from "@/features/assessment/scoring";

import { CATEGORIES, P1, pmap, R1, redge } from "./fixtures";

const s = (r: ReturnType<typeof scoreConceptMap>, n: string) => getScore(r, n);

describe("scoreConceptMap — worked example P1 vs R1 (defaults: directed_labelled, optional = valid)", () => {
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
    // valid = e1, e4 (expected) + e5 (optional, counted valid) = 3
    expect(s(r, "cmap.valid_relationships")).toBe(3);
    // incorrect = e2 (direction), e3 (type), e6 (unsupported) = 3; e7/e9 excluded, e8 duplicate
    expect(s(r, "cmap.incorrect_relationships")).toBe(3);
    // expected r1..r4; r1 (e1) and r4 (e4) matched -> r2, r3 missing = 2; optional r5 never missing
    expect(s(r, "cmap.missing_expected_relationships")).toBe(2);
    const missing = r.scores.find((x) => x.metricName === "cmap.missing_expected_relationships")!.details.missing;
    expect(missing).toEqual([
      { key: "B>C#CAUSES", partialMatchLevel: "undirected_unlabelled" },
      { key: "C>D#PRODUCES", partialMatchLevel: "directed_unlabelled" },
    ]);
  });

  it("direction and type correctness", () => {
    // pair matches (L1+): e1 e2 e3 e4 e5 = 5; also direction (L2+): e1 e3 e4 e5 = 4 -> 4/5
    expect(s(r, "cmap.direction_correctness")).toBeCloseTo(0.8, 12);
    // L2+: 4; also type (L3): e1 e4 e5 = 3 -> 3/4
    expect(s(r, "cmap.type_correctness")).toBeCloseTo(0.75, 12);
  });

  it("precision / recall / F1 / Jaccard at three levels", () => {
    // dl: P = 6 distinct keys, E = 4, O = {B>D#USES}
    //   precision = |P∩(E∪O)|/|P| = 3/6; recall = 2/4; F1 = 0.5
    //   Jaccard: P' = P\O = 5, |P'∩E| = 2, union = 5+4-2 = 7 -> 2/7
    expect(s(r, "cmap.precision.dl")).toBeCloseTo(0.5, 12);
    expect(s(r, "cmap.recall.dl")).toBeCloseTo(0.5, 12);
    expect(s(r, "cmap.f1.dl")).toBeCloseTo(0.5, 12);
    expect(s(r, "cmap.jaccard.dl")).toBeCloseTo(2 / 7, 12);
    // du: P = {A>B, C>B, C>D, A~D, B>D, A>E}; P∩E = {A>B, C>D, A~D} = 3; P∩O = 1
    //   precision = 4/6; recall = 3/4; F1 = 2(2/3)(3/4)/(2/3+3/4) = 1/(17/12) = 12/17
    //   Jaccard = 3 / (5 + 4 - 3) = 1/2
    expect(s(r, "cmap.precision.du")).toBeCloseTo(4 / 6, 12);
    expect(s(r, "cmap.recall.du")).toBeCloseTo(3 / 4, 12);
    expect(s(r, "cmap.f1.du")).toBeCloseTo(12 / 17, 12);
    expect(s(r, "cmap.jaccard.du")).toBeCloseTo(0.5, 12);
    // uu: P = {A|B, B|C, C|D, A|D, B|D, A|E}; P∩E = 4; P∩O = 1
    //   precision = 5/6; recall = 4/4; F1 = (10/6)/(11/6) = 10/11; Jaccard = 4/(5+4-4) = 4/5
    expect(s(r, "cmap.precision.uu")).toBeCloseTo(5 / 6, 12);
    expect(s(r, "cmap.recall.uu")).toBe(1);
    expect(s(r, "cmap.f1.uu")).toBeCloseTo(10 / 11, 12);
    expect(s(r, "cmap.jaccard.uu")).toBeCloseTo(0.8, 12);
  });

  it("cross-category connections", () => {
    // A materials, B process_stages, C production_outcomes, D materials, E tools
    // in-scope kept: e1 A-B ✓cross, e2 C-B cross, e3 C-D cross, e4 A-D same, e5 B-D ✓cross, e6 A-E cross
    expect(s(r, "cmap.cross_category.total")).toBe(5);
    expect(s(r, "cmap.cross_category.valid")).toBe(2); // e1, e5
    // reference expected cross: r1 A-B, r2 B-C, r3 C-D (r4 A-D is within materials) = 3 -> 2/3
    expect(s(r, "cmap.cross_category.valid_normalised")).toBeCloseTo(2 / 3, 12);
  });

  it("causal-chain depth (valid causal edges only)", () => {
    // valid causal edges: e1 A->B only (e2, e3 invalid) -> depth 1; reference A->B->C->D = 3
    expect(s(r, "cmap.causal_chain_depth")).toBe(1);
    expect(s(r, "cmap.causal_chain_depth_normalised")).toBeCloseTo(1 / 3, 12);
  });

  it("degree-profile similarity (Bray–Curtis over out/in/undirected degree)", () => {
    // participant (out,in,und): A[2,0,1] B[1,2,0] C[2,0,0] D[0,2,1] E[0,1,0]  sum 12
    // reference:                A[1,0,1] B[1,1,0] C[1,1,0] D[0,1,1] E[0,0,0]  sum 8
    // Σ|p-r| = 1+1+2+1+1 = 6; S = 1 - 6/20 = 0.7
    expect(s(r, "cmap.degree_profile_similarity")).toBeCloseTo(0.7, 12);
  });

  it("edit distance with documented unit costs", () => {
    // P (minus optional-only B>D#USES) = 5, E = 4; exact: A>B#CAUSES, A~D#SIMILAR_TO (0)
    // A>E#CAUSES delete (1); C>B#CAUSES -> B>C#CAUSES reverse (1); C>D#ENABLES -> PRODUCES relabel (1)
    // cost 3; max = 5·1 + 4·1 = 9 -> 1/3
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
  it("optionalMatch = neutral removes optional matches from valid count and precision", () => {
    const r = scoreConceptMap(P1, R1, { optionalMatch: "neutral" });
    expect(getScore(r, "cmap.valid_relationships")).toBe(2);
    expect(getScore(r, "cmap.incorrect_relationships")).toBe(3);
    // dl: P\O = 5, hits on E = 2 -> 2/5
    expect(getScore(r, "cmap.precision.dl")).toBeCloseTo(0.4, 12);
  });

  it("outOfScopeEdges = count_as_incorrect counts free-node and unknown-concept edges", () => {
    const r = scoreConceptMap(P1, R1, { outOfScopeEdges: "count_as_incorrect" });
    expect(getScore(r, "cmap.incorrect_relationships")).toBe(5); // + e7, e9
    expect(getScore(r, "cmap.precision.dl")).toBeCloseTo(3 / 8, 12); // 3 / (6 + 2)
    expect(getScore(r, "cmap.edit_distance")).toBe(5); // 3 + two deletes
  });

  it("validityLevel = directed_unlabelled accepts a wrong type", () => {
    const r = scoreConceptMap(P1, R1, { validityLevel: "directed_unlabelled" });
    expect(getScore(r, "cmap.valid_relationships")).toBe(4); // e1 e3 e4 e5
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(1); // only r2 (B>C) unmatched in direction
  });

  it("validityLevel = undirected_unlabelled accepts a reversed edge", () => {
    const r = scoreConceptMap(P1, R1, { validityLevel: "undirected_unlabelled" });
    expect(getScore(r, "cmap.valid_relationships")).toBe(5);
    expect(getScore(r, "cmap.incorrect_relationships")).toBe(1); // e6
    expect(getScore(r, "cmap.missing_expected_relationships")).toBe(0);
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
    expect(getScore(r, "cmap.type_correctness")).toBeNull(); // no edge matches in direction
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
    expect(getScore(r, "cmap.valid_relationships")).toBe(4);
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
    expect(getScore(r, "cmap.precision.dl")).toBeNull(); // 0/0
    expect(getScore(r, "cmap.recall.dl")).toBe(0);
    expect(getScore(r, "cmap.f1.dl")).toBe(0);
    expect(getScore(r, "cmap.jaccard.dl")).toBe(0); // 0/4
    expect(getScore(r, "cmap.direction_correctness")).toBeNull();
    expect(getScore(r, "cmap.causal_chain_depth")).toBe(0);
    expect(getScore(r, "cmap.causal_chain_depth_normalised")).toBe(0);
    expect(getScore(r, "cmap.degree_profile_similarity")).toBe(0); // 1 - 8/8
    expect(getScore(r, "cmap.edit_distance")).toBe(4);
    expect(getScore(r, "cmap.edit_distance_normalised")).toBe(1);
    expect(getScore(r, "cmap.cross_category.total")).toBeNull(); // no categories supplied
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
