/**
 * Derived timing metrics (v1) computed from interval events produced by the time accountant.
 */
import { describe, expect, it } from "vitest";

import { createTimeAccountant, type RawTrackFn } from "@/features/telemetry/client";
import { TIMING_METRIC_DEFINITIONS, computeTimingMetrics } from "@/features/telemetry/metrics";

const C1 = "0190f0a0-0000-7000-8000-0000000000a1";
const S1 = "0190f0a0-0000-7000-8000-0000000000b1";

function session() {
  let now = 0;
  let seq = 0;
  const events: { type: string; seq: number; conceptId?: string; metadata: Record<string, unknown> }[] = [];
  const track = ((type: string, fields?: { conceptId?: string; metadata?: Record<string, unknown> }) => {
    events.push({ type, seq: seq++, conceptId: fields?.conceptId, metadata: fields?.metadata ?? {} });
    return Promise.resolve(null);
  }) as unknown as RawTrackFn;
  return { acc: createTimeAccountant({ track, monotonicNow: () => now }), events, advance: (ms: number) => (now += ms), push: (e: (typeof events)[number]) => events.push({ ...e, seq: seq++ }) };
}

describe("timing metrics v1", () => {
  it("defines every required metric with a version", () => {
    expect(TIMING_METRIC_DEFINITIONS.map((d) => d.name)).toEqual([
      "time.exposure_total_ms",
      "time.exposure_by_layer_ms",
      "time.navigation_ms",
      "time.navigation_share",
      "time.pause_ms",
      "citation.openings",
    ]);
    expect(TIMING_METRIC_DEFINITIONS.every((d) => d.version === "1")).toBe(true);
  });

  it("matches the accountant's own totals and excludes unterminated intervals", () => {
    const { acc, events, advance, push } = session();
    acc.beginNavigation("walk");
    advance(3000);
    acc.beginExposure(C1, "overview");
    advance(6000);
    acc.pause("hidden");
    advance(2000);
    acc.resume("hidden");
    acc.beginExposure(C1, "science");
    advance(1000);
    push({ type: "citation_opened", seq: 0, conceptId: C1, metadata: { sourceId: S1, claimIndex: 0 } });
    acc.beginNavigation("walk"); // left open: unterminated
    advance(500);
    const m = Object.fromEntries(computeTimingMetrics(events as Parameters<typeof computeTimingMetrics>[0]).map((x) => [x.metricName, x]));
    expect(m["time.exposure_total_ms"]!.value).toBe(7000);
    expect(m["time.exposure_by_layer_ms"]!.details).toEqual({ byLayer: { overview: 6000, science: 1000 } });
    expect(m["time.navigation_ms"]!.value).toBe(3000);
    expect(m["time.navigation_ms"]!.details).toEqual({ unterminated: 1 });
    expect(m["time.navigation_share"]!.value).toBeCloseTo(0.3);
    expect(m["time.pause_ms"]!.value).toBe(2000);
    expect(m["citation.openings"]).toMatchObject({ value: 1, details: { distinctSources: 1 } });
  });

  it("navigation share is null without any time", () => {
    const m = computeTimingMetrics([]);
    expect(m.find((x) => x.metricName === "time.navigation_share")!.value).toBeNull();
  });
});
