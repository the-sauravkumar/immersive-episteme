import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindLearningTelemetry, finishLearning, LEARNING_PROGRESS_ENDPOINT, learningProgressRequestSchema, reportMovement, reportObjectDwell, reportPathSample, reportStageEntered, reportStageLeft, reportViewpointChanges, reportWrongTurn } from "@/features/study/learning-progress";

const stage = { traditionKey: "ajrakh", stageKey: "s1", stageNumber: 1 };

describe("learning progress client", () => {
  const sink = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(() => {
    sink.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    bindLearningTelemetry(sink);
  });
  afterEach(() => {
    bindLearningTelemetry(null);
    vi.unstubAllGlobals();
  });
  const respond = (body: unknown) => fetchMock.mockResolvedValue({ json: async () => body });

  it("posts a stage entry and logs it once the server admits it", async () => {
    respond({ ok: true, persisted: true, visitCount: 2, backStep: true, complete: false, unvisited: 3 });
    expect(await reportStageEntered(stage)).toMatchObject({ ok: true, visitCount: 2 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(LEARNING_PROGRESS_ENDPOINT);
    expect(JSON.parse(init.body)).toEqual({ kind: "stage_entered", stage });
    expect(sink).toHaveBeenCalledWith("stage_entered", { metadata: { ...stage, visitCount: 2, backStep: true }, roomOrPageId: "stage:ajrakh:s1" });
  });

  it("logs nothing when the server refuses a stage ahead, and reports an unreachable server", async () => {
    respond({ ok: false, reason: "stop_ahead", expected: { traditionKey: "ajrakh", stageKey: "s0" } });
    expect(await reportStageEntered(stage)).toMatchObject({ ok: false, reason: "stop_ahead" });
    expect(sink).not.toHaveBeenCalled();
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await reportStageEntered(stage)).toEqual({ ok: false, reason: "unavailable", expected: null });
    expect(await finishLearning()).toEqual({ ok: false, reason: "unavailable", unvisited: [] });
  });

  it("sends a stage exit with keepalive and whole milliseconds", () => {
    respond({ ok: true });
    reportStageLeft(stage, 1234.6);
    expect(sink).toHaveBeenCalledWith("stage_left", { metadata: { ...stage, activeMs: 1235 }, roomOrPageId: "stage:ajrakh:s1" });
    const init = fetchMock.mock.calls[0]![1];
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ kind: "stage_left", stage, activeMs: 1235 });
  });

  it("passes the Door 2 measures to telemetry and leaves empty reports out", () => {
    reportObjectDwell(stage, { objectKey: "block", dwellMs: 10.4, closestM: 1.5 });
    reportPathSample("ajrakh", [[1, 2, 3]]);
    reportPathSample("ajrakh", []);
    reportViewpointChanges(stage, 2);
    reportViewpointChanges(stage, 0);
    reportWrongTurn(stage);
    reportMovement(stage, 1.2, 3.7);
    expect(sink.mock.calls.map((c) => c[0])).toEqual(["object_dwell", "path_sampled", "viewpoint_changed", "wrong_turn", "movement_summary"]);
    expect(sink.mock.calls[4]![1].metadata).toEqual({ traditionKey: "ajrakh", stageKey: "s1", walkingMs: 1, viewingMs: 4 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a malformed request at the route's schema", () => {
    expect(learningProgressRequestSchema.safeParse({ kind: "stage_left", stage, activeMs: -1 }).success).toBe(false);
    expect(learningProgressRequestSchema.safeParse({ kind: "other" }).success).toBe(false);
    expect(learningProgressRequestSchema.safeParse({ kind: "finish" }).success).toBe(true);
  });
});
