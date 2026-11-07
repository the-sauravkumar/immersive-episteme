import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bindLearningTelemetry, closeOpenStop, finishLearning, LEARNING_PROGRESS_ENDPOINT, learningProgressRequestSchema, logStageLeft, registerOpenStop, reportMovement, reportObjectDwell, reportGuidanceCue, reportPathSample, reportStageEntered, reportViewpointChanges, reportWebglContextLost, reportWrongTurn, sendStageLeft, unbindLearningTelemetry } from "@/features/study/learning-progress";
import { EVENT_METADATA_SCHEMAS } from "@/features/telemetry/contracts";

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
  const respond = (body: unknown, status = 200) => fetchMock.mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body });

  it("logs a WebGL context loss and every guidance use as events the telemetry contract accepts", () => {
    reportWebglContextLost();
    reportGuidanceCue("shown", "stall");
    reportGuidanceCue("followed", "hint");
    expect(sink.mock.calls.map(([type]) => type)).toEqual(["webgl_context_lost", "guidance_cue_used", "guidance_cue_used"]);
    for (const [type, input] of sink.mock.calls) expect(EVENT_METADATA_SCHEMAS[type as keyof typeof EVENT_METADATA_SCHEMAS].safeParse(input.metadata).success).toBe(true);
  });

  it("posts a stage entry and logs it once the server admits it", async () => {
    respond({ ok: true, persisted: true, visitCount: 2, backStep: true, complete: false, unvisited: 3 });
    expect(await reportStageEntered(stage)).toMatchObject({ ok: true, visitCount: 2 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(LEARNING_PROGRESS_ENDPOINT);
    expect(JSON.parse(init.body)).toEqual({ kind: "stage_entered", stage });
    expect(sink).toHaveBeenCalledWith("stage_entered", { metadata: { ...stage, visitCount: 2, backStep: true }, roomOrPageId: "stage:ajrakh:s1" });
  });

  it("logs nothing when the server refuses a stage ahead, and reports an unreachable server", async () => {
    respond({ ok: false, reason: "stop_ahead", expected: { traditionKey: "ajrakh", stageKey: "s0" } }, 409);
    expect(await reportStageEntered(stage)).toMatchObject({ ok: false, reason: "stop_ahead" });
    expect(sink).not.toHaveBeenCalled();
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await reportStageEntered(stage)).toEqual({ ok: false, reason: "unavailable", expected: null });
    expect(await finishLearning()).toEqual({ ok: false, reason: "unavailable" });
  });

  it("sends a stage exit with keepalive and whole milliseconds, and says when it did not arrive", async () => {
    respond({ ok: true });
    logStageLeft(stage, 1234.6);
    expect(sink).toHaveBeenCalledWith("stage_left", { metadata: { ...stage, activeMs: 1235 }, roomOrPageId: "stage:ajrakh:s1" });
    expect(await sendStageLeft(stage, 1234.6)).toBe("delivered");
    const init = fetchMock.mock.calls[0]![1];
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ kind: "stage_left", stage, activeMs: 1235 });
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await sendStageLeft(stage, 1)).toBe("unavailable");
  });

  it("never counts a refused or failed request as delivered", async () => {
    respond({ error: "unauthenticated" }, 401);
    expect(await sendStageLeft(stage, 1)).toBe("not_learning");
    expect(await finishLearning()).toEqual({ ok: false, reason: "not_learning" });
    fetchMock.mockResolvedValue({ status: 500, ok: false, json: async () => ({ error: "server" }) });
    expect(await sendStageLeft(stage, 1)).toBe("unavailable");
    expect(await finishLearning()).toEqual({ ok: false, reason: "unavailable" });
    expect(await reportStageEntered(stage)).toEqual({ ok: false, reason: "unavailable", expected: null });
    fetchMock.mockResolvedValue({ status: 500, ok: false, json: async () => Promise.reject(new SyntaxError("html")) });
    expect(await finishLearning()).toEqual({ ok: false, reason: "unavailable" });
  });

  it("passes a refused early finish through with its end time", async () => {
    respond({ ok: false, reason: "time_remaining", endsAt: "2026-11-07T10:30:00.000Z" }, 409);
    expect(await finishLearning()).toEqual({ ok: false, reason: "time_remaining", endsAt: "2026-11-07T10:30:00.000Z" });
  });

  it("treats a server that no longer knows the participant as the end of learning", async () => {
    respond({ error: "unauthenticated" }, 401);
    expect(await reportStageEntered(stage)).toEqual({ ok: false, reason: "not_learning", expected: null });
  });

  it("keeps a newer sink when an older one is released, and closes only the registered stop", () => {
    const newer = vi.fn();
    bindLearningTelemetry(newer);
    unbindLearningTelemetry(sink);
    reportWrongTurn(stage);
    expect(newer).toHaveBeenCalledTimes(1);
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = registerOpenStop(first);
    const releaseSecond = registerOpenStop(second);
    releaseFirst();
    closeOpenStop();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    releaseSecond();
    closeOpenStop();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("passes the Door 2 measures to telemetry and leaves empty reports out", () => {
    reportObjectDwell(stage, { objectKey: "block", dwellMs: 10.4, closestM: 1.5 });
    reportPathSample("ajrakh", "walk1", [[1, 2, 3]]);
    reportPathSample("ajrakh", "walk1", []);
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
