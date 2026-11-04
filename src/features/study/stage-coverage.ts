import type { StageTemplate } from "@/features/process/domain/stage-template";

export const PRODUCT_STOP_KEY = "products";

export interface StageStop {
  readonly traditionKey: string;
  readonly stageKey: string;
  readonly stageNumber: number;
}

export interface StageVisit {
  readonly traditionKey: string;
  readonly stageKey: string;
}

export interface StageCoverage {
  readonly required: number;
  readonly visited: number;
  readonly complete: boolean;
  readonly unvisited: readonly StageStop[];
}

const stopId = (stop: StageVisit): string => `${stop.traditionKey}/${stop.stageKey}`;

export function requiredStops(templates: readonly StageTemplate[]): StageStop[] {
  return templates.flatMap((template) => [
    ...template.stages.map((stage) => ({ traditionKey: template.tradition, stageKey: stage.key, stageNumber: stage.number })),
    { traditionKey: template.tradition, stageKey: PRODUCT_STOP_KEY, stageNumber: template.stages.length + 1 },
  ]);
}

export function coverageOf(required: readonly StageStop[], visits: readonly StageVisit[]): StageCoverage {
  const seen = new Set(visits.map(stopId));
  const unvisited = required.filter((stop) => !seen.has(stopId(stop)));
  return { required: required.length, visited: required.length - unvisited.length, complete: unvisited.length === 0, unvisited };
}

export type StopAdmission = { readonly admitted: true; readonly stop: StageStop } | { readonly admitted: false; readonly reason: "unknown_stop" | "stop_ahead"; readonly expected: StageStop | null };

export function admitStop(required: readonly StageStop[], visits: readonly StageVisit[], target: StageVisit): StopAdmission {
  const index = required.findIndex((stop) => stopId(stop) === stopId(target));
  const seen = new Set(visits.map(stopId));
  const firstUnvisited = required.findIndex((stop) => !seen.has(stopId(stop)));
  const expected = firstUnvisited < 0 ? null : required[firstUnvisited]!;
  if (index < 0) return { admitted: false, reason: "unknown_stop", expected };
  if (firstUnvisited >= 0 && index > firstUnvisited) return { admitted: false, reason: "stop_ahead", expected };
  return { admitted: true, stop: required[index]! };
}

export interface StopPosition {
  readonly tradition: number;
  readonly stop: number;
}

export interface LearningResume extends StopPosition {
  readonly reached: readonly number[];
}

export function stopPosition(templates: readonly StageTemplate[], visit: StageVisit): StopPosition | null {
  const tradition = templates.findIndex((template) => template.tradition === visit.traditionKey);
  if (tradition < 0) return null;
  const template = templates[tradition]!;
  const stop = visit.stageKey === PRODUCT_STOP_KEY ? template.stages.length : template.stages.findIndex((stage) => stage.key === visit.stageKey);
  return stop < 0 ? null : { tradition, stop };
}

export function resumeFrom(templates: readonly StageTemplate[], visits: readonly StageVisit[]): LearningResume | null {
  const positions = visits.flatMap((visit) => stopPosition(templates, visit) ?? []);
  const last = positions.at(-1);
  if (!last) return null;
  const reached = templates.map((_, tradition) => Math.max(-1, ...positions.filter((position) => position.tradition === tradition).map((position) => position.stop)));
  return { ...last, reached };
}

export function inAssignedOrder(templates: readonly StageTemplate[], order: readonly string[]): StageTemplate[] {
  return order.map((key) => {
    const template = templates.find((candidate) => candidate.tradition === key);
    if (!template) throw new Error(`No stage template for ${key}`);
    return template;
  });
}
