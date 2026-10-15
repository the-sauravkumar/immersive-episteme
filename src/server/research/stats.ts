/** Small descriptive helpers for the console (the inferential work lives in analysis/). */

/** Tukey five numbers [min, q1, median, q3, max] with linear interpolation (type 7); null when empty. */
export function fiveNumbers(values: readonly number[]): [number, number, number, number, number] | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => {
    const h = (s.length - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return s[lo]! + (h - lo) * (s[hi]! - s[lo]!);
  };
  return [s[0]!, q(0.25), q(0.5), q(0.75), s[s.length - 1]!];
}

export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
