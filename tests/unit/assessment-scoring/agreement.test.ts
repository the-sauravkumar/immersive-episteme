import { describe, expect, it } from "vitest";

import { cohensKappa, fleissKappa, raterAgreement, ScoringInputError } from "@/features/assessment/scoring";

import { redge } from "./fixtures";

describe("cohensKappa", () => {
  it("textbook 2x2 example: 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no -> 0.4", () => {
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
  it("union universe, labelled level: positive agreement, no kappa", () => {
    const r = raterAgreement([raterB, raterA]);
    expect(r.items).toBe(4);
    expect(r.percentAgreement).toBeCloseTo(0.5, 12);
    expect(r.positiveAgreement).toBeCloseTo(2 / 3, 12);
    expect(r.fleissKappa).toBeNull();
    expect(r.fleiss.kappa).toBeNull();
    expect(r.kappaUndefinedReason).toMatch(/both-absent/);
    expect(r.pairwise).toEqual([{ raterA: "r-a", raterB: "r-b", cohensKappa: null, percentAgreement: 0.5, positiveAgreement: expect.closeTo(2 / 3, 12), n: 4 }]);
    expect(r.perEdge.find((e) => e.key === "A>B#CAUSES")).toMatchObject({ support: 2, proportion: 1 });
    expect(r.perEdge.find((e) => e.key === "A>D#CAUSES")).toMatchObject({ support: 1, proportion: 0.5, raters: ["r-b"] });
  });

  it("near-perfect agreement never reads as disagreement (final review scoring-01)", () => {
    const shared = Array.from({ length: 18 }, (_, i) => redge(`S${i}`, `T${i}`, "CAUSES", "expected"));
    const a = { raterId: "a", edges: [...shared, redge("U", "V", "CAUSES", "expected")] };
    const b = { raterId: "b", edges: [...shared, redge("W", "X", "CAUSES", "expected")] };
    const r = raterAgreement([a, b]);
    expect(r.positiveAgreement).toBeCloseTo(36 / 38, 12);
    expect(r.pairwise[0]?.positiveAgreement).toBeCloseTo(36 / 38, 12);
    expect(r.fleissKappa).toBeNull();
    expect(r.pairwise[0]?.cohensKappa).toBeNull();
    const k = raterAgreement([a, b], { level: "undirected_unlabelled", universe: "all_possible" });
    expect(k.kappaUndefinedReason).toBeNull();
    expect(k.fleissKappa!).toBeGreaterThan(0.9);
    expect(k.pairwise[0]!.cohensKappa!).toBeGreaterThan(0.9);
    expect(k.positiveAgreement).toBeCloseTo(36 / 38, 12);
  });

  it("three-rater positive agreement is the pooled specific agreement", () => {
    const x = redge("A", "B", "CAUSES", "expected");
    const y = redge("B", "C", "CAUSES", "expected");
    const z = redge("C", "D", "CAUSES", "expected");
    const r = raterAgreement([
      { raterId: "1", edges: [x, y, z] },
      { raterId: "2", edges: [x, y] },
      { raterId: "3", edges: [x] },
    ]);
    expect(r.positiveAgreement).toBeCloseTo(8 / 12, 12);
  });

  it("all-possible universe at the undirected level adds agreed absences", () => {
    const r = raterAgreement([raterA, raterB], { level: "undirected_unlabelled", universe: "all_possible" });
    expect(r.items).toBe(6);
    expect(r.percentAgreement).toBeCloseTo(4 / 6, 12);
    expect(r.fleissKappa).toBeCloseTo(1 / 3, 12);
    expect(r.pairwise[0]?.cohensKappa).toBeCloseTo(1 / 3, 12);
  });

  it("labelled all-possible universe needs the relationship types", () => {
    expect(() => raterAgreement([raterA, raterB], { universe: "all_possible" })).toThrow(ScoringInputError);
    const r = raterAgreement([raterA, raterB], { universe: "all_possible", relationshipTypes: ["CAUSES", "PRODUCES"] });
    expect(r.items).toBe(4 * 3 * 2);
  });

  it("needs two distinct raters", () => {
    expect(() => raterAgreement([raterA])).toThrow(ScoringInputError);
    expect(() => raterAgreement([raterA, { ...raterB, raterId: "r-a" }])).toThrow(ScoringInputError);
  });
});
