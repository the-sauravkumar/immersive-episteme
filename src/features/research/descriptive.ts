/**
 * Descriptive statistics for the research dashboard (pure, client-safe). Descriptive only: the
 * inferential analysis (ANCOVA, effect sizes) lives in analysis/episteme_stats.
 *
 *  - n, mean, sample SD (n − 1 denominator), median (type 7, as fiveNumbers in
 *    src/server/research/stats.ts);
 *  - 95% confidence interval of the mean: mean ± t(0.975, n − 1) · SD / √n, with the Student t
 *    quantile computed from the regularised incomplete beta function (no table). Undefined
 *    (null) for n < 2.
 * Missing values (null, NaN) are dropped and counted, never imputed.
 */

export interface Descriptives {
  n: number;
  /** Values that were null or not finite (dropped, not imputed). */
  missing: number;
  mean: number | null;
  sd: number | null;
  median: number | null;
  ciLow: number | null;
  ciHigh: number | null;
}

export function describe(values: readonly (number | null | undefined)[]): Descriptives {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const missing = values.length - xs.length;
  const n = xs.length;
  if (n === 0) return { n, missing, mean: null, sd: null, median: null, ciLow: null, ciHigh: null };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sorted = [...xs].sort((a, b) => a - b);
  const h = (n - 1) * 0.5;
  const median = sorted[Math.floor(h)]! + (h - Math.floor(h)) * (sorted[Math.ceil(h)]! - sorted[Math.floor(h)]!);
  if (n < 2) return { n, missing, mean, sd: null, median, ciLow: null, ciHigh: null };
  const sd = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  const half = tQuantile(0.975, n - 1) * (sd / Math.sqrt(n));
  return { n, missing, mean, sd, median, ciLow: mean - half, ciHigh: mean + half };
}

/** ln Γ(x), Lanczos approximation (g = 7, n = 9). */
function lnGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0]!;
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction of the incomplete beta function (modified Lentz). */
function betaCf(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaCf(a, b, x)) / a : 1 - (front * betaCf(b, a, 1 - x)) / b;
}

/** Student t cumulative distribution function. */
export function tCdf(t: number, df: number): number {
  const p = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - p : p;
}

/** Student t quantile (p in (0, 1)) by bisection on tCdf; accurate to ~1e-10. */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) throw new RangeError("tQuantile needs 0 < p < 1 and df > 0");
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  let lo = 0;
  let hi = 1;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
