/** Generated geometry faces outwards (front faces render with back-face culling) and stays seamless. */
import { describe, expect, it } from "vitest";

import { addBox, addChamferedBox, addPlane, GeometryBuilder, ribbonGeometry } from "@/components/museum/three/geometry";
import type * as THREE from "three";

function badTriangles(g: THREE.BufferGeometry) {
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const idx = g.getIndex()!;
  let bad = 0;
  for (let i = 0; i < idx.count; i += 3) {
    const [a, c, d] = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    const u = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)];
    const v = [p.getX(d) - p.getX(a), p.getY(d) - p.getY(a), p.getZ(d) - p.getZ(a)];
    const cr = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    if (cr[0]! * n.getX(a) + cr[1]! * n.getY(a) + cr[2]! * n.getZ(a) <= 0) bad++;
  }
  return { bad, triangles: idx.count / 3 };
}

function built(f: (b: GeometryBuilder) => void) {
  const b = new GeometryBuilder();
  f(b);
  return b.build("t")!;
}

const box = { min: [0, 0, 0] as [number, number, number], max: [1, 2, 3] as [number, number, number] };

describe("geometry builder", () => {
  it("winds every box, chamfered box and plane counter-clockwise around its normal", () => {
    expect(badTriangles(built((b) => addBox(b, box, {}))).bad).toBe(0);
    expect(badTriangles(built((b) => addChamferedBox(b, box, 0.01, {})))).toEqual({ bad: 0, triangles: 30 });
    for (const f of ["+x", "-x", "+y", "-y", "+z", "-z"] as const) {
      const max: [number, number, number] = f.includes("x") ? [0, 1, 1] : f.includes("y") ? [1, 0, 1] : [1, 1, 0];
      expect(badTriangles(built((b) => addPlane(b, { min: [0, 0, 0], max, facing: f }, {}))).bad, f).toBe(0);
    }
  });

  it("uses world-space metre UVs, so abutting wall pieces continue the texture without a seam", () => {
    const g = built((b) => {
      addBox(b, { min: [0, 0, 0], max: [2, 3, 0.2] }, {});
      addBox(b, { min: [2, 0, 0], max: [4, 3, 0.2] }, {});
    });
    const pos = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    const nor = g.getAttribute("normal");
    const seen = new Map<string, string>();
    let shared = 0;
    for (let i = 0; i < pos.count; i++) {
      const k = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}|${nor.getX(i)},${nor.getY(i)},${nor.getZ(i)}`;
      const u = `${uv.getX(i).toFixed(6)},${uv.getY(i).toFixed(6)}`;
      if (seen.has(k)) {
        expect(seen.get(k)).toBe(u);
        shared++;
      }
      seen.set(k, u);
    }
    expect(shared).toBeGreaterThan(0);
  });

  it("lays a route ribbon 4 mm above the floor, facing up", () => {
    const g = ribbonGeometry([{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 2 }], 0.1, 0.004)!;
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(0.004, 6);
    expect(badTriangles(g).bad).toBe(0);
  });
});
