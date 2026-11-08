export type ConditionKind = "2d" | "3d" | "other";

export function conditionKind(iface: string | null | undefined): ConditionKind {
  if (!iface) return "other";
  if (/3d/i.test(iface)) return "3d";
  if (/2d/i.test(iface)) return "2d";
  return "other";
}

const KIND_ORDER: Record<ConditionKind, number> = { "2d": 0, "3d": 1, other: 2 };

export function orderByCondition<T extends { kind: ConditionKind }>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.i - b.i)
    .map((x) => x.item);
}

export function fixed(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const s = v.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

export interface NiceScale {
  min: number;
  max: number;
  interval: number;
  decimals: number;
}

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
