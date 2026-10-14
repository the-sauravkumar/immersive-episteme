import { describe, expect, it } from "vitest";

import { canonicalJson, postgresJsonbText } from "../../../src/features/knowledge/graph/canonical-json";
import { findCycles, hasCycle, stronglyConnectedComponents } from "../../../src/features/knowledge/graph/cycles";
import { nameBasedUuid } from "../../../src/features/knowledge/graph/hash";
import { nodeSha256 } from "../../../src/features/knowledge/graph/hash-node";
import { isMarkedLoop, DEFAULT_REGISTRY } from "../../../src/features/knowledge/graph/registry";
import { normaliseTitle, trigramSimilarity, trigrams } from "../../../src/features/knowledge/graph/similarity";
import { uuidSchema } from "../../../src/lib/validation/primitives";
import { CORE_RELATIONSHIP_TYPE_CODES } from "../../../src/lib/validation/enums";

const e = (from: string, to: string) => ({ from, to });

describe("cycle detection (Tarjan)", () => {
  it("finds no cycle in a DAG", () => {
    const dag = [e("a", "b"), e("b", "c"), e("a", "c"), e("c", "d")];
    expect(hasCycle(dag)).toBe(false);
    expect(stronglyConnectedComponents(dag)).toHaveLength(4);
  });

  it("finds a simple cycle, a self-loop, and separate components", () => {
    const edges = [e("a", "b"), e("b", "c"), e("c", "a"), e("x", "x"), e("p", "q"), e("q", "p"), e("c", "p")];
    expect(findCycles(edges)).toEqual([["a", "b", "c"], ["p", "q"], ["x"]]);
  });

  it("is independent of edge order", () => {
    const edges = [e("a", "b"), e("b", "c"), e("c", "a"), e("c", "d"), e("d", "e"), e("e", "d")];
    expect(findCycles([...edges].reverse())).toEqual(findCycles(edges));
  });

  it("handles long chains without recursion limits", () => {
    const chain = Array.from({ length: 20_000 }, (_, i) => e(`n${i}`, `n${i + 1}`));
    expect(hasCycle(chain)).toBe(false);
    expect(hasCycle([...chain, e("n20000", "n0")])).toBe(true);
  });
});

describe("trigram similarity", () => {
  it("normalises case, punctuation and diacritics", () => {
    expect(normaliseTitle("  Ćrème — Brûlée!  ")).toBe("creme brulee");
  });

  it("matches pg_trgm padding", () => {
    expect([...trigrams("cat")].sort()).toEqual(["  c", " ca", "at ", "cat"]);
  });

  it("scores identical titles 1, unrelated titles low and near-duplicates high", () => {
    expect(trigramSimilarity("Stage one", "stage ONE")).toBe(1);
    expect(trigramSimilarity("Stage one", "Material")).toBeLessThan(0.1);
    expect(trigramSimilarity("Material alpha mixture", "Material alpha mixtures")).toBeCloseTo(0.875, 3);
  });
});

describe("canonical JSON and hashing", () => {
  it("sorts keys recursively and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });

  it("prints PostgreSQL jsonb text (keys by length, then bytes)", () => {
    expect(postgresJsonbText({ bb: [1, "x"], a: null, c: { ab: true, b: false } })).toBe('{"a": null, "c": {"b": false, "ab": true}, "bb": [1, "x"]}');
  });

  it("hashes with node:crypto", () => {
    expect(nodeSha256.sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("derives stable RFC 9562 v8 uuids", () => {
    const a = nameBasedUuid(nodeSha256, "concept", "alpha.material.material-a");
    expect(a).toBe(nameBasedUuid(nodeSha256, "concept", "alpha.material.material-a"));
    expect(a).not.toBe(nameBasedUuid(nodeSha256, "concept", "alpha.material.material-b"));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidSchema.safeParse(a).success).toBe(true);
  });
});

describe("relationship registry", () => {
  it("covers every FORMAT v1 core type with semantics and cycle rules", () => {
    for (const code of CORE_RELATIONSHIP_TYPE_CODES) expect(DEFAULT_REGISTRY.get(code), code).toBeDefined();
    expect(DEFAULT_REGISTRY.get("BELONGS_TO")!.allowsCycles).toBe(false);
    expect(DEFAULT_REGISTRY.get("DEPENDS_ON")!.allowsCycles).toBe(false);
    expect(DEFAULT_REGISTRY.get("PRECEDES")!.ordered).toBe(true);
    expect(DEFAULT_REGISTRY.get("SIMILAR_TO")!.directed).toBe(false);
  });

  it("recognises marked loop edges only on unordinalled PRECEDES with a loop condition", () => {
    expect(isMarkedLoop({ type: "PRECEDES", ordinal: null, conditions: "Loop for double dabu." })).toBe(true);
    expect(isMarkedLoop({ type: "PRECEDES", ordinal: 3, conditions: "Loop" })).toBe(false);
    expect(isMarkedLoop({ type: "PRECEDES", ordinal: null, conditions: "Optional." })).toBe(false);
    expect(isMarkedLoop({ type: "DEPENDS_ON", ordinal: null, conditions: "repeat" })).toBe(false);
  });
});
