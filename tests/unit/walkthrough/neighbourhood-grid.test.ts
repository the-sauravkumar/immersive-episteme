import { describe, expect, it } from "vitest";
import { neighbourhoodGrid, smoothedValues } from "@/features/walkthrough/domain/neighbourhood-grid";

function line(count: number, spacing: number): Float32Array {
  return Float32Array.from({ length: count * 3 }, (_, i) => (i % 3 === 0 ? Math.floor(i / 3) * spacing : 0));
}

describe("neighbourhood grid", () => {
  it("files every vertex in one cell and finds that cell around it", () => {
    const positions = line(50, 0.002);
    const grid = neighbourhoodGrid(positions, 0.01);
    expect(Array.from(grid.members).reduce((sum, members) => sum + members, 0)).toBe(50);
    for (let i = 0; i < 50; i++) {
      const found: number[] = [];
      grid.around(positions[i * 3]!, 0, 0, (cell) => found.push(cell));
      expect(found).toContain(grid.cellOfVertex[i]);
    }
  });

  it("keeps an even value even and smooths a value that flips finer than the radius", () => {
    const positions = line(200, 0.001);
    const even = smoothedValues(positions, new Float32Array(200).fill(0.7), 1, 0.012);
    for (const value of even) expect(value).toBeCloseTo(0.7, 6);
    const flipping = Float32Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 1.2 : 0.8));
    const smoothed = smoothedValues(positions, flipping, 1, 0.012);
    for (let i = 20; i < 180; i++) expect(Math.abs(smoothed[i]! - 1)).toBeLessThan(0.05);
  });

  it("smooths each channel of a wider value on its own", () => {
    const positions = line(100, 0.001);
    const values = Float32Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? 1 : i % 3 === 1 ? 0.5 : 0.25));
    const smoothed = smoothedValues(positions, values, 3, 0.01);
    for (let i = 0; i < 100; i++) expect([smoothed[i * 3], smoothed[i * 3 + 1], smoothed[i * 3 + 2]].map((v) => +v!.toFixed(5))).toEqual([1, 0.5, 0.25]);
  });
});
