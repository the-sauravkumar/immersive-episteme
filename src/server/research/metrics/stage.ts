import type { MetricValue, NavEvent } from "./navigation";

export const STAGE_METRICS_VERSION = "1";

export const STAGE_METRIC_DEFINITIONS = [
  { name: "stage.total_ms", unit: "ms", definition: "Sum of activeMs over stage_left events; time on task, recorded as an outcome. details: byStage." },
  { name: "stage.revisits", unit: "count", definition: "stage_entered events beyond the first entry of each stage." },
  { name: "stage.back_steps", unit: "count", definition: "stage_entered events with backStep true: a lower stage of the same tradition than the stage just left." },
  { name: "walk.object_dwell_ms", unit: "ms", definition: "Door 2. Sum of dwellMs over object_dwell events. details: byObject." },
  { name: "walk.approach_distance_m", unit: "m", definition: "Door 2. Mean of the closest approach per object_dwell event; null without any. details: byObject minimum." },
  { name: "walk.viewpoint_changes", unit: "count", definition: "Door 2. Sum of count over viewpoint_changed events." },
  { name: "walk.wrong_turns", unit: "count", definition: "Door 2. wrong_turn events: the learner moved away from the next station for longer than the route allows." },
  { name: "walk.walking_ms", unit: "ms", definition: "Door 2. Sum of walkingMs over movement_summary events." },
  { name: "walk.viewing_ms", unit: "ms", definition: "Door 2. Sum of viewingMs over movement_summary events: standing still at a station, kept apart from walking." },
  { name: "walk.path_length_m", unit: "m", definition: "Door 2. Length of the sampled path over path_sampled events." },
] as const;

const metadata = (event: NavEvent): Record<string, unknown> => event.metadata ?? {};
const numberOf = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

function metric(metricName: string, value: number | null, details: Record<string, unknown> = {}): MetricValue {
  return { metricName, metricVersion: STAGE_METRICS_VERSION, value, details };
}

function pathLength(events: readonly NavEvent[]): number {
  let total = 0;
  let last: readonly [number, number] | null = null;
  for (const event of events) {
    const points = metadata(event).points;
    if (!Array.isArray(points)) continue;
    for (const point of points as [number, number, number][]) {
      if (last) total += Math.hypot(point[1] - last[0], point[2] - last[1]);
      last = [point[1], point[2]];
    }
  }
  return total;
}

export function computeStageMetrics(events: readonly NavEvent[]): MetricValue[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const ofType = (type: string) => ordered.filter((event) => event.type === type);
  const entered = ofType("stage_entered");
  const stageId = (event: NavEvent) => `${textOf(metadata(event).traditionKey)}/${textOf(metadata(event).stageKey)}`;
  const byStage: Record<string, number> = {};
  for (const event of ofType("stage_left")) byStage[stageId(event)] = (byStage[stageId(event)] ?? 0) + numberOf(metadata(event).activeMs);
  const dwell = ofType("object_dwell");
  const dwellByObject: Record<string, number> = {};
  const closestByObject: Record<string, number> = {};
  for (const event of dwell) {
    const key = textOf(metadata(event).objectKey);
    dwellByObject[key] = (dwellByObject[key] ?? 0) + numberOf(metadata(event).dwellMs);
    const closest = numberOf(metadata(event).closestM);
    closestByObject[key] = Math.min(closestByObject[key] ?? closest, closest);
  }
  const movement = ofType("movement_summary");
  const sum = (list: readonly NavEvent[], key: string) => list.reduce((total, event) => total + numberOf(metadata(event)[key]), 0);
  return [
    metric("stage.total_ms", sum(ofType("stage_left"), "activeMs"), { byStage }),
    metric("stage.revisits", entered.length - new Set(entered.map(stageId)).size),
    metric("stage.back_steps", entered.filter((event) => metadata(event).backStep === true).length),
    metric("walk.object_dwell_ms", sum(dwell, "dwellMs"), { byObject: dwellByObject }),
    metric("walk.approach_distance_m", dwell.length === 0 ? null : sum(dwell, "closestM") / dwell.length, { byObject: closestByObject }),
    metric("walk.viewpoint_changes", sum(ofType("viewpoint_changed"), "count")),
    metric("walk.wrong_turns", ofType("wrong_turn").length),
    metric("walk.walking_ms", sum(movement, "walkingMs")),
    metric("walk.viewing_ms", sum(movement, "viewingMs")),
    metric("walk.path_length_m", pathLength(ofType("path_sampled"))),
  ];
}
