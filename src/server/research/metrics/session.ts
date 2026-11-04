/**
 * All derived behavioural metrics of one session, from its raw events. Pure; shared by the
 * persistence pipeline (./pipeline.ts) and the export re-import validator, so a stored value can
 * always be recomputed from exported raw records (spec §15.4).
 *
 * Families: time accounting, navigation, stage and walk behaviour (./stage.ts), and
 * navigation-to-map correspondence. All go to derived_metrics, never to derived_scores.
 */
import { canonicalHash } from "@/features/spatial/compiler/canonical";
import type { TelemetryEvent } from "@/features/telemetry/contracts";
import { computeTimingMetrics, TIMING_METRIC_DEFINITIONS } from "@/features/telemetry/metrics";

import { computeMapCorrespondence, CORRESPONDENCE_METRIC, CORRESPONDENCE_VERSION, type MapEdgeInput, type SnapshotRelationship } from "./correspondence";
import { computeNavigationMetrics, NAVIGATION_METRIC_DEFINITIONS, NAVIGATION_METRICS_VERSION, type ConceptFacts, type MetricValue, type NavEvent } from "./navigation";
import { computeStageMetrics, STAGE_METRIC_DEFINITIONS, STAGE_METRICS_VERSION } from "./stage";

export const METRICS_PIPELINE_VERSION = "research-metrics/1";

export interface MetricDefinition {
  name: string;
  version: string;
  unit: string;
  family: "time" | "navigation" | "correspondence" | "stage";
  definition: string;
}

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  ...TIMING_METRIC_DEFINITIONS.map((d) => ({ name: d.name, version: d.version, unit: d.unit, family: "time" as const, definition: d.definition })),
  ...NAVIGATION_METRIC_DEFINITIONS.map((d) => ({ name: d.name, version: NAVIGATION_METRICS_VERSION, unit: d.unit, family: "navigation" as const, definition: d.definition })),
  ...STAGE_METRIC_DEFINITIONS.map((d) => ({ name: d.name, version: STAGE_METRICS_VERSION, unit: d.unit, family: "stage" as const, definition: d.definition })),
  {
    name: CORRESPONDENCE_METRIC,
    version: CORRESPONDENCE_VERSION,
    unit: "jaccard",
    family: "correspondence",
    definition: "Jaccard index of navigated concept pairs vs final post-learning concept-map pairs; details: concepts exposed/inspected, relationships followed, map edges correct/incorrect against the snapshot graph.",
  },
];

export interface SessionMetricInput {
  events: readonly (NavEvent & { eventId: string })[];
  concepts: ReadonlyMap<string, ConceptFacts>;
  relationships: readonly SnapshotRelationship[];
  /** Final post-learning concept map, if any: its id and revision join the input hash. */
  map: { id: string; revision: number; edges: readonly MapEdgeInput[] } | null;
}

export interface ComputedMetrics {
  values: MetricValue[];
  inputEventCount: number;
  inputSha256: string;
}

/** sha256 over the ordered (event_id, seq) list (+ the concept map's id and revision). */
export function metricInputHash(events: readonly { eventId: string; seq: number }[], map: { id: string; revision: number } | null): string {
  const ordered = [...events].sort((a, b) => a.seq - b.seq).map((e) => [e.eventId, e.seq]);
  return canonicalHash({ events: ordered, map: map ? [map.id, map.revision] : null });
}

export function computeSessionMetrics(input: SessionMetricInput): ComputedMetrics {
  const timing = computeTimingMetrics(
    input.events.map((e) => ({
      type: e.type as TelemetryEvent["type"],
      seq: e.seq,
      conceptId: e.conceptId ?? undefined,
      metadata: (e.metadata ?? {}) as TelemetryEvent["metadata"],
    })),
  );
  const nav = computeNavigationMetrics(input.events, input.concepts);
  const corr = computeMapCorrespondence(input.events, input.map ? input.map.edges : null, input.relationships);
  return {
    values: [...timing.map((t) => ({ ...t, details: t.details })), ...nav, ...computeStageMetrics(input.events), corr],
    inputEventCount: input.events.length,
    inputSha256: metricInputHash(input.events, input.map),
  };
}
