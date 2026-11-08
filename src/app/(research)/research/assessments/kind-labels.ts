import type { ASSESSMENT_KINDS } from "@/lib/validation/enums";

type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  pretest: "Pre-test",
  posttest: "Post-test",
  reconstruction: "Concept-map reconstruction",
  transfer: "Transfer task",
  questionnaire: "Questionnaire",
  sketch: "Layout sketch",
};

export const kindLabel = (kind: string): string => ASSESSMENT_KIND_LABEL[kind as AssessmentKind] ?? kind;
