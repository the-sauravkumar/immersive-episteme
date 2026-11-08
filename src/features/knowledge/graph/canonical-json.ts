function sortKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => sortKeys(a, b)));
    }
    return v;
  });
}

const encoder = new TextEncoder();

function compareJsonbKeys(a: string, b: string): number {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return ab.length - bb.length;
  for (let i = 0; i < ab.length; i++) {
    if (ab[i] !== bb[i]) return ab[i]! - bb[i]!;
  }
  return 0;
}

export function postgresJsonbText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("jsonb cannot hold non-finite numbers");
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((v) => postgresJsonbText(v === undefined ? null : v)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => compareJsonbKeys(a, b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${postgresJsonbText(v)}`).join(", ")}}`;
  }
  throw new Error(`Cannot serialise ${typeof value} as jsonb`);
}
