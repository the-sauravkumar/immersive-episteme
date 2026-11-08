import { z } from "zod";

export const responseRawSchema = z.object({
  value: z.union([z.string(), z.array(z.string()), z.number().finite()]),
  itemKind: z.string().min(1),
  assessmentVersion: z.number().int().positive(),
});
export type ResponseRaw = z.infer<typeof responseRawSchema>;

export const answerKeySchema = z.union([
  z.object({ optionId: z.string().min(1).max(64) }),
  z.object({ optionIds: z.array(z.string().min(1).max(64)).min(1) }),
  z.object({ value: z.number().finite(), tolerance: z.number().nonnegative().default(0) }),
  z.object({ order: z.array(z.string().min(1).max(64)).min(2) }),
  z.object({ matches: z.record(z.string().min(1).max(64), z.string().min(1).max(64)) }),
]);
export type AnswerKey = z.infer<typeof answerKeySchema>;

export const KEY_MATCH_METRIC = { name: "item.key_match", version: "1.0.0", pipeline: "item-key@1.0.0" } as const;

export function extractAnswer(raw: unknown): { optionIds: string[] | null; value: number | null } {
  if (typeof raw === "string") return { optionIds: [raw], value: Number.isFinite(Number(raw)) ? Number(raw) : null };
  if (typeof raw === "number") return { optionIds: null, value: raw };
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) return { optionIds: raw as string[], value: null };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.optionId === "string") return { optionIds: [o.optionId], value: null };
    for (const k of ["optionIds", "values", "value"]) {
      const v = o[k];
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) return { optionIds: v as string[], value: null };
    }
    if (typeof o.value === "number") return { optionIds: null, value: o.value };
    if (typeof o.value === "string") return { optionIds: [o.value], value: Number.isFinite(Number(o.value)) ? Number(o.value) : null };
  }
  return { optionIds: null, value: null };
}

export function orderScore(expected: readonly string[], given: readonly string[]): number {
  const rank = new Map(given.map((id, index) => [id, index]));
  let agreeing = 0;
  let pairs = 0;
  for (let a = 0; a < expected.length; a++) {
    for (let b = a + 1; b < expected.length; b++) {
      pairs++;
      const first = rank.get(expected[a]!);
      const second = rank.get(expected[b]!);
      if (first !== undefined && second !== undefined && first < second) agreeing++;
    }
  }
  return pairs === 0 ? 0 : agreeing / pairs;
}

export const matchValue = (pairId: string, optionId: string): string => `${pairId}=${optionId}`;

export function matchScore(matches: Readonly<Record<string, string>>, given: readonly string[]): number {
  const keys = Object.keys(matches);
  if (keys.length === 0) return 0;
  const chosen = new Set(given);
  return keys.filter((pairId) => chosen.has(matchValue(pairId, matches[pairId]!))).length / keys.length;
}

export function keyMatch(answerKey: unknown, raw: unknown): { value: number | null; reason?: string } {
  const parsed = answerKeySchema.safeParse(answerKey);
  if (!parsed.success) return { value: null, reason: "no_answer_key" };
  const key = parsed.data;
  const a = extractAnswer(raw);
  if ("optionId" in key) {
    if (!a.optionIds) return { value: null, reason: "unrecognised_answer" };
    return { value: a.optionIds.length === 1 && a.optionIds[0] === key.optionId ? 1 : 0 };
  }
  if ("order" in key) {
    if (!a.optionIds) return { value: null, reason: "unrecognised_answer" };
    return { value: orderScore(key.order, a.optionIds) };
  }
  if ("matches" in key) {
    if (!a.optionIds) return { value: null, reason: "unrecognised_answer" };
    return { value: matchScore(key.matches, a.optionIds) };
  }
  if ("optionIds" in key) {
    if (!a.optionIds) return { value: null, reason: "unrecognised_answer" };
    const want = [...new Set(key.optionIds)].sort().join("|");
    return { value: [...new Set(a.optionIds)].sort().join("|") === want ? 1 : 0 };
  }
  if (a.value === null) return { value: null, reason: "unrecognised_answer" };
  return { value: Math.abs(a.value - key.value) <= key.tolerance ? 1 : 0 };
}
