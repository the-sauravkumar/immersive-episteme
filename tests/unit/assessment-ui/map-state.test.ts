/** Concept-map editor reducer: typed/directed edges, revise/reverse/delete, append-only edit log. */
import { describe, expect, it } from "vitest";

import {
  addEdgeProblem,
  emptyState,
  extendsLog,
  initialNodes,
  mapPayloadSchema,
  reduceMap,
  stateFromPayload,
  toPayload,
  type EditorRules,
  type MapAction,
  type MapConcept,
  type MapState,
} from "@/components/assessment/map-state";
import { itemFromForm, rubricLevelsFromText } from "@/server/assessment/forms";

const concepts: MapConcept[] = ["a", "b", "c"].map((x, i) => ({ nodeKey: `c${i + 1}`, conceptId: `00000000-0000-4000-8000-00000000000${i + 1}`, label: `Concept ${x}` }));
const rules: EditorRules = {
  relationshipTypes: [
    { code: "PRECEDES", label: "precedes", directed: true },
    { code: "SIMILAR_TO", label: "is similar to", directed: false },
  ],
  directedLinks: true,
};
let tick = 0;
const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
const apply = (s: MapState, ...actions: MapAction[]) => actions.reduce((acc, a) => reduceMap(acc, a, rules, now), s);

