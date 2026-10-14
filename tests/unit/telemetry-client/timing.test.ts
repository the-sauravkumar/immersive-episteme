/**
 * Time accountant (exposure / navigation / pauses) and its wiring into the tracker: intervals
 * never overlap, pauses are excluded and logged, totals reconcile exactly, and intervals closed
 * by a page-exit handler are part of the exit beacon (no loss).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryOutbox, createTelemetryTracker, createTimeAccountant, type RawTrackFn } from "@/features/telemetry/client";
import { telemetryEventSchema, type TelemetryEvent } from "@/features/telemetry/contracts";

import { SESSION, fakeFetch, type SentBatch } from "./helpers";

const C1 = "0190f0a0-0000-7000-8000-0000000000a1";
const C2 = "0190f0a0-0000-7000-8000-0000000000a2";

function harness() {
  let now = 1000;
  const calls: { type: string; fields: { metadata?: Record<string, unknown>; conceptId?: string } }[] = [];
  const track = ((type: string, fields?: { metadata?: Record<string, unknown> }) => {
    calls.push({ type, fields: fields ?? {} });
    return Promise.resolve(null);
  }) as unknown as RawTrackFn;
  const acc = createTimeAccountant({ track, monotonicNow: () => now });
  return { acc, calls, advance: (ms: number) => (now += ms) };
}

describe("time accountant", () => {
  it("keeps one interval open: a new one closes the previous at the same instant", () => {
    const { acc, calls, advance } = harness();
    acc.beginExposure(C1, "overview");
    advance(5000);
    acc.beginNavigation("walk");
    advance(2000);
    acc.beginExposure(C2, "science");
    advance(1000);
    acc.end();
    expect(calls.map((c) => c.type)).toEqual(["exposure_started", "exposure_ended", "navigation_started", "navigation_ended", "exposure_started", "exposure_ended"]);
    const [, e1, n1, n2] = calls;
    expect(e1!.fields.metadata).toMatchObject({ reason: "switched", activeMs: 5000, pausedMs: 0, layer: "overview" });
    expect(e1!.fields.metadata!.endMonoMs).toBe(n1!.fields.metadata!.startMonoMs);
    expect(n2!.fields.metadata).toMatchObject({ activeMs: 2000, surface: "walk" });
    expect(acc.current()).toBeNull();
  });

  it("pauses for hidden, blur and modal (nested), logs the pause and excludes it from active time", () => {
    const { acc, calls, advance } = harness();
    acc.beginExposure(C1, "process");
    advance(1000);
    acc.pause("blur");
    advance(500);
    acc.pause("hidden");
    advance(500);
    acc.resume("blur");
    expect(acc.paused()).toBe(true);
    advance(1000);
    acc.resume("hidden");
    advance(1000);
    acc.end();
    const types = calls.map((c) => c.type);
    expect(types).toEqual(["exposure_started", "timing_paused", "timing_resumed", "exposure_ended"]);
    expect(calls[1]!.fields.metadata).toMatchObject({ cause: "blur", intervalKind: "exposure" });
    expect(calls[2]!.fields.metadata).toMatchObject({ pausedMs: 2000, causes: ["blur", "hidden"] });
    expect(calls[3]!.fields.metadata).toMatchObject({ activeMs: 2000, pausedMs: 2000 });
  });

  it("an interval opened during a pause starts paused; a modal pause while idle is logged", () => {
    const { acc, calls, advance } = harness();
    acc.pause("modal");
    advance(300);
    acc.beginNavigation("menu");
    advance(700);
    acc.resume("modal");
    advance(1000);
    acc.end();
    const end = calls.find((c) => c.type === "navigation_ended")!;
    expect(end.fields.metadata).toMatchObject({ activeMs: 1000, pausedMs: 700 });
    expect(calls[0]!.fields.metadata).toMatchObject({ intervalKind: "none", cause: "modal" });
  });

  it("reconciles exactly: elapsed = exposure + navigation + paused + idle", () => {
    const { acc, advance } = harness();
    advance(250); // idle
    acc.beginExposure(C1, "overview");
    advance(4000);
    acc.pause("hidden");
    advance(1500);
    acc.resume("hidden");
    acc.beginNavigation("catalogue");
    advance(800);
    acc.end();
    advance(100); // idle
    acc.pause("blur"); // still paused at the end
    advance(50);
    const t = acc.totals();
    expect(t).toEqual({ elapsedMs: 6700, exposureMs: 4000, navigationMs: 800, pausedMs: 1550, idleMs: 350 });
    expect(t.exposureMs + t.navigationMs + t.pausedMs + t.idleMs).toBe(t.elapsedMs);
  });

  it("emits events that satisfy the telemetry contract", () => {
    const { acc, calls, advance } = harness();
    acc.beginExposure(C1, "artisan", { roomOrPageId: "page-1" });
    advance(1234.56);
    acc.pause("hidden");
    advance(10);
    acc.resume("hidden");
    acc.end("budget_ended");
    calls.forEach((c, seq) => {
      const r = telemetryEventSchema.safeParse({
        eventId: crypto.randomUUID(),
        schemaVersion: 1,
        sessionId: SESSION,
        seq,
        type: c.type,
        clientTs: new Date().toISOString(),
        ...c.fields,
      });
      expect(r.success, `${c.type}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    });
  });
});

describe("tracker timing integration", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }));
  afterEach(() => vi.useRealTimers());

  function make() {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const beacons: SentBatch[] = [];
    const beacon = vi.fn((_url: string, data: Blob) => {
      void data.text().then((t) => beacons.push(JSON.parse(t) as SentBatch));
      return true;
    });
    let mono = 0;
    const fetch = fakeFetch();
    const tracker = createTelemetryTracker({
      sessionId: SESSION,
      contentVersion: "review-abc",
      appBuild: "test-build",
      mode: "study",
      storage: new MemoryOutbox(),
      fetchImpl: fetch.impl,
      sendBeacon: beacon,
      monotonicNow: () => mono,
      lifecycle: { window: win, document: doc },
    });
    return { tracker, win, doc, beacon, beacons, fetch, tick: (ms: number) => (mono += ms) };
  }

  it("refuses interval events through the public track (only tracker.timing emits them)", async () => {
    const { tracker } = make();
    await tracker.ready();
    const r = await (tracker.track as unknown as (t: string, f: unknown) => Promise<TelemetryEvent | null>)("exposure_started", {
      conceptId: C1,
      metadata: { intervalId: "x", layer: "overview", startMonoMs: 0 },
    });
    expect(r).toBeNull();
    expect(tracker.getStats().invalid).toBe(1);
    expect("exposureStarted" in tracker).toBe(false);
  });

  it("closes the open interval on pagehide and sends it in the same exit beacon (no loss)", async () => {
    const { tracker, win, beacon, beacons, tick } = make();
    tracker.start();
    await tracker.ready();
    tracker.timing.beginExposure(C1, "overview");
    tick(3000);
    win.dispatchEvent(new Event("pagehide")); // synchronous: close interval, then beacon
    expect(beacon).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    const types = beacons.flatMap((b) => b.events.map((e) => e.type));
    expect(types).toEqual(["exposure_started", "exposure_ended"]);
    const ended = beacons[0]!.events[1]!;
    expect(ended.metadata).toMatchObject({ reason: "exit", activeMs: 3000 });
    tracker.stop();
  });

  it("includes the pause logged on tab hide in the hide flush, and resumes on show", async () => {
    const { tracker, doc, beacons, tick } = make();
    tracker.start();
    await tracker.ready();
    tracker.timing.beginNavigation("walk");
    tick(1000);
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(beacons.flatMap((b) => b.events.map((e) => e.type))).toEqual(["navigation_started", "timing_paused"]);
    tick(5000);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    tick(1000);
    tracker.timing.end();
    await vi.advanceTimersByTimeAsync(0);
    await tracker.flush();
    const ended = (await tracker.getDeadLetters()).length;
    expect(ended).toBe(0);
    expect(tracker.timing.totals()).toMatchObject({ navigationMs: 2000, pausedMs: 5000 });
    tracker.stop();
  });

  it("pauses on window blur and resumes on focus", async () => {
    const { tracker, win, tick } = make();
    tracker.start();
    await tracker.ready();
    tracker.timing.beginExposure(C2, "science");
    win.dispatchEvent(new Event("blur"));
    tick(400);
    expect(tracker.timing.paused()).toBe(true);
    win.dispatchEvent(new Event("focus"));
    tick(600);
    expect(tracker.timing.totals()).toMatchObject({ exposureMs: 600, pausedMs: 400 });
    tracker.stop();
  });
});
