/**
 * The ONE format of a stored answer (`responses.raw`) and of an item answer key
 * (`assessment_items.answer_key`), shared by the study engine that writes answers
 * (src/server/study) and the assessment services that author keys and score them
 * (src/server/assessment). Pure and client-safe.
 *
 *   responses.raw         { value, itemKind, assessmentVersion }
 *     single_choice       value = "<optionId>"
 *     multiple_choice     value = ["<optionId>", ...]   (sorted, de-duplicated)
 *     short/long text     value = "<text exactly as typed>"
 *     likert, numeric     value = <number>
 *   answer key            { optionId } | { optionIds } | { value, tolerance }
 *
 * Free text and ratings have no answer key: text goes to rubric scoring, ratings to instrument
 * scoring. `keyMatch` is the single scoring rule for keyed items (metric `item.key_match`).
 */
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
]);
export type AnswerKey = z.infer<typeof answerKeySchema>;

export const KEY_MATCH_METRIC = { name: "item.key_match", version: "1.0.0", pipeline: "item-key@1.0.0" } as const;

/**
 * Reads the participant's answer from `responses.raw`: the shared shape above, plus the older
 * shapes (a bare string, number or string array; `optionId`, `optionIds`, `values`). Anything
 * else is reported, not guessed.
 */
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

/** 1 = matches the key, 0 = does not, null = not scorable (with the reason). */
export function keyMatch(answerKey: unknown, raw: unknown): { value: number | null; reason?: string } {
  const parsed = answerKeySchema.safeParse(answerKey);
  if (!parsed.success) return { value: null, reason: "no_answer_key" };
  const key = parsed.data;
  const a = extractAnswer(raw);
  if ("optionId" in key) {
    if (!a.optionIds) return { value: null, reason: "unrecognised_answer" };
    return { value: a.optionIds.length === 1 && a.optionIds[0] === key.optionId ? 1 : 0 };
  }
  if ("optionIds" in key) {
    if (!a.optionIds) return { value: null, reason: "unrecognised_answer" };
    const want = [...new Set(key.optionIds)].sort().join("|");
    return { value: [...new Set(a.optionIds)].sort().join("|") === want ? 1 : 0 };
  }
  if (a.value === null) return { value: null, reason: "unrecognised_answer" };
  return { value: Math.abs(a.value - key.value) <= key.tolerance ? 1 : 0 };
}
