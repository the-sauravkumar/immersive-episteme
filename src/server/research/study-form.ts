/**
 * Pure pieces of the research console's study form (Server Actions in
 * src/app/(research)/research/actions.ts), kept here so unit tests can run them.
 */
import type { StudyConfig } from "@/features/study/contracts";
import { DEFAULT_PRE_TEST_CUTOFF } from "@/server/study/config";

export const CONSOLE_ALLOCATION_ALGORITHMS = ["stratified_block", "block", "simple"] as const;

export function allocationFromForm(current: StudyConfig["allocation"], algorithm: string, blockSize: number | undefined): Record<string, unknown> {
  const { stratifyBy, ...rest } = current;
  const chosen = (CONSOLE_ALLOCATION_ALGORITHMS as readonly string[]).includes(algorithm) ? algorithm : current.algorithm;
  const stratified = chosen === "stratified_block" && current.point === "after_pre_test";
  return {
    ...rest,
    algorithm: chosen,
    blockSize,
    ...(stratified ? { stratifyBy: stratifyBy ?? { source: "pre_test_score", cutoff: DEFAULT_PRE_TEST_CUTOFF } } : {}),
  };
}

/**
 * D6 guidance from the form, on top of the stored guidance: fields the form does not carry are
 * kept, never reset (final review study-05: saving any field used to drop `hintText`, so the
 * engine then refused every enrolment, and silently reset a pilot-tuned `stallSeconds` to 120).
 * An emptied hint-text box removes the hint; an empty stall box keeps the stored value.
 */
export function guidanceFromForm(current: Partial<StudyConfig["guidance"]> | undefined, d: FormData): Record<string, unknown> {
  const text = (k: string) => {
    const v = d.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const stall = text("stallSeconds");
  return {
    ...current,
    policy: text("guidancePolicy") || "none",
    cueEnabled: d.get("cueEnabled") === "on",
    ...(d.has("hintText") ? { hintText: text("hintText") || undefined } : {}),
    ...(d.has("stallSeconds") && stall ? { stallSeconds: Number(stall) } : {}),
  };
}