describe("map-state reducer", () => {
  it("lays out the fixed concept set deterministically", () => {
    expect(initialNodes(concepts)).toEqual(initialNodes(concepts));
    expect(initialNodes(concepts).map((n) => n.key)).toEqual(["c1", "c2", "c3"]);
  });

  it("creates typed, directed edges and logs every edit with a timestamp", () => {
    const s = apply(
      emptyState(concepts),
      { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form" },
      { type: "add_edge", source: "c2", target: "c3", relationshipType: "SIMILAR_TO", via: "canvas" },
    );
    expect(s.edges).toEqual([
      { key: "e1", source: "c1", target: "c2", relationshipType: "PRECEDES", directed: true },
      { key: "e2", source: "c2", target: "c3", relationshipType: "SIMILAR_TO", directed: false },
    ]);
    expect(s.editLog.map((l) => [l.seq, l.op, l.via])).toEqual([
      [0, "add_edge", "form"],
      [1, "add_edge", "canvas"],
    ]);
    expect(s.editLog.every((l) => !Number.isNaN(Date.parse(l.at)))).toBe(true);
    expect(mapPayloadSchema.safeParse(toPayload(s)).success).toBe(true);
  });

  it("revises, reverses and deletes edges; never reuses edge keys", () => {
    let s = apply(emptyState(concepts), { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form" });
    s = apply(s, { type: "reverse_edge", edgeKey: "e1", via: "form" });
    expect(s.edges[0]).toMatchObject({ source: "c2", target: "c1" });
    s = apply(s, { type: "retype_edge", edgeKey: "e1", relationshipType: "SIMILAR_TO", via: "form" });
    expect(s.edges[0]).toMatchObject({ relationshipType: "SIMILAR_TO", directed: false });
    // Undirected edges cannot be reversed.
    expect(apply(s, { type: "reverse_edge", edgeKey: "e1", via: "form" })).toBe(s);
    s = apply(s, { type: "delete_edge", edgeKey: "e1", via: "form" }, { type: "add_edge", source: "c1", target: "c3", relationshipType: "PRECEDES", via: "form" });
    expect(s.edges.map((e) => e.key)).toEqual(["e2"]);
    expect(s.editLog.map((l) => l.op)).toEqual(["add_edge", "reverse_edge", "retype_edge", "delete_edge", "add_edge"]);
    expect(s.editLog[2]).toMatchObject({ from: "PRECEDES", to: "SIMILAR_TO" });
    // Restoring from storage continues the key sequence.
    expect(stateFromPayload(toPayload(s)).nextEdge).toBe(3);
  });

  it("refuses self-links, unknown types and duplicates (including reversed symmetric links)", () => {
    const s = apply(emptyState(concepts), { type: "add_edge", source: "c1", target: "c2", relationshipType: "SIMILAR_TO", via: "form" });
    expect(addEdgeProblem(s, "c1", "c1", "PRECEDES", rules)).toMatch(/two different/);
    expect(addEdgeProblem(s, "c1", "c2", null, rules)).toMatch(/type/);
    expect(addEdgeProblem(s, "c1", "c2", "CAUSES", rules)).toMatch(/type/);
    expect(addEdgeProblem(s, "c2", "c1", "SIMILAR_TO", rules)).toMatch(/already exists/);
    expect(addEdgeProblem(s, "c2", "c1", "PRECEDES", rules)).toBeNull();
    expect(apply(s, { type: "add_edge", source: "c2", target: "c1", relationshipType: "SIMILAR_TO", via: "form" })).toBe(s);
  });

  it("makes every link undirected when the item is undirected", () => {
    const undirected = { ...rules, directedLinks: false };
    const s = reduceMap(emptyState(concepts), { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form" }, undirected, now);
    expect(s.edges[0]?.directed).toBe(false);
  });

  it("records node moves (rounded) and ignores no-op moves", () => {
    const s0 = emptyState(concepts);
    const s = apply(s0, { type: "move_node", nodeKey: "c1", x: 12.6, y: -3.2, via: "form" });
    expect(s.nodes[0]).toMatchObject({ x: 13, y: -3 });
    expect(apply(s, { type: "move_node", nodeKey: "c1", x: 13, y: -3, via: "form" })).toBe(s);
  });

  it("accepts only edit logs that extend the stored one, whatever the key order", () => {
    const a = apply(emptyState(concepts), { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form" });
    const b = apply(a, { type: "delete_edge", edgeKey: "e1", via: "form" });
    const reordered = a.editLog.map((l) => Object.fromEntries(Object.entries(l).reverse())) as typeof a.editLog;
    expect(extendsLog(reordered, b.editLog)).toBe(true);
    expect(extendsLog(b.editLog, a.editLog)).toBe(false);
    expect(extendsLog(a.editLog, [{ ...b.editLog[0]!, op: "move_node" }, b.editLog[1]!])).toBe(false);
  });
});

describe("research forms", () => {
  const fd = (entries: Array<[string, string]>) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };

  it("builds a concept-map item from the form", () => {
    const r = itemFromForm(
      fd([
        ["itemKey", "map"],
        ["position", "0"],
        ["kind", "concept_map"],
        ["prompt", "Connect them."],
        ["conceptKeys", "x.material.a\n\n x.outcome.b "],
        ["relationshipTypes", "PRECEDES"],
        ["relationshipTypes", "USES"],
        ["directed", "on"],
      ]),
    );
    expect(r).toEqual({
      ok: true,
      item: {
        itemKey: "map",
        position: 0,
        kind: "concept_map",
        prompt: "Connect them.",
        config: { kind: "concept_map", conceptKeys: ["x.material.a", "x.outcome.b"], relationshipTypes: ["PRECEDES", "USES"], directed: true, allowFreeNodes: false },
      },
    });
  });

  it("builds choice items with answer keys and rejects malformed options", () => {
    const ok = itemFromForm(fd([["kind", "multiple_choice"], ["itemKey", "q"], ["prompt", "p"], ["options", "a: One\nb: Two"], ["answerKey", "a, b"]]));
    expect(ok.ok && ok.item.answerKey).toEqual({ optionIds: ["a", "b"] });
    expect(itemFromForm(fd([["kind", "single_choice"], ["options", "no colon"]])).ok).toBe(false);
  });

  it("parses rubric levels", () => {
    expect(rubricLevelsFromText("0 | None | Nothing\n2 | Full | All of it | really")).toEqual({
      ok: true,
      levels: [
        { value: 0, label: "None", descriptor: "Nothing" },
        { value: 2, label: "Full", descriptor: "All of it | really" },
      ],
    });
    expect(rubricLevelsFromText("x | bad").ok).toBe(false);
  });
});
