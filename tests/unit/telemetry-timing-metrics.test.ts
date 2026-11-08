import { describe, expect, it } from "vitest";

import { TIMING_METRIC_DEFINITIONS, computeTimingMetrics } from "@/features/telemetry/metrics";

type Ev = Parameters<typeof computeTimingMetrics>[0][number];

const stop = { traditionKey: "ajrakh", stageKey: "s1", stageNumber: 1 };
const events = (rows: [string, Record<string, unknown>][]): Ev[] => rows.map(([type, metadata], seq) => ({ type, seq, metadata }) as Ev);
const byName = (rows: Ev[]) => Object.fromEntries(computeTimingMetrics(rows).map((x) => [x.metricName, x]));

describe("timing metrics v2", () => {
  it("defines every metric with a version", () => {
    expect(TIMING_METRIC_DEFINITIONS.map((d) => d.name)).toEqual(["time.exposure_total_ms", "time.navigation_ms", "time.navigation_share", "time.pause_ms", "citation.openings"]);
    expect(TIMING_METRIC_DEFINITIONS.every((d) => d.version === "2")).toBe(true);
  });

  it("measures exposure and navigation from the stop events both doors send", () => {
    const m = byName(
      events([
        ["stage_entered", stop],
        ["source_opened", stop],
        ["stage_left", { ...stop, activeMs: 9000 }],
        ["movement_summary", { traditionKey: "ajrakh", stageKey: "s1", walkingMs: 3000, viewingMs: 6000 }],
        ["timing_resumed", { pausedMs: 2000 }],
        ["stage_entered", { ...stop, stageKey: "s2", stageNumber: 2 }],
        ["stage_left", { ...stop, stageKey: "s2", stageNumber: 2, activeMs: 4000 }],
      ]),
    );
    expect(m["time.exposure_total_ms"]!.value).toBe(10000);
    expect(m["time.navigation_ms"]!.value).toBe(3000);
    expect(m["time.navigation_share"]!.value).toBeCloseTo(3000 / 13000);
    expect(m["time.pause_ms"]!.value).toBe(2000);
    expect(m["citation.openings"]).toMatchObject({ value: 1, details: { distinctStops: 1 } });
  });

  it("gives null, not zero, when no stop was left", () => {
    const m = byName(events([["session_started", {}]]));
    expect(m["time.exposure_total_ms"]!.value).toBeNull();
    expect(m["time.navigation_ms"]!.value).toBeNull();
    expect(m["time.navigation_share"]!.value).toBeNull();
  });
});
