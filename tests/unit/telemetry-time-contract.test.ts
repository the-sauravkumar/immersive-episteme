import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

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
