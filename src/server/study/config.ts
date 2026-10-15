/**
 * Study-engine view of `studies.config` (protocol as data). Pure and client-safe.
 *
 * The fields live in the shared contract (`studyConfigSchema`, src/features/study/contracts.ts),
 * so the research console preserves them when it saves a study. This module adds what a schema
 * of independent fields cannot express: the rules on the ORDER of the journey, the allocation
 * point and stratification, the questionnaire steps and familiarisation, and the defaults of
 * the adopted study decisions (docs/research/study-decisions.md D3, D5, D7, D8).
 *
 * Wording (information sheet, consent, onboarding) always comes from the study config or the
 * condition config, written by the researchers. The engine never supplies it.
 */
import { STUDY_STEPS, studyConfigSchema, type InstrumentRef, type StudyConfig, type StudyStep } from "@/features/study/contracts";
import type { LearningCondition } from "@/lib/permissions/learning";
import { titleCase } from "@/lib/text/title-case";

export { STUDY_STEPS, type StudyStep };

/** Steps taken before allocation when `allocation.point = after_pre_test`: blind to condition. */
export const BLIND_STEPS: readonly StudyStep[] = ["questionnaire_pre", "pre_test", "pre_reconstruction"];

export const QUESTIONNAIRE_STEPS = ["questionnaire_pre", "questionnaire_post_learning", "questionnaire_end"] as const;
export type QuestionnaireStep = (typeof QUESTIONNAIRE_STEPS)[number];
export const QUESTIONNAIRE_CONFIG_KEY: Record<QuestionnaireStep, "pre" | "postLearning" | "end"> = {
  questionnaire_pre: "pre",
  questionnaire_post_learning: "postLearning",
  questionnaire_end: "end",
};
export function isQuestionnaireStep(step: StudyStep): step is QuestionnaireStep {
  return (QUESTIONNAIRE_STEPS as readonly string[]).includes(step);
}

/**
 * The content-free practice pages /learn/2d/practice and /learn/immersive/practice (D5) exist,
 * so a protocol may use the familiarisation step.
 */
export const PRACTICE_ROUTES_AVAILABLE = true;

/**
 * Default order, study decision D8: consent → SSQ (pre) → prior-knowledge test and pre-test
 * concept map → allocation (D3) → device check → familiarisation → learning → immediately the
 * load, sickness and presence ratings → post-test → transfer → concept-map reconstruction → SUS.
 * Familiarisation needs `familiarisation.minutes` (5–10, D5) in the config.
 */
export const D8_STEPS: readonly StudyStep[] = [
  "questionnaire_pre",
  "pre_test",
  "pre_reconstruction",
  "familiarisation",
  "onboarding",
  "learning",
  "questionnaire_post_learning",
  "post_test",
  "transfer",
  "reconstruction",
  "questionnaire_end",
];
export const DEFAULT_STEPS: readonly StudyStep[] = D8_STEPS;

/** D5: minutes of content-free practice for a new study (the lower end of the adopted 5–10; a pilot parameter). */
export const DEFAULT_FAMILIARISATION_MINUTES = 5;

/** D7 instruments per questionnaire step (codes of src/server/study/instruments.ts). */
export const DEFAULT_QUESTIONNAIRES = {
  pre: ["ssq"],
  postLearning: ["cognitive-load", "ssq", { code: "mps-physical-presence", conditions: ["immersive"] }],
  end: ["sus"],
} satisfies { pre: InstrumentRef[]; postLearning: InstrumentRef[]; end: InstrumentRef[] };

/**
 * Config for a NEW study (engine and research console): D5 exposure (30 min, fixed, no early
 * finish) and familiarisation (DEFAULT_FAMILIARISATION_MINUTES), D3 allocation (after the pre-test, permuted blocks of 4; the stratum cutoff is the
 * pilot median, unknown until the pilot, so `stratifyBy` is left for the researchers), the D8
 * order and the D7 questionnaires. Existing studies keep their own configs.
 */
export const NEW_STUDY_CONFIG = {
  exposure: { mode: "fixed_time", minutes: 30, allowEarlyFinish: false },
  allocation: { algorithm: "block", blockSize: 4, point: "after_pre_test", strata: [] },
  familiarisation: { minutes: DEFAULT_FAMILIARISATION_MINUTES },
  steps: [...DEFAULT_STEPS],
  questionnaires: DEFAULT_QUESTIONNAIRES,
} as const;

export interface StudyProtocol {
  config: StudyConfig;
  steps: readonly StudyStep[];
  questionnaires: { pre: InstrumentRef[]; postLearning: InstrumentRef[]; end: InstrumentRef[] };
}

