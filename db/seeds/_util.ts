/** Small helpers shared by seeds (and integration tests). */
import { createHash } from "node:crypto";

/** JSON with object keys sorted recursively, so equal values serialise identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function itemSha256(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
