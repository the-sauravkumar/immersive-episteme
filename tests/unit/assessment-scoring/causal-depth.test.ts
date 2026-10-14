import { describe, expect, it } from "vitest";

import { getScore, longestSimplePath, scoreConceptMap } from "@/features/assessment/scoring";

import { pmap, redge } from "./fixtures";

const arcs = (s: string): Array<[string, string]> => s.split(" ").map((a) => a.split(">") as [string, string]);

describe("longestSimplePath", () => {
  it("chain A>B>C>D has depth 3", () => {
    const r = longestSimplePath(arcs("A>B B>C C>D"), 1e6);
    expect(r.depth).toBe(3);
    expect(r.path).toEqual(["A", "B", "C", "D"]);
  });

  it("branches: A>B, B>C, B>D, D>E -> A,B,D,E (3)", () => {
    const r = longestSimplePath(arcs("A>B B>C B>D D>E"), 1e6);
    expect(r.depth).toBe(3);
    expect(r.path).toEqual(["A", "B", "D", "E"]);
  });

  it("cycle A>B>C>A plus C>D terminates; longest simple path has 3 edges", () => {
    // candidates: A,B,C,D (3); B,C,A (2); C,A,B (2) ... nodes never repeat
    const r = longestSimplePath(arcs("A>B B>C C>A C>D"), 1e6);
    expect(r.depth).toBe(3);
    expect(r.path).toEqual(["A", "B", "C", "D"]);
    expect(r.budgetExceeded).toBe(false);
  });

  it("pure 2-cycle A>B>A has depth 1", () => {
    expect(longestSimplePath(arcs("A>B B>A"), 1e6).depth).toBe(1);
  });

  it("ties broken by the lexicographically smallest node sequence", () => {
    expect(longestSimplePath(arcs("Y>Z A>B"), 1e6).path).toEqual(["A", "B"]);
  });

  it("returns null (not a guess) when the search budget is exceeded", () => {
    const nodes = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const all: Array<[string, string]> = nodes.flatMap((a) => nodes.filter((b) => b !== a).map((b): [string, string] => [a, b]));
    const r = longestSimplePath(all, 100);
    expect(r.depth).toBeNull();
    expect(r.budgetExceeded).toBe(true);
    // with an ample budget a complete digraph on 8 nodes has a Hamiltonian path: 7
    expect(longestSimplePath(all, 1e7).depth).toBe(7);
  });

  it("empty graph has depth 0", () => {
    expect(longestSimplePath([], 10).depth).toBe(0);
  });
});

describe("causal-chain depth in scoring", () => {
  const ref = {
    conceptIds: [],
    edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "ENABLES", "expected"), redge("C", "D", "PRODUCES", "expected"), redge("A", "D", "USES", "expected")],
  };

  it("counts only causal types and only valid edges", () => {
    // A>B CAUSES valid, B>C ENABLES valid, C>D drawn as CAUSES (wrong type -> invalid), A>D USES (not causal)
    const p = pmap([
      ["1", "A", "B", "CAUSES"],
      ["2", "B", "C", "ENABLES"],
      ["3", "C", "D", "CAUSES"],
      ["4", "A", "D", "USES"],
    ]);
    const r = scoreConceptMap(p, ref);
    expect(getScore(r, "cmap.causal_chain_depth")).toBe(2); // A>B>C
    expect(getScore(r, "cmap.causal_chain_depth_normalised")).toBeCloseTo(2 / 3, 12); // ref A>B>C>D = 3
  });

  it("AFFECTED_BY is oriented against the arrow (B AFFECTED_BY A means A -> B)", () => {
    const ref2 = { conceptIds: [], edges: [redge("B", "A", "AFFECTED_BY", "expected"), redge("B", "C", "CAUSES", "expected")] };
    const p = pmap([
      ["1", "B", "A", "AFFECTED_BY"],
      ["2", "B", "C", "CAUSES"],
    ]);
    expect(getScore(scoreConceptMap(p, ref2), "cmap.causal_chain_depth")).toBe(2); // A -> B -> C
  });

  it("a cyclic valid participant map terminates", () => {
    const ref3 = { conceptIds: [], edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "CAUSES", "expected"), redge("C", "A", "CAUSES", "expected")] };
    const p = pmap([
      ["1", "A", "B", "CAUSES"],
      ["2", "B", "C", "CAUSES"],
      ["3", "C", "A", "CAUSES"],
    ]);
    expect(getScore(scoreConceptMap(p, ref3), "cmap.causal_chain_depth")).toBe(2);
  });
});
