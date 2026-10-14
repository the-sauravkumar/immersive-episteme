import { describe, expect, it } from "vitest";

import { compileSpatialManifest, defaultRuleSetConfig, type Point } from "@/features/spatial/compiler";

import { checkOf, compileContent, defaultRuleSet, loadContent, syntheticInput } from "./fixtures";

const CAUSAL = new Set(["CAUSES", "ENABLES", "PRODUCES", "AFFECTED_BY"]);

describe("sequence -> path", () => {
  const { manifest } = compileContent();
  const byId = new Map(manifest.elements.map((e) => [e.id, e]));
  const graph = loadContent().graph;
  const keyOf = new Map(graph.concepts.map((c) => [c.id, c.key]));

  it("turns each PRECEDES chain into one ordered path whose stops follow the ordinals", () => {
    for (const slug of ["ajrakh", "sanganeri", "machilipatnam-kalamkari"]) {
      const edges = graph.relationships
        .filter((r) => r.type === "PRECEDES" && r.source.startsWith(`${slug}.process_stage.`) && r.ordinal != null)
        .sort((a, b) => a.ordinal! - b.ordinal!);
      const expected = [edges[0]!.source, ...edges.map((e) => e.target)];
      const path = byId.get(`path:seq:${expected[0]}`);
      expect(path, slug).toBeDefined();
      expect(path!.ordered).toBe(true);
      expect(path!.orderSource).toBe("ordinal");
      const stops = (path!.stops as string[]).map((id) => keyOf.get(byId.get(id)!.conceptId!));
      expect(stops).toEqual(expected);
    }
  });

  it("routes the path through every station's approach point in order", () => {
    for (const path of manifest.elements.filter((e) => e.kind === "path" && e.id.startsWith("path:seq:"))) {
      const wps = path.waypoints as Point[];
      let cursor = 0;
      for (const sid of path.stops as string[]) {
        const ap = byId.get(sid)!.approach as Point;
        const idx = wps.findIndex((w, i) => i >= cursor && w.x === ap.x && w.z === ap.z);
        expect(idx, `${path.id} -> ${sid}`).toBeGreaterThanOrEqual(cursor);
        cursor = idx;
      }
      expect(path.broken).toBe(false);
    }
  });

  it("places consecutive stages in consecutive wall slots of one room", () => {
    const path = byId.get("path:seq:ajrakh.process_stage.saaj")!;
    const stations = (path.stops as string[]).map((id) => byId.get(id)!);
    expect(new Set(stations.map((s) => s.parentId)).size).toBe(1);
    const orders = stations.map((s) => s.wallOrder as number);
    orders.slice(1).forEach((o, i) => expect(o).toBe(orders[i]! + 1));
  });
});

describe("causality -> explanatory progression (never proximity alone)", () => {
  const { manifest } = compileContent();
  const byId = new Map(manifest.elements.map((e) => [e.id, e]));

  it("gives every causal relationship an explanation trigger with a routed progression", () => {
    const causal = manifest.traceability.relationships.filter((r) => CAUSAL.has(r.type));
    expect(causal.length).toBeGreaterThan(20);
    for (const r of causal) {
      const encs = r.encodings.map((e) => e.encoding);
      expect(encs, r.relationshipId).toContain("explicit_link");
      expect(encs.every((e) => e === "adjacency" || e === "containment")).toBe(false);
      const cue = r.encodings.flatMap((e) => e.elementIds).map((id) => byId.get(id)!).find((e) => e.kind === "cue");
      expect(cue, r.relationshipId).toBeDefined();
      const trigger = cue!.trigger as { type: string; elementId: string };
      expect(trigger.type).toBe("select");
      expect(byId.get(trigger.elementId)?.kind).toMatch(/exhibit|station/);
      expect(((cue!.effect as { route: Point[] }).route ?? []).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("flags a rule set that maps causal links to adjacency", () => {
    const config = defaultRuleSetConfig();
    const causalRule = config.rules.find((r) => r.id === "causality.explanatory-progression")!;
    causalRule.emit = { kind: "exhibit", encoding: "adjacency", params: { strategy: "adjacency" } };
    const result = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    expect(checkOf(result, "rules.consistent").passed).toBe(false);
    expect(checkOf(result, "causality.explicit").passed).toBe(false);
    expect(result.validation.passed).toBe(false);
  });
});

describe("dependency, science, association and comparison rules", () => {
  const { manifest } = compileContent();
  const byId = new Map(manifest.elements.map((e) => [e.id, e]));
  const rels = manifest.traceability.relationships;

  it("encodes DEPENDS_ON / REQUIRES as thresholds", () => {
    const deps = rels.filter((r) => r.type === "DEPENDS_ON" || r.type === "REQUIRES");
    expect(deps.length).toBeGreaterThan(0);
    for (const r of deps) expect(r.encodings.some((e) => e.encoding === "threshold"), r.relationshipId).toBe(true);
  });

  it("encodes SCIENTIFICALLY_EXPLAINED_BY as a progressive-disclosure layer on the explained exhibit", () => {
    for (const r of rels.filter((x) => x.type === "SCIENTIFICALLY_EXPLAINED_BY")) {
      const enc = r.encodings.find((e) => e.encoding === "layer");
      expect(enc, r.relationshipId).toBeDefined();
      const ex = byId.get(enc!.elementIds[0]!)!;
      expect(ex.conceptId).toBe(r.sourceConceptId);
      const layer = (ex.layers as { relationshipId: string; kind: string; depth: number }[]).find((l) => l.relationshipId === r.relationshipId);
      expect(layer?.kind).toBe("science");
      expect(layer!.depth).toBeGreaterThanOrEqual(1);
    }
  });

  it("encodes adjacency only for exhibits that really are neighbours", () => {
    for (const r of rels.filter((x) => x.encodings.some((e) => e.encoding === "adjacency" && e.ruleId === "association.adjacency"))) {
      const [a, b] = r.encodings.find((e) => e.ruleId === "association.adjacency")!.elementIds.map((id) => byId.get(id)!);
      expect(a!.parentId).toBe(b!.parentId);
      const pa = a!.approach as Point;
      const pb = b!.approach as Point;
      expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeLessThanOrEqual(3.5 + 1e-6);
    }
  });

  it("connects compared traditions through comparison paths in the hall", () => {
    const cmp = manifest.elements.filter((e) => e.kind === "path" && e.id.startsWith("path:cmp:"));
    expect(cmp.length).toBe(3);
    for (const p of cmp) {
      expect(p.parentId).toBe("room:hall");
      expect(p.encodes.every((e) => e.encoding === "juxtaposition")).toBe(true);
      expect((p.waypoints as Point[]).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("joins rooms with cross-category relationships by doorways that record them", () => {
    const doors = manifest.elements.filter((e) => e.kind === "portal" && e.ruleId === "cross-category.connection");
    expect(doors.length).toBeGreaterThan(0);
    for (const d of doors) expect(d.encodes.length).toBeGreaterThan(0);
  });
});
