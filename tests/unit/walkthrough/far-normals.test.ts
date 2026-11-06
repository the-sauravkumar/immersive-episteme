import { describe, expect, it } from "vitest";
import { smoothedNormals } from "@/features/walkthrough/domain/far-normals";

function corrugated(columns: number, spacing: number, wave: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * spacing;
      const tilt = Math.sin((x / wave) * Math.PI * 2) * 0.8;
      positions.push(x, 0, row * spacing);
      const length = Math.hypot(tilt, 1);
      normals.push(tilt / length, 1 / length, 0);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
}

describe("far normals", () => {
  it("leave a flat surface facing the way it faced", () => {
    const { positions } = corrugated(30, 0.005, 1);
    const up = new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0));
    const smoothed = smoothedNormals(positions, up, 0.05);
    for (let i = 0; i < smoothed.length; i += 3) expect([smoothed[i], smoothed[i + 1], smoothed[i + 2]]).toEqual([0, 1, 0]);
  });

  it("average away a weave finer than the radius and keep every normal unit length", () => {
    const { positions, normals } = corrugated(60, 0.002, 0.01);
    const smoothed = smoothedNormals(positions, normals, 0.05);
    let widestTilt = 0;
    for (let i = 0; i < smoothed.length; i += 3) {
      expect(Math.hypot(smoothed[i]!, smoothed[i + 1]!, smoothed[i + 2]!)).toBeCloseTo(1, 5);
      if (positions[i]! > 0.05 && positions[i]! < 0.07) widestTilt = Math.max(widestTilt, Math.abs(smoothed[i]!));
    }
    const sharpest = Math.max(...Array.from(normals.filter((_, i) => i % 3 === 0), Math.abs));
    expect(widestTilt).toBeLessThan(sharpest * 0.25);
  });
});
