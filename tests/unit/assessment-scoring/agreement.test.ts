import { describe, expect, it } from "vitest";

import { cohensKappa, fleissKappa, raterAgreement, ScoringInputError } from "@/features/assessment/scoring";

import { redge } from "./fixtures";

describe("cohensKappa", () => {
  it("textbook 2x2 example: 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no -> 0.4", () => {
    // po = (20+15)/50 = 0.7; pA(yes) = 25/50, pB(yes) = 30/50
    // pe = 0.5·0.6 + 0.5·0.4 = 0.5; κ = (0.7-0.5)/(1-0.5) = 0.4
    const a = [...Array(20).fill("y"), ...Array(5).fill("y"), ...Array(10).fill("n"), ...Array(15).fill("n")];
    const b = [...Array(20).fill("y"), ...Array(5).fill("n"), ...Array(10).fill("y"), ...Array(15).fill("n")];
    const k = cohensKappa(a, b);
    expect(k.po).toBeCloseTo(0.7, 12);
    expect(k.pe).toBeCloseTo(0.5, 12);
    expect(k.kappa).toBeCloseTo(0.4, 12);
  });

  it("is null when chance agreement is 1", () => {
    expect(cohensKappa(["y", "y"], ["y", "y"]).kappa).toBeNull();
  });
});

describe("fleissKappa", () => {
  it("Fleiss (1971) worked example as reproduced on Wikipedia: κ ≈ 0.210", () => {
    // 10 subjects, 14 raters, 5 categories.
    const m = [
      [0, 0, 0, 0, 14],
      [0, 2, 6, 4, 2],
      [0, 0, 3, 5, 6],
      [0, 3, 9, 2, 0],
      [2, 2, 8, 1, 1],
      [7, 7, 0, 0, 0],
      [3, 2, 6, 3, 0],
      [2, 5, 3, 2, 2],
      [6, 5, 2, 1, 0],
      [0, 2, 2, 3, 7],
    ];
    // Σ_i (Σ_j n_ij² − 14) = 688 -> P̄ = 688 / (10·14·13) = 688/1820 ≈ 0.378
    // column totals 20,28,39,21,32 of 140 -> P̄e = 4170/19600 ≈ 0.213
    const f = fleissKappa(m);
    const pBar = 688 / 1820;
    const peBar = 4170 / 19600;
    expect(f.pBar).toBeCloseTo(pBar, 12);
    expect(f.peBar).toBeCloseTo(peBar, 12);
    expect(f.kappa).toBeCloseTo((pBar - peBar) / (1 - peBar), 12);
    expect(f.kappa).toBeCloseTo(0.20993, 5);
  });

  it("rejects ragged input", () => {
    expect(() => fleissKappa([[1, 1], [2, 1]])).toThrow(ScoringInputError);
  });
});

const raterA = { raterId: "r-a", edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "CAUSES", "expected"), redge("C", "D", "PRODUCES", "expected")] };
const raterB = { raterId: "r-b", edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "CAUSES", "expected"), redge("A", "D", "CAUSES", "expected")] };

describe("raterAgreement", () => {
  it("union universe, labelled level", () => {
    // items (sorted): A>B#CAUSES, A>D#CAUSES, B>C#CAUSES, C>D#PRODUCES
    // r-a: P A P P ; r-b: P P P A -> agree on 2 of 4 -> po = 0.5
    // both mark 3/4 present: pe = (3/4)² + (1/4)² = 0.625 -> κ = (0.5-0.625)/0.375 = -1/3
    const r = raterAgreement([raterB, raterA]);
    expect(r.items).toBe(4);
    expect(r.percentAgreement).toBeCloseTo(0.5, 12);
    expect(r.fleissKappa).toBeCloseTo(-1 / 3, 12);
    expect(r.pairwise).toEqual([{ raterA: "r-a", raterB: "r-b", cohensKappa: expect.closeTo(-1 / 3, 12), percentAgreement: 0.5, n: 4 }]);
    expect(r.perEdge.find((e) => e.key === "A>B#CAUSES")).toMatchObject({ support: 2, proportion: 1 });
    expect(r.perEdge.find((e) => e.key === "A>D#CAUSES")).toMatchObject({ support: 1, proportion: 0.5, raters: ["r-b"] });
  });

  it("all-possible universe at the undirected level adds agreed absences", () => {
    // pairs over A..D: AB(both) AC(none) AD(b) BC(both) BD(none) CD(a) -> po = 4/6
    // each rater marks 3/6 present: pe = 0.5 -> κ = (2/3 - 1/2)/(1/2) = 1/3
    const r = raterAgreement([raterA, raterB], { level: "undirected_unlabelled", universe: "all_possible" });
    expect(r.items).toBe(6);
    expect(r.percentAgreement).toBeCloseTo(4 / 6, 12);
    expect(r.fleissKappa).toBeCloseTo(1 / 3, 12);
    expect(r.pairwise[0]?.cohensKappa).toBeCloseTo(1 / 3, 12);
  });

  it("labelled all-possible universe needs the relationship types", () => {
    expect(() => raterAgreement([raterA, raterB], { universe: "all_possible" })).toThrow(ScoringInputError);
    const r = raterAgreement([raterA, raterB], { universe: "all_possible", relationshipTypes: ["CAUSES", "PRODUCES"] });
    expect(r.items).toBe(4 * 3 * 2); // 12 ordered pairs × 2 directed types
  });

  it("needs two distinct raters", () => {
    expect(() => raterAgreement([raterA])).toThrow(ScoringInputError);
    expect(() => raterAgreement([raterA, { ...raterB, raterId: "r-a" }])).toThrow(ScoringInputError);
  });
});
