import type { TelemetryEvent } from "./contracts";

export const TIMING_METRICS_VERSION = "2";

export const TIMING_METRIC_DEFINITIONS = [
  { name: "time.exposure_total_ms", version: TIMING_METRICS_VERSION, unit: "ms", definition: "Sum of stage_left.metadata.activeMs (a stop open, pauses excluded) less the walking time in movement_summary; null when no stop was left." },
  { name: "time.navigation_ms", version: TIMING_METRICS_VERSION, unit: "ms", definition: "Sum of movement_summary.metadata.walkingMs (walking between stops in Door 2; Door 1 turns pages without a walking interval, so it records none); null when no stop was left." },
  { name: "time.navigation_share", version: TIMING_METRICS_VERSION, unit: "ratio", definition: "navigation_ms / (navigation_ms + exposure_total_ms); null when both are zero or absent." },
  { name: "time.pause_ms", version: TIMING_METRICS_VERSION, unit: "ms", definition: "Sum of timing_resumed.metadata.pausedMs (tab hidden or window blurred)." },
  { name: "citation.openings", version: TIMING_METRICS_VERSION, unit: "count", definition: "Number of source_opened events (the sources behind a stop's caption); details: distinct stops." },
] as const;

type TimingMetricName = (typeof TIMING_METRIC_DEFINITIONS)[number]["name"];

export interface TimingMetricValue {
  metricName: TimingMetricName;
  metricVersion: string;
  value: number | null;
  details: Record<string, unknown>;
}

type Ev = Pick<TelemetryEvent, "type" | "seq" | "conceptId" | "metadata">;

const stopOf = (m: Record<string, unknown>) => `${String(m.traditionKey)}:${String(m.stageKey)}`;

export function computeTimingMetrics(events: readonly Ev[]): TimingMetricValue[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  let stopsLeft = 0;
  let open = 0;
  let active = 0;
  let walking = 0;
  let pause = 0;
  let citations = 0;
  const citedStops = new Set<string>();

  for (const e of sorted) {
    const m = e.metadata as Record<string, unknown>;
    switch (e.type) {
      case "stage_entered":
        open = 1;
        break;
      case "stage_left":
        stopsLeft++;
        open = 0;
        active += Number(m.activeMs);
        break;
      case "movement_summary":
        walking += Number(m.walkingMs);
        break;
      case "timing_resumed":
        pause += Number(m.pausedMs);
        break;
      case "source_opened":
        citations++;
        citedStops.add(stopOf(m));
        break;
      default:
        break;
    }
  }
  const measured = stopsLeft > 0;
  const exposure = measured ? Math.max(0, active - walking) : null;
  const navigation = measured ? walking : null;
  const v = (metricName: TimingMetricName, value: number | null, details: Record<string, unknown> = {}): TimingMetricValue => ({
    metricName,
    metricVersion: TIMING_METRICS_VERSION,
    value,
    details,
  });
  return [
    v("time.exposure_total_ms", exposure, { stopsLeft, unterminated: open }),
    v("time.navigation_ms", navigation, { stopsLeft }),
    v("time.navigation_share", exposure === null || navigation === null || navigation + exposure === 0 ? null : navigation / (navigation + exposure)),
    v("time.pause_ms", pause),
    v("citation.openings", citations, { distinctStops: citedStops.size }),
  ];
}
