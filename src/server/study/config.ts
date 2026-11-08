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

export const DRAWN_ALGORITHMS: readonly string[] = ["simple", "block", "stratified_block"];

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
  exposure: { minutes: LEARNING_CAP_MINUTES },
  allocation: { algorithm: "stratified_block", blockSize: 4, stratifyBy: { source: "pre_test_score", cutoff: DEFAULT_PRE_TEST_CUTOFF } },
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
  if (has("onboarding") && learning >= 0 && at("onboarding") !== learning - 1) issues.push("steps: onboarding must come immediately before learning");
  if (has("questionnaire_post_learning") && learning >= 0 && at("questionnaire_post_learning") !== learning + 1) {
    issues.push("steps: nothing may come between learning and questionnaire_post_learning");
  }
  if (has("delayed_test") && at("delayed_test") !== steps.length - 1) issues.push("steps: delayed_test must be the last step");
  const lastImmediate = has("delayed_test") ? steps.length - 2 : steps.length - 1;
  if (has("questionnaire_end") && at("questionnaire_end") !== lastImmediate) issues.push("steps: questionnaire_end must be the last step before any delayed test");
  if (has("post_test") && has("questionnaire_post_learning") && at("post_test") < at("questionnaire_post_learning")) issues.push("steps: the common questions come before the immediate test");
  if (has("entrance") && has("familiarisation") && at("entrance") > at("familiarisation")) issues.push("steps: entrance must come before familiarisation");

  if (!DRAWN_ALGORITHMS.includes(config.allocation.algorithm)) issues.push(`allocation.algorithm ${config.allocation.algorithm} cannot be drawn by the study engine (use ${DRAWN_ALGORITHMS.join(", ")})`);
  const firstNonBlind = steps.findIndex((s) => !BLIND_STEPS.includes(s));
  for (const s of BLIND_STEPS) {
    if (has(s) && firstNonBlind >= 0 && at(s) > firstNonBlind) issues.push(`steps: ${s} must come before every condition-specific step (allocation follows it)`);
  }
  const by = config.allocation.stratifyBy;
  if (by) {
    if (config.allocation.algorithm !== "stratified_block") issues.push("allocation.stratifyBy needs allocation.algorithm = stratified_block");
    if (!has("pre_test")) issues.push("allocation.stratifyBy pre_test_score needs the pre_test step");
  } else if (config.allocation.algorithm === "stratified_block") {
    issues.push("allocation.algorithm stratified_block after the pre-test needs allocation.stratifyBy");
  }

  if (config.guidance.cueEnabled && !config.guidance.hintText) {
    issues.push("guidance: cueEnabled needs guidance.hintText (the hint both conditions show)");
  }
  for (const ref of config.questionnaires?.pre ?? []) {
    if (typeof ref !== "string" && ref.conditions) issues.push(`questionnaires.pre: ${ref.code} is given before allocation, so it cannot be limited to one condition`);
  }
  return issues;
}

type ConsentFields = Pick<StudyConfig, "consent" | "participantInformation">;

export function consentChangeIssue(before: Partial<ConsentFields> | null | undefined, after: ConsentFields): string | null {
  if (!before?.consent || !after.consent || before.consent.version !== after.consent.version) return null;
  const textChanged = before.consent.text !== after.consent.text;
  const sheetChanged = (before.participantInformation ?? "") !== (after.participantInformation ?? "");
  if (!textChanged && !sheetChanged) return null;
  return `The ${textChanged ? "consent text" : "participant information sheet"} changed but the consent version is still ${after.consent.version}. Give the changed text a new consent version.`;
}

export function parseStudyProtocol(raw: unknown): StudyProtocol {
  const parsed = studyConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) throw new StudyConfigError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const config = parsed.data;
  const steps = config.steps ?? DEFAULT_STEPS;
  const issues = protocolIssues(config, steps);
  if (issues.length > 0) throw new StudyConfigError(issues);
  return { config, steps, questionnaires: config.questionnaires ?? DEFAULT_QUESTIONNAIRES };
}

export function instrumentsFor(protocol: StudyProtocol, step: QuestionnaireStep, condition: LearningCondition | null): { code: string; version?: number }[] {
  return protocol.questionnaires[QUESTIONNAIRE_CONFIG_KEY[step]]
    .map((r) => (typeof r === "string" ? { code: r } : r))
    .filter((r) => !("conditions" in r) || !r.conditions || (condition !== null && r.conditions.includes(condition)))
    .map((r) => ({ code: r.code, ...("version" in r && r.version ? { version: r.version } : {}) }));
}

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

export function practiceRoute(condition: LearningCondition): string {
  return condition === "2d" ? "/learn/2d/practice" : "/learn/immersive/practice";
}

export const STEP_LABEL: Record<StudyStep, string> = Object.fromEntries(
  (
    [
      ["questionnaire_pre", "Questions before you start"],
      ["pre_test", "Questions before learning"],
      ["entrance", "Entrance"],
      ["familiarisation", "Practice with the controls"],
      ["onboarding", "Introduction to the learning task"],
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