export class StudyConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid study configuration: ${issues.join("; ")}`);
    this.name = "StudyConfigError";
  }
}

/** Rules on the order of the journey and on the fields that depend on it. Pure. */
export function protocolIssues(config: StudyConfig, steps: readonly StudyStep[]): string[] {
  const issues: string[] = [];
  const at = (s: StudyStep) => steps.indexOf(s);
  const has = (s: StudyStep) => at(s) >= 0;
  if (new Set(steps).size !== steps.length) issues.push("steps: a step may appear only once");
  const learning = at("learning");
  if (learning < 0) issues.push("steps: the journey must include the learning step");
  for (const s of ["questionnaire_pre", "pre_test", "pre_reconstruction", "familiarisation", "onboarding"] as const) {
    if (has(s) && learning >= 0 && at(s) > learning) issues.push(`steps: ${s} must come before learning`);
  }
  for (const s of ["questionnaire_post_learning", "post_test", "transfer", "reconstruction", "questionnaire_end"] as const) {
    if (has(s) && learning >= 0 && at(s) < learning) issues.push(`steps: ${s} must come after learning`);
  }
  // Starting the task from the onboarding page starts the learning clock: nothing in between.
  if (has("onboarding") && learning >= 0 && at("onboarding") !== learning - 1) issues.push("steps: onboarding must come immediately before learning");
  // D8: the load, sickness and presence ratings come straight after learning (context effects).
  if (has("questionnaire_post_learning") && learning >= 0 && at("questionnaire_post_learning") !== learning + 1) {
    issues.push("steps: nothing may come between learning and questionnaire_post_learning");
  }
  if (has("questionnaire_end") && at("questionnaire_end") !== steps.length - 1) issues.push("steps: questionnaire_end must be the last step");

  const point = config.allocation.point;
  if (point === "after_pre_test") {
    // Everything before allocation must be condition-blind, and come first.
    const firstNonBlind = steps.findIndex((s) => !BLIND_STEPS.includes(s));
    for (const s of BLIND_STEPS) {
      if (has(s) && firstNonBlind >= 0 && at(s) > firstNonBlind) issues.push(`steps: ${s} must come before every condition-specific step (allocation follows it)`);
    }
    if (config.allocation.strata.length > 0) issues.push("allocation.strata: researcher-entered strata are only used when allocation.point = enrolment");
  }
  const by = config.allocation.stratifyBy;
  if (by) {
    if (point !== "after_pre_test") issues.push("allocation.stratifyBy needs allocation.point = after_pre_test");
    if (config.allocation.algorithm !== "stratified_block") issues.push("allocation.stratifyBy needs allocation.algorithm = stratified_block");
    if (by.source === "pre_test_score" && !has("pre_test")) issues.push("allocation.stratifyBy pre_test_score needs the pre_test step");
    if (by.source === "pre_map_recall" && !has("pre_reconstruction")) issues.push("allocation.stratifyBy pre_map_recall needs the pre_reconstruction step");
  } else if (config.allocation.algorithm === "stratified_block" && point === "after_pre_test") {
    issues.push("allocation.algorithm stratified_block after the pre-test needs allocation.stratifyBy");
  }

  if (has("familiarisation")) {
    if (!PRACTICE_ROUTES_AVAILABLE) issues.push("steps: familiarisation is not available yet (the /learn/<condition>/practice pages do not exist)");
    if (!config.familiarisation) issues.push("familiarisation: set familiarisation.minutes (5–10) to use the familiarisation step");
  }
  // D6: the hybrid guidance's always-available hint shows researcher-written text, the same in both conditions.
  if (config.guidance.policy === "hybrid" && config.guidance.cueEnabled && !config.guidance.hintText) {
    issues.push("guidance: a hybrid policy with cueEnabled needs guidance.hintText (the hint both conditions show)");
  }
  return issues;
}

/** Parses and validates the raw `studies.config`. Throws StudyConfigError (the protocol is broken, not the participant). */
export function parseStudyProtocol(raw: unknown): StudyProtocol {
  const parsed = studyConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new StudyConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const config = parsed.data;
  const steps = config.steps ?? DEFAULT_STEPS;
  const issues = protocolIssues(config, steps);
  if (issues.length > 0) throw new StudyConfigError(issues);
  return { config, steps, questionnaires: config.questionnaires ?? DEFAULT_QUESTIONNAIRES };
}

/** The instrument refs of a questionnaire step that apply to a condition (null = before allocation: all unrestricted ones). */
export function instrumentsFor(protocol: StudyProtocol, step: QuestionnaireStep, condition: LearningCondition | null): { code: string; version?: number }[] {
  return protocol.questionnaires[QUESTIONNAIRE_CONFIG_KEY[step]]
    .map((r) => (typeof r === "string" ? { code: r } : r))
    .filter((r) => !("conditions" in r) || !r.conditions || (condition !== null && r.conditions.includes(condition)))
    .map((r) => ({ code: r.code, ...("version" in r && r.version ? { version: r.version } : {}) }));
}

/** Route of the page that delivers each step (learning goes to the assigned condition). */
export const STEP_ROUTE: Record<Exclude<StudyStep, "learning" | "familiarisation">, string> = {
  questionnaire_pre: "/study/questionnaire/before",
  pre_test: "/study/pre-test",
  pre_reconstruction: "/study/reconstruction",
  onboarding: "/study/task",
  questionnaire_post_learning: "/study/questionnaire/after-learning",
  post_test: "/study/post-test",
  transfer: "/study/transfer",
  reconstruction: "/study/reconstruction",
  questionnaire_end: "/study/questionnaire",
};

/** Practice route of the familiarisation step (D5). */
export function practiceRoute(condition: LearningCondition): string {
  return condition === "2d" ? "/learn/2d/practice" : "/learn/immersive/practice";
}

/** Step names shown to the participant as titles (Title Case). */
export const STEP_LABEL: Record<StudyStep, string> = Object.fromEntries(
  (
    [
      ["questionnaire_pre", "Questions before you start"],
      ["pre_test", "Questions before learning"],
      ["pre_reconstruction", "Connect the concepts (before learning)"],
      ["familiarisation", "Practice with the controls"],
      ["onboarding", "Introduction to the learning task"],
      ["learning", "Learning task"],
      ["questionnaire_post_learning", "Questions about the learning task"],
      ["post_test", "Questions after learning"],
      ["transfer", "Transfer task"],
      ["reconstruction", "Connect the concepts"],
      ["questionnaire_end", "Final questionnaire"],
    ] as const
  ).map(([k, v]) => [k, titleCase(v)]),
) as Record<StudyStep, string>;
