import { describe, expect, it } from "vitest";

import { computeSessionTelemetry, ROLLUP_EVENT_TYPES, type RollupEvent } from "@/server/research/dashboard-rollups";
import { EVENT_TYPE_REGISTRY } from "@/features/telemetry/contracts";

const stop = (stageKey: string, stageNumber: number) => ({ traditionKey: "sanganeri", stageKey, stageNumber });
const ev = (seq: number, type: string, metadata: Record<string, unknown>): RollupEvent => ({ seq, type, conceptId: null, metadata });

const DOOR_ONE: RollupEvent[] = [
  ev(0, "stage_entered", { ...stop("carving", 1), visitCount: 1, backStep: false }),
  ev(1, "source_opened", stop("carving", 1)),
  ev(2, "stage_left", { ...stop("carving", 1), activeMs: 45_000 }),
  ev(3, "stage_entered", { ...stop("scouring", 2), visitCount: 1, backStep: false }),
  ev(4, "timing_resumed", { pausedMs: 4_000, causes: ["hidden"] }),
  ev(5, "stage_left", { ...stop("scouring", 2), activeMs: 15_000 }),
  ev(6, "stage_entered", { ...stop("carving", 1), visitCount: 2, backStep: true }),
];

describe("per-session dashboard figures", () => {
  it("come from the stage, source and pause events a learning door sends", () => {
    expect(computeSessionTelemetry(DOOR_ONE, { eventCount: 9, lastSeq: 8 })).toEqual({
      eventCount: 9,
      lastSeq: 8,
      stageMs: 60_000,
      stopsVisited: 2,
      revisits: 1,
      backSteps: 1,
      sourcesOpened: 1,
      pauseMs: 4_000,
      clientErrors: 0,
    });
  });

  it("give Door 2 the same figures for the same stage events, whatever it adds", () => {
    const doorTwo = [...DOOR_ONE, ev(7, "movement_summary", { traditionKey: "sanganeri", stageKey: "carving", walkingMs: 9_000, viewingMs: 30_000 }), ev(8, "client_error", { messageHash: "x" })];
    const one = computeSessionTelemetry(DOOR_ONE, { eventCount: 7, lastSeq: 6 });
    const two = computeSessionTelemetry(doorTwo, { eventCount: 7, lastSeq: 6 });
    expect({ ...two, clientErrors: 0 }).toEqual(one);
    expect(two.clientErrors).toBe(1);
  });

  it("read only event types that a door or the tracker can send", () => {
    const registered = new Set(EVENT_TYPE_REGISTRY.map((t) => t.code));
    for (const type of ROLLUP_EVENT_TYPES) expect(registered.has(type), type).toBe(true);
    expect(ROLLUP_EVENT_TYPES).not.toContain("exposure_started");
    expect(ROLLUP_EVENT_TYPES).not.toContain("webgl_context_lost");
  });
});
