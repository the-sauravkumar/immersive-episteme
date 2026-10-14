import { describe, expect, it } from "vitest";

import { canonicalJson, compileSpatialManifest, deterministicUuid, sha256Hex } from "@/features/spatial/compiler";

import { compileContent, contentInput } from "./fixtures";

describe("canonical primitives", () => {
  it("sha256 matches the FIPS 180-4 test vectors", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("canonical JSON is independent of key order and normalises -0", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: -0, c: "x" }] })).toBe(canonicalJson({ a: [2, { c: "x", d: 0 }], b: 1 }));
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it("derives valid, stable v8 UUIDs", () => {
    const u = deterministicUuid("concept", "demo.material.x");
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deterministicUuid("concept", "demo.material.x")).toBe(u);
  });
});

describe("compiler determinism", () => {
  it("same graph + config + seed + compiler version gives a byte-identical manifest", () => {
    const a = compileContent("seed-a");
    const b = compileSpatialManifest(contentInput({ seed: "seed-a" }));
    expect(b.manifestHash).toBe(a.manifestHash);
    expect(canonicalJson(b.manifest)).toBe(canonicalJson(a.manifest));
    expect(sha256Hex(canonicalJson(a.manifest))).toBe(a.manifestHash);
  });

  it("does not depend on the order of input concepts, relationships or traditions", () => {
    const base = contentInput({ seed: "seed-a" });
    const shuffled = compileSpatialManifest({
      ...base,
      traditions: [...base.traditions].reverse(),
      graph: {
        ...base.graph,
        concepts: [...base.graph.concepts].reverse(),
        relationships: [...base.graph.relationships].reverse(),
        traditions: [...base.graph.traditions].reverse(),
      },
      assets: [...(base.assets ?? [])].reverse(),
    });
    expect(shuffled.manifestHash).toBe(compileContent("seed-a").manifestHash);
  });

  it("a different seed changes only tie-broken placements", () => {
    const a = compileContent("seed-a").manifest;
    const b = compileContent("seed-b").manifest;
    expect(a.seed).not.toBe(b.seed);
    // Same elements, kinds, owning rooms, concepts and rules.
    const shape = (m: typeof a) => m.elements.map((e) => [e.id, e.kind, e.conceptId, e.ruleId, e.kind === "exhibit" || e.kind === "station" ? e.parentId : null].join("|"));
    expect(shape(b)).toEqual(shape(a));
    // Sequence paths keep their stop order (ordinals are never tie-broken).
    const stops = (m: typeof a) => m.elements.filter((e) => e.kind === "path" && String(e.id).startsWith("path:seq:")).map((e) => e.stops);
    expect(stops(b)).toEqual(stops(a));
    // Something tie-broken did move.
    const pos = (m: typeof a) => new Map(m.elements.filter((e) => e.kind === "exhibit").map((e) => [e.id, JSON.stringify(e.position)]));
    const pa = pos(a);
    const pb = pos(b);
    const moved = [...pa.keys()].filter((k) => pa.get(k) !== pb.get(k));
    expect(moved.length).toBeGreaterThan(0);
    // ...but never a station: process order is data, not a tie.
    const st = (m: typeof a) => m.elements.filter((e) => e.kind === "station").map((e) => [e.id, (e.sequence as { index: number }).index]);
    expect(st(b)).toEqual(st(a));
  });
});
