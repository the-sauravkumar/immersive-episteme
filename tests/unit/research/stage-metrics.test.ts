import { describe, expect, it } from "vitest";

import { METRIC_DEFINITIONS as PIPELINE_DEFINITIONS } from "@/server/research/metrics/session";
import { computeStageMetrics, STAGE_METRIC_DEFINITIONS } from "@/server/research/metrics/stage";
import { EVENT_METADATA_SCHEMAS, telemetryEventSchema } from "@/features/telemetry/contracts";
import { metricDefinition, metricRole } from "@/features/research/metric-definitions";

const ref = { traditionKey: "ajrakh", stageKey: "s1", stageNumber: 1 };
const event = (seq: number, type: string, metadata: Record<string, unknown>) => ({ seq, type, metadata });
const valueOf = (events: Parameters<typeof computeStageMetrics>[0], name: string) => computeStageMetrics(events).find((m) => m.metricName === name)!;

describe("stage and walk metrics", () => {
  const events = [
    event(0, "stage_entered", { ...ref, backStep: false }),
    event(1, "object_dwell", { ...ref, objectKey: "block", dwellMs: 1000, closestM: 2 }),
    event(2, "object_dwell", { ...ref, objectKey: "block", dwellMs: 500, closestM: 1 }),
    event(3, "object_dwell", { ...ref, objectKey: "vat", dwellMs: 200, closestM: 3 }),
    event(4, "stage_left", { ...ref, activeMs: 4000 }),
    event(5, "stage_entered", { ...ref, stageKey: "s2", stageNumber: 2, backStep: false }),
    event(6, "stage_left", { ...ref, stageKey: "s2", stageNumber: 2, activeMs: 3000 }),
    event(7, "stage_entered", { ...ref, backStep: true }),
    event(8, "stage_left", { ...ref, activeMs: 500 }),
    event(9, "viewpoint_changed", { traditionKey: "ajrakh", stageKey: "s1", count: 4 }),
    event(10, "viewpoint_changed", { traditionKey: "ajrakh", stageKey: "s1", count: 3 }),
    event(11, "wrong_turn", { traditionKey: "ajrakh", stageKey: "s1" }),
    event(12, "movement_summary", { traditionKey: "ajrakh", stageKey: "s1", walkingMs: 900, viewingMs: 3100 }),
    event(13, "path_sampled", { traditionKey: "ajrakh", points: [[0, 0, 0], [10, 3, 4]] }),
    event(14, "path_sampled", { traditionKey: "ajrakh", points: [[20, 3, 8]] }),
  ];

  it("computes time, revisits and back-steps for both doors", () => {
    const total = valueOf(events, "stage.total_ms");
    expect(total.value).toBe(7500);
    expect(total.details.byStage).toEqual({ "ajrakh/s1": 4500, "ajrakh/s2": 3000 });
    expect(valueOf(events, "stage.revisits").value).toBe(1);
    expect(valueOf(events, "stage.back_steps").value).toBe(1);
  });

  it("computes dwell, approach, viewpoint, wrong turns, walking apart from viewing and path for Door 2", () => {
    expect(valueOf(events, "walk.object_dwell_ms")).toMatchObject({ value: 1700, details: { byObject: { block: 1500, vat: 200 } } });
    expect(valueOf(events, "walk.approach_distance_m")).toMatchObject({ value: 2, details: { byObject: { block: 1, vat: 3 } } });
    expect(valueOf(events, "walk.viewpoint_changes").value).toBe(7);
    expect(valueOf(events, "walk.wrong_turns").value).toBe(1);
    expect(valueOf(events, "walk.walking_ms").value).toBe(900);
    expect(valueOf(events, "walk.viewing_ms").value).toBe(3100);
    expect(valueOf(events, "walk.path_length_m").value).toBe(9);
  });

  it("does not count the jump to a new tradition or after a reload as walked path", () => {
    const walked = [
      event(0, "path_sampled", { traditionKey: "ajrakh", segment: "a", points: [[0, 0, 0], [10, 3, 4]] }),
      event(1, "path_sampled", { traditionKey: "sanganeri", segment: "b", points: [[20, 0, 300], [30, 0, 301]] }),
      event(2, "path_sampled", { traditionKey: "sanganeri", segment: "c", points: [[5, 0, 11], [6, 3, 15]] }),
    ];
    expect(valueOf(walked, "walk.path_length_m").value).toBe(11);
  });

  it("reports an undefined approach and zero counts with no events", () => {
    expect(valueOf([], "walk.approach_distance_m").value).toBeNull();
    expect(valueOf([], "stage.total_ms").value).toBe(0);
  });

  it("defines every metric, gives each a role, and joins the pipeline", () => {
    for (const { name } of STAGE_METRIC_DEFINITIONS) {
      expect(metricDefinition(name).key).toBe(name);
      expect(PIPELINE_DEFINITIONS.some((d) => d.name === name)).toBe(true);
    }
    expect(metricRole("stage.total_ms")).toBe("secondary");
    expect(metricRole("walk.object_dwell_ms")).toBe("exploratory");
  });
});

describe("new telemetry kinds", () => {
  const envelope = { eventId: "0190a3c2-1111-7000-8000-000000000001", schemaVersion: 1, sessionId: "0190a3c2-2222-7000-8000-000000000002", seq: 0, clientTs: "2026-11-04T10:00:00.000Z" };

  it("accepts each kind with its metadata and refuses unknown keys", () => {
    const valid: Record<string, Record<string, unknown>> = {
      stage_entered: { ...ref, visitCount: 2, backStep: true },
      stage_left: { ...ref, activeMs: 10 },
      object_dwell: { ...ref, objectKey: "block", dwellMs: 10, closestM: 0.5 },
      path_sampled: { traditionKey: "ajrakh", points: [[1, 2.5, -3]] },
      viewpoint_changed: { traditionKey: "ajrakh", stageKey: "s1", count: 2 },
      wrong_turn: { traditionKey: "ajrakh", stageKey: "s1" },
      movement_summary: { traditionKey: "ajrakh", stageKey: "s1", walkingMs: 1, viewingMs: 2 },
    };
    for (const [type, metadata] of Object.entries(valid)) {
      expect(type in EVENT_METADATA_SCHEMAS).toBe(true);
      expect(telemetryEventSchema.safeParse({ ...envelope, type, metadata }).success, type).toBe(true);
      expect(telemetryEventSchema.safeParse({ ...envelope, type, metadata: { ...metadata, name: "x" } }).success, type).toBe(false);
    }
  });
});
