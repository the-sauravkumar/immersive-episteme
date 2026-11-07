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
import { TASK_TEXT } from "@/features/learning/strings";
import { STUDY_STEPS, studyConfigSchema, type InstrumentRef, type StudyConfig, type StudyStep } from "@/features/study/contracts";
import type { LearningCondition } from "@/lib/permissions/learning";
import { titleCase } from "@/lib/text/title-case";

export { STUDY_STEPS, type StudyStep };

export const STEP_ASSESSMENTS: Partial<Record<StudyStep, { phase: "pre" | "post" | "follow_up"; kind: string }>> = {
  pre_test: { phase: "pre", kind: "pretest" },
  post_test: { phase: "post", kind: "posttest" },
  reconstruction: { phase: "post", kind: "reconstruction" },
  transfer: { phase: "post", kind: "transfer" },
  layout_sketch: { phase: "post", kind: "sketch" },
  delayed_test: { phase: "follow_up", kind: "posttest" },
};

export const BLIND_STEPS: readonly StudyStep[] = ["questionnaire_pre", "pre_test"];

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

export const DEFAULT_STEPS: readonly StudyStep[] = [
  "questionnaire_pre",
  "pre_test",
  "entrance",
  "familiarisation",
  "onboarding",
  "learning",
  "questionnaire_post_learning",
  "post_test",
  "transfer",
  "reconstruction",
  "layout_sketch",
  "questionnaire_end",
  "delayed_test",
];

export const DEFAULT_QUESTIONNAIRES = {
  pre: ["background"],
  postLearning: ["common-questions", { code: "mps-physical-presence", conditions: ["immersive"] }, { code: "ssq", conditions: ["immersive"] }],
  end: ["sus"],
} satisfies { pre: InstrumentRef[]; postLearning: InstrumentRef[]; end: InstrumentRef[] };

export const LEARNING_CAP_MINUTES = 30;
export const CAP_WARNING_MINUTES = 5;
export const DEFAULT_PRE_TEST_CUTOFF = 2;

export const NEW_STUDY_CONFIG = {
  exposure: { mode: "self_paced", minutes: LEARNING_CAP_MINUTES, allowEarlyFinish: true, requireEveryStage: true },
  allocation: { algorithm: "stratified_block", blockSize: 4, point: "after_pre_test", strata: [], stratifyBy: { source: "pre_test_score", cutoff: DEFAULT_PRE_TEST_CUTOFF } },
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
  for (const s of ["questionnaire_pre", "pre_test", "entrance", "familiarisation", "onboarding"] as const) {
    if (has(s) && learning >= 0 && at(s) > learning) issues.push(`steps: ${s} must come before learning`);
  }
  for (const s of ["questionnaire_post_learning", "post_test", "transfer", "reconstruction", "layout_sketch", "questionnaire_end", "delayed_test"] as const) {
    if (has(s) && learning >= 0 && at(s) < learning) issues.push(`steps: ${s} must come after learning`);
  }
  // Starting the task from the onboarding page starts the learning clock: nothing in between.
  if (has("onboarding") && learning >= 0 && at("onboarding") !== learning - 1) issues.push("steps: onboarding must come immediately before learning");
  // D8: the load, sickness and presence ratings come straight after learning (context effects).
  if (has("questionnaire_post_learning") && learning >= 0 && at("questionnaire_post_learning") !== learning + 1) {
    issues.push("steps: nothing may come between learning and questionnaire_post_learning");
  }
  if (has("delayed_test") && at("delayed_test") !== steps.length - 1) issues.push("steps: delayed_test must be the last step");
  const lastImmediate = has("delayed_test") ? steps.length - 2 : steps.length - 1;
  if (has("questionnaire_end") && at("questionnaire_end") !== lastImmediate) issues.push("steps: questionnaire_end must be the last step before any delayed test");
  if (has("post_test") && has("questionnaire_post_learning") && at("post_test") < at("questionnaire_post_learning")) issues.push("steps: the common questions come before the immediate test");
  if (has("entrance") && has("familiarisation") && at("entrance") > at("familiarisation")) issues.push("steps: entrance must come before familiarisation");

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
    if (!has("pre_test")) issues.push("allocation.stratifyBy pre_test_score needs the pre_test step");
  } else if (config.allocation.algorithm === "stratified_block" && point === "after_pre_test") {
    issues.push("allocation.algorithm stratified_block after the pre-test needs allocation.stratifyBy");
  }

  if (config.guidance.cueEnabled && !config.guidance.hintText) {
    issues.push("guidance: cueEnabled needs guidance.hintText (the hint both conditions show)");
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
  entrance: "/study/entrance",
  onboarding: "/study/task",
  questionnaire_post_learning: "/study/questionnaire/after-learning",
  post_test: "/study/post-test",
  transfer: "/study/transfer",
  reconstruction: "/study/reconstruction",
  layout_sketch: "/study/layout-sketch",
  questionnaire_end: "/study/questionnaire",
  delayed_test: "/study/delayed-test",
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
      ["entrance", "Entrance"],
      ["familiarisation", "Practice with the controls"],
      ["onboarding", "Introduction to the learning task"],
      // The learning route shows this name too: one string for both (the shared table, P20).
      ["learning", TASK_TEXT.label],
      ["questionnaire_post_learning", "Questions about the learning task"],
      ["post_test", "Questions after learning"],
      ["transfer", "Transfer task"],
      ["reconstruction", "Connect the concepts"],
      ["layout_sketch", "Layout sketch"],
      ["questionnaire_end", "Final questionnaire"],
      ["delayed_test", "Delayed test"],
    ] as const
  ).map(([k, v]) => [k, titleCase(v)]),
) as Record<StudyStep, string>;
