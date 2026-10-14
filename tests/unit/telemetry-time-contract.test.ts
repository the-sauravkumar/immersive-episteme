/**
 * Contract rules of the time-accounting and citation events, and the learning budget math.
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { learningTimeState, type LearningTimeBudget } from "@/features/learning/time-budget";
import { EVENT_TYPE_CODES, telemetryEventSchema } from "@/features/telemetry/contracts";

const ev = (type: string, extra: Record<string, unknown>) =>
  telemetryEventSchema.safeParse({ eventId: randomUUID(), schemaVersion: 1, sessionId: randomUUID(), seq: 0, type, clientTs: new Date().toISOString(), ...extra });
const C = randomUUID();

describe("time-accounting and citation events", () => {
  it("are registered", () => {
    for (const code of ["exposure_started", "exposure_ended", "navigation_started", "navigation_ended", "timing_paused", "timing_resumed", "citation_opened", "citation_closed"]) {
      expect(EVENT_TYPE_CODES).toContain(code);
    }
  });

  it("require a concept for exposure and citation events", () => {
    expect(ev("exposure_started", { metadata: { intervalId: "iv-1", layer: "overview", startMonoMs: 1 } }).success).toBe(false);
    expect(ev("exposure_started", { conceptId: C, metadata: { intervalId: "iv-1", layer: "overview", startMonoMs: 1 } }).success).toBe(true);
    expect(ev("citation_opened", { metadata: { sourceId: randomUUID(), claimIndex: 0 } }).success).toBe(false);
    expect(ev("citation_opened", { conceptId: C, metadata: { sourceId: randomUUID(), claimIndex: 0 } }).success).toBe(true);
  });

  it("reject intervals whose active + paused time does not fit between start and end", () => {
    const base = { intervalId: "iv-2", startMonoMs: 1000, endMonoMs: 3000, reason: "closed" };
    expect(ev("navigation_ended", { metadata: { ...base, activeMs: 1500, pausedMs: 500 } }).success).toBe(true);
    expect(ev("navigation_ended", { metadata: { ...base, activeMs: 1800, pausedMs: 500 } }).success).toBe(false);
    expect(ev("navigation_ended", { metadata: { ...base, endMonoMs: 500, activeMs: 0, pausedMs: 0 } }).success).toBe(false);
  });

  it("only accept known pause causes", () => {
    expect(ev("timing_paused", { metadata: { intervalKind: "none", cause: "modal" } }).success).toBe(true);
    expect(ev("timing_paused", { metadata: { intervalKind: "none", cause: "coffee" } }).success).toBe(false);
  });
});

describe("learning time budget", () => {
  const budget = (b: Partial<LearningTimeBudget>): LearningTimeBudget => ({
    mode: "fixed_time",
    budgetSeconds: 600,
    allowEarlyFinish: false,
    startedAt: "2026-01-01T10:00:00.000Z",
    endsAt: "2026-01-01T10:10:00.000Z",
    endedAt: null,
    serverNow: "2026-01-01T10:00:00.000Z",
    persisted: true,
    ...b,
  });
  const at = (iso: string) => Date.parse(iso);

  it("counts down from the server timestamps and only allows finishing at the end", () => {
    expect(learningTimeState(budget({}), at("2026-01-01T10:04:00.000Z"))).toEqual({ remainingSeconds: 360, elapsedSeconds: 240, expired: false, canFinish: false });
    expect(learningTimeState(budget({}), at("2026-01-01T10:12:00.000Z"))).toMatchObject({ remainingSeconds: 0, expired: true, canFinish: true });
    expect(learningTimeState(budget({ allowEarlyFinish: true }), at("2026-01-01T10:01:00.000Z")).canFinish).toBe(true);
  });

  it("starts demo budgets at serverNow and leaves self-paced sessions open", () => {
    const demo = budget({ startedAt: null, endsAt: null, persisted: false, serverNow: "2026-01-01T09:00:00.000Z" });
    expect(learningTimeState(demo, at("2026-01-01T09:01:00.000Z")).remainingSeconds).toBe(540);
    const free = budget({ mode: "self_paced", budgetSeconds: null, endsAt: null });
    expect(learningTimeState(free, at("2026-01-01T11:00:00.000Z"))).toMatchObject({ remainingSeconds: null, canFinish: true, expired: false });
    expect(learningTimeState(budget({ endedAt: "2026-01-01T10:05:00.000Z" }), at("2026-01-01T10:06:00.000Z"))).toMatchObject({ expired: true, canFinish: false });
  });
});
