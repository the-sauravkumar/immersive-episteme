/**
 * Seeded PRNG used ONLY for tie-breaking. Every decision area derives its own stream from
 * (seed, purpose), so a tie broken differently in one room cannot cascade into another.
 *
 * Adapted from virtual-walkthrough src/museum/materials/noise.ts (mulberry32).
 */
import { sha256Hex } from "./canonical";

export type Rng = () => number;

/** Seeded PRNG (mulberry32): floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent stream for one decision area. */
export function rngFor(seed: string, purpose: string): Rng {
  return mulberry32(parseInt(sha256Hex(`${seed}|${purpose}`).slice(0, 8), 16));
}

/**
 * Pick one of several equally good candidates. The candidates are first put in a canonical
 * order (by `key`) so the result depends only on the seed, never on input order.
 */
export function breakTie<T>(candidates: readonly T[], key: (t: T) => string, rng: Rng): T {
  if (candidates.length === 0) throw new Error("breakTie: no candidates");
  if (candidates.length === 1) return candidates[0]!;
  const sorted = [...candidates].sort((a, b) => compareStrings(key(a), key(b)));
  return sorted[Math.floor(rng() * sorted.length)]!;
}

/** Locale-independent string comparison (never use localeCompare in the compiler). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
