/**
 * Condition encoding shared by the research charts and the server-rendered tables (DESIGN.md 10).
 * A plain module (no "use client"), so server components can call it too.
 *
 *  - 2D = --series-2d, circle marker, solid line; 3D = --series-3d, square marker, 4-2 dashes.
 *  - 2D is always first or left.
 */
export type ConditionKind = "2d" | "3d" | "other";

/** 2D or 3D from a condition's interface code (`conventional_2d`, `immersive_3d`). */
export function conditionKind(iface: string | null | undefined): ConditionKind {
  if (!iface) return "other";
  if (/3d/i.test(iface)) return "3d";
  if (/2d/i.test(iface)) return "2d";
  return "other";
}

const KIND_ORDER: Record<ConditionKind, number> = { "2d": 0, "3d": 1, other: 2 };

/** 2D always first or left; otherwise the given order is kept (stable). */
export function orderByCondition<T extends { kind: ConditionKind }>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.i - b.i)
    .map((x) => x.item);
}

/**
 * A number with fixed decimals, or an en dash when undefined (no more precision than the measure
 * supports). Never prints a negative zero ("-0.0" becomes "0.0").
 */
export function fixed(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const s = v.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** A tidy axis: bounds on a 1-2-5 step, and the decimals that step needs. */
export interface NiceScale {
  min: number;
  max: number;
  interval: number;
  /** Decimals that print every tick distinctly (derived from the interval, not the data). */
  decimals: number;
}

/**
 * Axis bounds and tick step for the given values (about `target` intervals). With `zero` the
 * axis is pinned at 0 (durations, counts): values below zero, such as the low end of a t
 * interval, are drawn clipped at the axis and the caption says so.
 */
export function niceScale(values: readonly (number | null | undefined)[], zero = false, target = 5): NiceScale | null {
  const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (finite.length === 0) return null;
  let lo = zero ? 0 : Math.min(...finite);
  let hi = zero ? Math.max(0, ...finite) : Math.max(...finite);
  if (hi - lo < 1e-12) {
    const d = lo === 0 ? 1 : Math.abs(lo) * 0.5;
    hi += d;
    if (!zero) lo -= d;
  }
  const raw = (hi - lo) / target;
  const k = Math.floor(Math.log10(raw));
  const f = raw / 10 ** k;
  const sig = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  const interval = sig * 10 ** k;
  const exp = sig === 10 ? k + 1 : k;
  const decimals = Math.max(0, -exp);
  const round = (x: number) => Number(x.toFixed(decimals + 2));
  const min = zero ? 0 : round(Math.floor(lo / interval + 1e-9) * interval);
  const max = round(Math.ceil(hi / interval - 1e-9) * interval);
  return { min, max: max > min ? max : round(min + interval), interval: round(interval), decimals };
}
