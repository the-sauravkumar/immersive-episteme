/**
 * Versioned derived-metric definitions for learning-time accounting (condition equivalence).
 *
 * Inputs: a session's raw telemetry events (telemetry_events), ordered by seq. Outputs: rows for
 * `derived_metrics` (derivedMetricSchema: metricName, metricVersion, value, details,
 * inputEventCount, inputSha256, pipelineVersion). These timings are behavioural telemetry, NOT
 * learning outcomes: they never go to derived_scores (database check derived_scores_no_timing_ck)
 * or any assessment table.
 *
 * Definitions (v1). All durations are milliseconds of ACTIVE time measured by the client's
 * monotonic clock and reported in the interval end events, so paused time (tab hidden, window
 * blurred, non-content modal) is already excluded:
 *  - time.exposure_total_ms        sum of exposure_ended.activeMs
 *  - time.exposure_by_layer_ms     same, split by metadata.layer (value = total; per layer in details)
 *  - time.navigation_ms            sum of navigation_ended.activeMs
 *  - time.navigation_share         navigation / (navigation + exposure); null when both are 0
 *  - time.pause_ms                 sum of timing_resumed.pausedMs (completed pauses)
 *  - citation.openings             count of citation_opened (details: distinct sources, per concept)
 * Intervals whose end event is missing (e.g. the browser was killed) are NOT guessed: they are
 * counted in details.unterminated and excluded from the sums.
 */
import type { TelemetryEvent } from "./contracts";

export const TIMING_METRICS_VERSION = "1";

export const TIMING_METRIC_DEFINITIONS = [
  { name: "time.exposure_total_ms", version: TIMING_METRICS_VERSION, unit: "ms", definition: "Sum of exposure_ended.metadata.activeMs (content visible, pauses excluded)." },
  { name: "time.exposure_by_layer_ms", version: TIMING_METRICS_VERSION, unit: "ms", definition: "Exposure active time per metadata.layer (overview, artisan, process, science, comparison, citation); value is the total, details.byLayer the split." },
  { name: "time.navigation_ms", version: TIMING_METRICS_VERSION, unit: "ms", definition: "Sum of navigation_ended.metadata.activeMs (moving or browsing with no concept content open, pauses excluded)." },
  { name: "time.navigation_share", version: TIMING_METRICS_VERSION, unit: "ratio", definition: "navigation_ms / (navigation_ms + exposure_total_ms); null when both are zero." },
  { name: "time.pause_ms", version: TIMING_METRICS_VERSION, unit: "ms", definition: "Sum of timing_resumed.metadata.pausedMs (tab hidden, window blurred, non-content modal)." },
  { name: "citation.openings", version: TIMING_METRICS_VERSION, unit: "count", definition: "Number of citation_opened events; details: distinct sources and openings per concept." },
] as const;

export type TimingMetricName = (typeof TIMING_METRIC_DEFINITIONS)[number]["name"];

export interface TimingMetricValue {
  metricName: TimingMetricName;
  metricVersion: string;
  value: number | null;
  details: Record<string, unknown>;
}

type Ev = Pick<TelemetryEvent, "type" | "seq" | "conceptId" | "metadata">;

/** Computes the v1 timing metrics of one session from its events (any order; sorted by seq). */
export function computeTimingMetrics(events: readonly Ev[]): TimingMetricValue[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const started = new Map<string, "exposure" | "navigation">();
  const ended = new Set<string>();
  let exposure = 0;
  let navigation = 0;
  let pause = 0;
  const byLayer: Record<string, number> = {};
  let citations = 0;
  const citedSources = new Set<string>();
  const perConcept: Record<string, number> = {};

  for (const e of sorted) {
    const m = e.metadata as Record<string, unknown>;
    switch (e.type) {
      case "exposure_started":
        started.set(String(m.intervalId), "exposure");
        break;
      case "navigation_started":
        started.set(String(m.intervalId), "navigation");
        break;
      case "exposure_ended": {
        const ms = Number(m.activeMs);
        exposure += ms;
        byLayer[String(m.layer)] = (byLayer[String(m.layer)] ?? 0) + ms;
        ended.add(String(m.intervalId));
        break;
      }
      case "navigation_ended":
        navigation += Number(m.activeMs);
        ended.add(String(m.intervalId));
        break;
      case "timing_resumed":
        pause += Number(m.pausedMs);
        break;
      case "citation_opened":
        citations++;
        citedSources.add(String(m.sourceId));
        if (e.conceptId) perConcept[e.conceptId] = (perConcept[e.conceptId] ?? 0) + 1;
        break;
      default:
        break;
    }
  }
  const unterminated = [...started.keys()].filter((id) => !ended.has(id)).length;
  const v = (metricName: TimingMetricName, value: number | null, details: Record<string, unknown> = {}): TimingMetricValue => ({
    metricName,
    metricVersion: TIMING_METRICS_VERSION,
    value,
    details,
  });
  return [
    v("time.exposure_total_ms", exposure, { unterminated }),
    v("time.exposure_by_layer_ms", exposure, { byLayer }),
    v("time.navigation_ms", navigation, { unterminated }),
    v("time.navigation_share", navigation + exposure === 0 ? null : navigation / (navigation + exposure)),
    v("time.pause_ms", pause),
    v("citation.openings", citations, { distinctSources: citedSources.size, perConcept }),
  ];
}
