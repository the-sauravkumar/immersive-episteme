import type { InstrumentRef, StudyConfig } from "@/features/study/contracts";
import { LEARNING_CONDITIONS, type LearningCondition } from "@/lib/permissions/learning";
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

export function guidanceFromForm(current: Partial<StudyConfig["guidance"]> | undefined, d: FormData): Record<string, unknown> {
  const text = (k: string) => {
    const v = d.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const stall = text("stallSeconds");
  return {
    ...current,
    cueEnabled: d.get("cueEnabled") === "on",
    ...(d.has("hintText") ? { hintText: text("hintText") || undefined } : {}),
    ...(d.has("stallSeconds") && stall ? { stallSeconds: Number(stall) } : {}),
  };
}

const field = (d: FormData, k: string) => {
  const v = d.get(k);
  return typeof v === "string" ? v.trim() : "";
};

const longText = (d: FormData, k: string) => field(d, k).replace(/\r\n?/g, "\n");

export function exposureFromForm(current: Partial<StudyConfig["exposure"]> | undefined, d: FormData): StudyConfig["exposure"] {
  const minutes = field(d, "exposureMinutes");
  return { ...current, mode: "self_paced", minutes: minutes ? Number(minutes) : undefined, allowEarlyFinish: true, requireEveryStage: true };
}

export type ConsentFromForm = { ok: true; consent: StudyConfig["consent"]; participantInformation: string | undefined } | { ok: false; error: string };

export function consentFromForm(d: FormData): ConsentFromForm {
  const version = field(d, "consentVersion");
  const text = longText(d, "consentText");
  const participantInformation = longText(d, "participantInformation") || undefined;
  if (version && !text) return { ok: false, error: "Write the consent text for this consent version, or clear the version." };
  if (text && !version) return { ok: false, error: "Give the consent text a version, for example 1.0." };
  return { ok: true, consent: version ? { version, text } : undefined, participantInformation };
}

export const QUESTIONNAIRE_SLOTS = ["pre", "postLearning", "end"] as const;
export type QuestionnaireSlot = (typeof QUESTIONNAIRE_SLOTS)[number];

export function questionnairesFromForm(d: FormData): NonNullable<StudyConfig["questionnaires"]> | null {
  if (!d.has("questionnaireCodes")) return null;
  const codes = field(d, "questionnaireCodes")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const rows = codes.flatMap((code) => {
    const slot = QUESTIONNAIRE_SLOTS.find((s) => s === field(d, `questionnaireStep:${code}`));
    if (!slot) return [];
    const audience = LEARNING_CONDITIONS.find((c) => c === field(d, `questionnaireFor:${code}`));
    const version = Number(field(d, `questionnaireVersion:${code}`)) || undefined;
    const order = Number(field(d, `questionnaireOrder:${code}`) || "0");
    const ref: InstrumentRef = audience || version ? { code, ...(version ? { version } : {}), ...(audience ? { conditions: [audience] } : {}) } : code;
    return [{ slot, order: Number.isFinite(order) ? order : 0, code, ref }];
  });
  rows.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  const of = (slot: QuestionnaireSlot) => rows.filter((r) => r.slot === slot).map((r) => r.ref);
  return { pre: of("pre"), postLearning: of("postLearning"), end: of("end") };
}

export interface QuestionnaireInstrument {
  code: string;
  title: string;
  versions: number[];
  slot: QuestionnaireSlot | null;
  audience: LearningCondition | null;
  version: number | null;
  order: number;
}

export function questionnaireInstruments(
  assessments: readonly { code: string; version: number; kind: string; title: string }[],
  questionnaires: Partial<Record<QuestionnaireSlot, readonly InstrumentRef[]>>,
): QuestionnaireInstrument[] {
  const chosen = new Map<string, Pick<QuestionnaireInstrument, "slot" | "audience" | "version" | "order">>();
  for (const slot of QUESTIONNAIRE_SLOTS) {
    (questionnaires[slot] ?? []).forEach((ref, index) => {
      const r = typeof ref === "string" ? { code: ref } : ref;
      if (chosen.has(r.code)) return;
      chosen.set(r.code, { slot, audience: "conditions" in r && r.conditions?.length === 1 ? r.conditions[0]! : null, version: ("version" in r && r.version) || null, order: index + 1 });
    });
  }
  const byCode = new Map<string, { title: string; versions: number[] }>();
  for (const a of assessments) {
    if (a.kind !== "questionnaire") continue;
    const entry = byCode.get(a.code) ?? { title: a.title, versions: [] };
    entry.versions.push(a.version);
    byCode.set(a.code, entry);
  }
  for (const code of chosen.keys()) if (!byCode.has(code)) byCode.set(code, { title: code, versions: [] });
  return [...byCode.entries()]
    .map(([code, entry]) => ({ code, title: entry.title, versions: [...entry.versions].sort((x, y) => y - x), ...(chosen.get(code) ?? { slot: null, audience: null, version: null, order: 0 }) }))
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.order - b.order || a.code.localeCompare(b.code));
}

function slotRank(slot: QuestionnaireSlot | null): number {
  return slot ? QUESTIONNAIRE_SLOTS.indexOf(slot) : QUESTIONNAIRE_SLOTS.length;
}
