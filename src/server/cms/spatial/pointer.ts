/**
 * JSON-pointer helpers for manual overrides of compiled manifest elements (RFC 6901 syntax,
 * as stored in manual_overrides.field, e.g. "/position/x").
 *
 * Overrides may adjust presentation (position, size, label ...), never the traceability chain:
 * an element's identity, kind, parent, concept, rule, encodings, trace and rationale are what
 * make the knowledge-to-space transformation inspectable, so they are not editable.
 *
 * Pure; safe for client and server.
 */

/** First pointer segments an override may never touch (nor anything under them). */
export const PROTECTED_ELEMENT_FIELDS = ["id", "kind", "parentId", "conceptId", "ruleId", "encodes", "trace", "rationale"] as const;

export type PointerCheck = { ok: true; segments: string[]; before: unknown } | { ok: false; reason: string };

export function parsePointer(pointer: string): string[] | null {
  if (!/^(\/[^/]+)+$/.test(pointer)) return null;
  return pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function jsonType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * May `value` be written at `pointer` in `element`? The path must already exist (overrides
 * adjust compiled values; they do not invent new structure) and the new value must have the
 * same JSON type as the compiled one.
 */
export function checkOverride(element: Record<string, unknown>, pointer: string, value: unknown): PointerCheck {
  const segments = parsePointer(pointer);
  if (!segments) return { ok: false, reason: "Use a JSON pointer such as /position/x" };
  if (segments.some((s) => FORBIDDEN_KEYS.has(s))) return { ok: false, reason: "Pointer segment not allowed" };
  if ((PROTECTED_ELEMENT_FIELDS as readonly string[]).includes(segments[0]!)) {
    return { ok: false, reason: `"${segments[0]}" is part of the traceability chain and cannot be overridden` };
  }
  let cur: unknown = element;
  for (const seg of segments) {
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9]\d*)$/.test(seg) || Number(seg) >= cur.length) return { ok: false, reason: `No array index ${seg} at ${pointer}` };
      cur = cur[Number(seg)];
    } else if (cur !== null && typeof cur === "object" && Object.prototype.hasOwnProperty.call(cur, seg)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return { ok: false, reason: `The element has no ${pointer}` };
    }
  }
  if (jsonType(cur) !== jsonType(value)) {
    return { ok: false, reason: `${pointer} holds a ${jsonType(cur)}; the override value is a ${jsonType(value)}` };
  }
  if (typeof value === "number" && !Number.isFinite(value)) return { ok: false, reason: "Numbers must be finite" };
  return { ok: true, segments, before: cur };
}

/** Returns a deep copy of `element` with `value` written at `segments` (checked first). */
export function applyPointer<T extends Record<string, unknown>>(element: T, segments: readonly string[], value: unknown): T {
  const copy = structuredClone(element);
  let cur: unknown = copy;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    cur = Array.isArray(cur) ? cur[Number(seg)] : (cur as Record<string, unknown>)[seg];
  }
  const last = segments[segments.length - 1]!;
  if (Array.isArray(cur)) cur[Number(last)] = structuredClone(value);
  else (cur as Record<string, unknown>)[last] = structuredClone(value);
  return copy;
}
