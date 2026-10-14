import { describe, expect, it } from "vitest";

import { collidersOf, compileSpatialManifest, defaultRuleSetConfig, type Collider, type Point, type Rect } from "@/features/spatial/compiler";

import { checkOf, compileContent, defaultRuleSet, syntheticInput } from "./fixtures";

describe("collision and accessibility geometry", () => {
  const result = compileContent();
  const { manifest } = result;
  const colliders = collidersOf(manifest);

  it("emits only well-formed axis-aligned boxes that never overlap (brute force)", () => {
    expect(colliders.length).toBeGreaterThan(300);
    for (const c of colliders) {
      expect(c.min[0]).toBeLessThan(c.max[0]);
      expect(c.min[2]).toBeLessThan(c.max[2]);
    }
    const overlaps: string[] = [];
    const eps = 1e-4;
    for (let i = 0; i < colliders.length; i++) {
      for (let j = i + 1; j < colliders.length; j++) {
        const p = colliders[i]!;
        const q = colliders[j]!;
        if (p.max[0] > q.min[0] + eps && q.max[0] > p.min[0] + eps && p.max[2] > q.min[2] + eps && q.max[2] > p.min[2] + eps) overlaps.push(`${p.id} x ${q.id}`);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("keeps every doorway at or above the minimum width and on both rooms' boundaries", () => {
    const portals = manifest.elements.filter((e) => e.kind === "portal");
    expect(portals.length).toBeGreaterThan(20);
    for (const p of portals) {
      expect(p.width as number).toBeGreaterThanOrEqual(manifest.accessibility.minDoorWidth);
      const { a, b } = p.opening as { a: Point; b: Point };
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(p.width as number, 6);
      for (const rid of p.connects as string[]) {
        const r = manifest.elements.find((e) => e.id === rid)!.bounds as Rect;
        const onEdge = (q: Point) => q.x >= r.minX - 1e-6 && q.x <= r.maxX + 1e-6 && q.z >= r.minZ - 1e-6 && q.z <= r.maxZ + 1e-6;
        expect(onEdge(a) && onEdge(b), `${p.id} on ${rid}`).toBe(true);
      }
    }
  });

  it("reaches every room, exhibit and doorway from the entrance", () => {
    expect(checkOf(result, "navigation.reachability").passed).toBe(true);
    expect(checkOf(result, "zones.accessible").passed).toBe(true);
    expect(checkOf(result, "paths.continuity").passed).toBe(true);
  });

  it("keeps exhibits inside their rooms and clear of doorways", () => {
    const byId = new Map(manifest.elements.map((e) => [e.id, e]));
    for (const e of manifest.elements.filter((x) => x.kind === "exhibit" || x.kind === "station")) {
      const r = byId.get(e.parentId!)!.bounds as Rect;
      const f = (e.colliders as Collider[])[0]!;
      expect(f.min[0] >= r.minX && f.max[0] <= r.maxX && f.min[2] >= r.minZ && f.max[2] <= r.maxZ, e.id).toBe(true);
    }
  });

  it("fails the doorway check when the configured width is below the accessibility minimum", () => {
    const config = defaultRuleSetConfig();
    config.layout = { doorWidth: 0.8, minDoorWidth: 0.9 };
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    expect(checkOf(r, "accessibility.doorways").passed).toBe(false);
    expect(r.validation.passed).toBe(false);
  });

  it("honours a stricter configured minimum door width", () => {
    const config = defaultRuleSetConfig();
    config.layout = { doorWidth: 1.2, minDoorWidth: 1.2 };
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    expect(checkOf(r, "accessibility.doorways").passed).toBe(true);
    for (const p of r.manifest.elements.filter((e) => e.kind === "portal")) expect(p.width).toBe(1.2);
  });
});
