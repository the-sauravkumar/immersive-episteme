import { describe, expect, it } from "vitest";
import { wallPlaneNormals } from "@/features/walkthrough/domain/far-normals";

function corrugated(columns: number, spacing: number, wave: number, depth: number, lift = 0) {
  const positions: number[] = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * spacing;
      positions.push(x, lift + Math.sin((x / wave) * Math.PI * 2) * depth, row * spacing);
    }
  }
  return Float32Array.from(positions);
}

const tiltOf = (normals: Float32Array, i: number) => Math.hypot(normals[i]!, normals[i + 2]!);

describe("far normals", () => {
  it("leave a flat surface facing the way it faced", () => {
    const normals = wallPlaneNormals(corrugated(30, 0.005, 1, 0), 0.05);
    for (let i = 0; i < normals.length; i += 3) {
      expect(normals[i + 1]).toBeCloseTo(1, 6);
      expect(tiltOf(normals, i)).toBeLessThan(1e-6);
    }
  });

  it("follow the plane of a weave finer than the radius and keep every normal unit length", () => {
    const normals = wallPlaneNormals(corrugated(60, 0.002, 0.01, 0.002), 0.05);
    for (let i = 0; i < normals.length; i += 3) {
      expect(Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!)).toBeCloseTo(1, 5);
      expect(Math.abs(normals[i + 1]!)).toBeGreaterThan(0.98);
    }
  });

  it("give both faces of a thin open wall the wall's own plane instead of cancelling to nothing", () => {
    const outer = corrugated(40, 0.003, 0.012, 0.0015, 0.004);
    const inner = corrugated(40, 0.003, 0.012, 0.0015, -0.004);
    const normals = wallPlaneNormals(Float32Array.from([...outer, ...inner]), 0.05);
    for (let i = 0; i < normals.length; i += 3) expect(Math.abs(normals[i + 1]!)).toBeGreaterThan(0.98);
  });
});
