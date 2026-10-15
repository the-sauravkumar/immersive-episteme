/** Descriptive statistics of the research dashboard against hand-computed values. */
import { describe as suite, expect, it } from "vitest";

import { describe, incompleteBeta, tCdf, tQuantile } from "../../../src/features/research/descriptive";

suite("descriptive statistics", () => {
  it("n, mean, SD (n − 1), median and the 95% t interval of 1..5", () => {
    const d = describe([1, 2, 3, 4, 5]);
    expect(d.n).toBe(5);
    expect(d.missing).toBe(0);
    expect(d.mean).toBe(3);
    // SD = sqrt(((-2)² + (-1)² + 0 + 1² + 2²) / 4) = sqrt(2.5)
    expect(d.sd).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(d.median).toBe(3);
    // half-width = t(0.975, 4) · sqrt(2.5) / sqrt(5) = 2.776445 · 0.707107 = 1.963243
    expect(d.ciLow).toBeCloseTo(3 - 1.963243, 5);
    expect(d.ciHigh).toBeCloseTo(3 + 1.963243, 5);
  });

  it("even n takes the mean of the two middle values; null and NaN are counted missing, never imputed", () => {
    const d = describe([4, null, 1, Number.NaN, 3, 2, undefined]);
    expect(d.n).toBe(4);
    expect(d.missing).toBe(3);
    expect(d.mean).toBe(2.5);
    expect(d.median).toBe(2.5);
  });

  it("is undefined where it must be: empty, and SD / CI for n = 1", () => {
    expect(describe([])).toEqual({ n: 0, missing: 0, mean: null, sd: null, median: null, ciLow: null, ciHigh: null });
    expect(describe([0.4])).toEqual({ n: 1, missing: 0, mean: 0.4, sd: null, median: 0.4, ciLow: null, ciHigh: null });
  });

  it("Student t quantiles match the standard table", () => {
    expect(tQuantile(0.975, 1)).toBeCloseTo(12.706205, 5);
    expect(tQuantile(0.975, 4)).toBeCloseTo(2.776445, 5);
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228139, 5);
    expect(tQuantile(0.975, 30)).toBeCloseTo(2.042272, 5);
    expect(tQuantile(0.025, 10)).toBeCloseTo(-2.228139, 5);
    expect(tCdf(0, 7)).toBeCloseTo(0.5, 12);
    // I_x(1, 1) = x
    expect(incompleteBeta(0.3, 1, 1)).toBeCloseTo(0.3, 12);
  });
});
