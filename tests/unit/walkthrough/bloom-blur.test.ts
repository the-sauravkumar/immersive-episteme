import { describe, expect, it } from "vitest";
import { BLOOM_CENTRE_WEIGHT, BLOOM_SIDE_TAPS, BLOOM_SPREAD_TEXELS, bloomBlurPasses } from "@/features/walkthrough/domain/bloom-blur";

const WIDTH = 241;
const CENTRE = 120;

const bilinear = (row: readonly number[], x: number): number => {
  const low = Math.floor(x);
  const share = x - low;
  return (row[low] ?? 0) * (1 - share) + (row[low + 1] ?? 0) * share;
};

const blurOnce = (row: readonly number[]): number[] =>
  row.map((_, x) => BLOOM_SIDE_TAPS.reduce((sum, { offset, weight }) => sum + (bilinear(row, x + offset) + bilinear(row, x - offset)) * weight, row[x]! * BLOOM_CENTRE_WEIGHT));

const blurredPoint = (pixelRatio: number): number[] => {
  let row: number[] = Array.from({ length: WIDTH }, (_, x) => (x === CENTRE ? 1 : 0));
  for (let pass = bloomBlurPasses(pixelRatio); pass > 0; pass--) row = blurOnce(row);
  return row;
};

const spreadOf = (row: readonly number[]): number => {
  const total = row.reduce((sum, each) => sum + each, 0);
  return Math.sqrt(row.reduce((sum, each, x) => sum + each * (x - CENTRE) ** 2, 0) / total);
};

describe("bloom blur", () => {
  it("keeps every blur weight summing to one", () => {
    expect(BLOOM_CENTRE_WEIGHT + 2 * BLOOM_SIDE_TAPS.reduce((sum, { weight }) => sum + weight, 0)).toBeCloseTo(1, 6);
  });

  it.each([1, 1.25, 1.5, 1.75, 2])("spreads a single bright texel into one smooth halo with no gaps at pixel ratio %s", (pixelRatio) => {
    const row = blurredPoint(pixelRatio);
    const reach = Math.ceil(3 * spreadOf(row));
    for (let x = 1; x <= reach; x++) {
      expect(row[CENTRE + x]).toBeGreaterThan(0);
      expect(row[CENTRE + x]).toBeLessThanOrEqual(row[CENTRE + x - 1]!);
    }
  });

  it.each([1, 1.25, 1.5, 1.75, 2])("keeps the halo the same size in CSS pixels at pixel ratio %s", (pixelRatio) => {
    expect(spreadOf(blurredPoint(pixelRatio)) / pixelRatio).toBeGreaterThan(BLOOM_SPREAD_TEXELS * 0.9);
    expect(spreadOf(blurredPoint(pixelRatio)) / pixelRatio).toBeLessThan(BLOOM_SPREAD_TEXELS * 1.1);
  });
});
