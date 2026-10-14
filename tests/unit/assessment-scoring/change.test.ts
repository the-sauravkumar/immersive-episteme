import { describe, expect, it } from "vitest";

import { compareConceptMaps } from "@/features/assessment/scoring";

import { pmap, R1, shuffled } from "./fixtures";

const pre = pmap([
  ["p1", "A", "B", "CAUSES"],
  ["p2", "B", "C", "CAUSES"],
  ["p3", "C", "D", "ENABLES"],
  ["p4", "A", "E", "CAUSES"],
  ["p5", "FREE1", "A", "CAUSES"],
]);
const post = pmap([
  ["q1", "A", "B", "CAUSES"], // unchanged
  ["q2", "B", "C", "ENABLES"], // retyped (CAUSES -> ENABLES)
  ["q3", "D", "C", "ENABLES"], // reoriented (C>D -> D>C)
  ["q4", "B", "D", "USES"], // added
  // A CAUSES E removed
]);

describe("compareConceptMaps", () => {
  const r = compareConceptMaps(pre, post, {}, R1);
  const count = (k: string) => r.scores.find((s) => s.metricName === `cmap.change.${k}`)?.value;

  it("itemises unchanged / retyped / reoriented / added / removed edges", () => {
    expect(count("unchanged")).toBe(1);
    expect(count("retyped")).toBe(1);
    expect(count("reoriented")).toBe(1);
    expect(count("added")).toBe(1);
    expect(count("removed")).toBe(1);
    expect(r.changes).toEqual([
      { kind: "added", before: null, after: "B>D#USES" },
      { kind: "removed", before: "A>E#CAUSES", after: null },
      { kind: "reoriented", before: "C>D#ENABLES", after: "D>C#ENABLES" },
      { kind: "retyped", before: "B>C#CAUSES", after: "B>C#ENABLES" },
      { kind: "unchanged", before: "A>B#CAUSES", after: "A>B#CAUSES" },
    ]);
    expect(r.excludedEdges).toEqual({ pre: ["p5"], post: [] });
  });

  it("reports score deltas against a reference", () => {
    const d = (n: string) => r.scoreDeltas?.find((x) => x.metricName === n);
    // pre valid: A>B, B>C = 2; post valid: A>B, B>D (optional) = 2
    expect(d("cmap.valid_relationships")).toMatchObject({ pre: 2, post: 2, delta: 0 });
    // recall dl: pre 2/4, post 1/4
    expect(d("cmap.recall.dl")?.delta).toBeCloseTo(-0.25, 12);
  });

  it("identical submissions produce only unchanged edges", () => {
    const same = compareConceptMaps(pre, pre);
    expect(same.changes.every((c) => c.kind === "unchanged")).toBe(true);
    expect(same.scoreDeltas).toBeNull();
  });

  it("is independent of edge order", () => {
    const shuffledPost = { nodes: shuffled(post.nodes), edges: shuffled(post.edges) };
    expect(JSON.stringify(compareConceptMaps(pre, shuffledPost, {}, R1))).toBe(JSON.stringify(r));
  });
});
