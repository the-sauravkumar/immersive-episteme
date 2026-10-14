/**
 * Client telemetry tracker: seq numbering, persistence, batching, retry/backoff, dead letters
 * (never silent loss) and the page-exit flush.
 */
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryOutbox, createTelemetryTracker, type TelemetryTrackerOptions } from "@/features/telemetry/client";

import { SESSION, fakeFetch, type Reply } from "./helpers";

const CONCEPT = "0190f0a0-0000-7000-8000-0000000000aa";

function make(replies: Reply[] = [], opts: Partial<TelemetryTrackerOptions> = {}) {
  const fetch = fakeFetch(replies);
  const outbox = (opts.storage as MemoryOutbox | undefined) ?? new MemoryOutbox();
  const tracker = createTelemetryTracker({
    sessionId: SESSION,
    contentVersion: "review-abc",
    appBuild: "test-build",
    mode: "study",
    storage: outbox,
    fetchImpl: fetch.impl,
    sendBeacon: null,
    random: () => 1,
    lifecycle: false,
    batchSize: 50,
    ...opts,
  });
  return { tracker, fetch, outbox };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("telemetry tracker", () => {
  it("numbers events monotonically and resumes the sequence after a reload", async () => {
    const { tracker, outbox } = make([500, 500, 500]);
    const a = await tracker.pageEntered({ roomOrPageId: "p1" });
    const b = await tracker.conceptEncountered({ conceptId: CONCEPT, metadata: { mode: "seen" } });
    const c = await tracker.track("page_exited", { metadata: { dwellMs: 1200 } });
    expect([a?.seq, b?.seq, c?.seq]).toEqual([0, 1, 2]);
    expect(a).toMatchObject({ schemaVersion: 1, sessionId: SESSION, type: "page_entered" });
    expect(a?.clientTs).toMatch(/Z$/);
    tracker.dispose();

    // "Reload": a new tracker on the same store continues at 3, with the 3 events still pending.
    const { tracker: again } = make([], { storage: outbox });
    await again.ready();
    expect(again.getStats().pending).toBe(3);
    expect((await again.sessionStarted())?.seq).toBe(3);

    // Even when every stored event was acknowledged, the persisted next seq is kept.
    await again.flush();
    expect(again.getStats().pending).toBe(0);
    const { tracker: third } = make([], { storage: outbox });
    expect((await third.sessionResumed({ metadata: { gapMs: 10 } }))?.seq).toBe(4);
  });

  it("uploads a batch as soon as batchSize events are stored", async () => {
    const { tracker, fetch } = make([], { batchSize: 3 });
    await tracker.pageEntered();
    await tracker.pageEntered();
    expect(fetch.calls).toHaveLength(0);
    await tracker.pageEntered();
    await tracker.flush();
    expect(fetch.calls).toHaveLength(1);
    const batch = fetch.calls[0]!.batch;
    expect(batch.events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(batch).toMatchObject({ sessionId: SESSION, schemaVersion: 1, appBuild: "test-build", contentVersion: "review-abc" });
    expect(batch.idempotencyKey).toBe(`b:${SESSION}:0-2`);
    expect(tracker.getStats()).toMatchObject({ acked: 3, pending: 0, persisted: true, nonExperimental: false });
  });

  it("uploads on the flush interval", async () => {
    const { tracker, fetch } = make([], { flushIntervalMs: 5000 });
    tracker.start();
    await tracker.taskStarted({ metadata: { taskCode: "explore" } });
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetch.calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch.calls).toHaveLength(1);
    tracker.stop();
  });

  it("retries 5xx and network errors with backoff, re-using the idempotency key, and keeps the outbox", async () => {
    const { tracker, fetch, outbox } = make([500, "network", 200], { baseRetryDelayMs: 1000 });
    await tracker.pageEntered();
    await tracker.pageExited();
    await tracker.flush();
    expect(fetch.calls).toHaveLength(1);
    expect(await outbox.list(SESSION)).toHaveLength(2); // failure never clears the outbox
    expect(tracker.getStats()).toMatchObject({ retries: 1, pending: 2, dropped: 0, lastError: { code: "server_error", status: 500 } });

    await vi.advanceTimersByTimeAsync(999);
    expect(fetch.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // 1st retry after 1000 ms -> network error
    expect(fetch.calls).toHaveLength(2);
    expect(tracker.getStats().lastError?.code).toBe("network_error");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); // 2nd retry after 2000 ms -> success
    expect(fetch.calls).toHaveLength(3);
    expect(new Set(fetch.calls.map((c) => c.batch.idempotencyKey)).size).toBe(1);
    expect(new Set(fetch.calls.map((c) => c.batch.events[0]!.eventId)).size).toBe(1);
    expect(tracker.getStats()).toMatchObject({ retries: 2, acked: 2, pending: 0 });
    expect(await outbox.list(SESSION)).toHaveLength(0);
  });

  it("honours Retry-After on 429", async () => {
    const { tracker, fetch } = make([{ status: 429, body: { error: "rate_limited" }, headers: { "retry-after": "7" } }, 200]);
    await tracker.pageEntered();
    await tracker.flush();
    await vi.advanceTimersByTimeAsync(6999);
    expect(fetch.calls).toHaveLength(1);
    await tracker.flush(); // an explicit flush during the backoff does not jump the queue
    expect(fetch.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch.calls).toHaveLength(2);
    expect(tracker.getStats()).toMatchObject({ acked: 1, retries: 1 });
  });

  it("moves refused batches to the dead-letter list and counts them (no silent loss)", async () => {
    const onDrop = vi.fn();
    const { tracker, outbox } = make([{ status: 400, body: { error: "invalid_batch", message: "bad" } }], { onDrop });
    await tracker.pageEntered();
    await tracker.pageExited();
    await tracker.flush();
    expect(tracker.getStats()).toMatchObject({ dropped: 2, pending: 0, acked: 0, lastError: { code: "invalid_batch", status: 400 } });
    expect(onDrop).toHaveBeenCalledWith({ reason: "invalid_batch", status: 400, count: 2 });
    const dead = await tracker.getDeadLetters();
    expect(dead.map((d) => [d.event.seq, d.reason, d.status])).toEqual([
      [0, "invalid_batch", 400],
      [1, "invalid_batch", 400],
    ]);
    expect(await outbox.listDeadLetters(SESSION)).toHaveLength(2);
  });

  it("halves the batch on 413 before giving up", async () => {
    const { tracker, fetch } = make([{ status: 413, body: { error: "payload_too_large" } }]);
    for (let i = 0; i < 4; i++) await tracker.pageEntered();
    await tracker.flush();
    expect(fetch.calls.map((c) => c.batch.events.length)).toEqual([4, 2, 2]);
    expect(tracker.getStats()).toMatchObject({ acked: 4, dropped: 0 });
  });

  it("counts an invalid event without consuming a seq", async () => {
    const onDrop = vi.fn();
    const { tracker } = make([], { onDrop });
    // Bypass the compile-time check to simulate a bad runtime value.
    const bad = await (tracker.track as (t: string, f: unknown) => Promise<unknown>)("relationship_followed", { metadata: { relationshipId: "nope" } });
    expect(bad).toBeNull();
    expect(tracker.getStats()).toMatchObject({ invalid: 1, enqueued: 0, pending: 0 });
    expect(onDrop.mock.calls[0]![0]).toMatchObject({ reason: "invalid_event", count: 1 });
    const ok = await tracker.relationshipFollowed({
      metadata: { relationshipId: randomUUID(), relationshipTypeCode: "PRECEDES", direction: "forward" },
    });
    expect(ok?.seq).toBe(0);
  });

  it("rejects wrong metadata keys at compile time", () => {
    const { tracker } = make();
    const typecheckOnly = () => {
      // @ts-expect-error -- `email` is not an allowed metadata key of page_entered
      void tracker.pageEntered({ metadata: { email: "x" } });
      // @ts-expect-error -- knowledge_layer_selected requires metadata.layer
      void tracker.knowledgeLayerSelected();
      void tracker.knowledgeLayerSelected({ metadata: { layer: "science" } });
    };
    expect(typecheckOnly).toBeTypeOf("function");
  });

  describe("page exit", () => {
    function lifecycle() {
      const win = new EventTarget();
      const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
      return { win, doc };
    }

    it("sends pending events with sendBeacon on pagehide and keeps them until acknowledged", async () => {
      const { win, doc } = lifecycle();
      const beacon = vi.fn((_url: string, _data: Blob) => true);
      const { tracker, fetch } = make([], { sendBeacon: beacon, lifecycle: { window: win, document: doc } });
      tracker.start();
      await tracker.pageEntered();
      await tracker.pageExited();
      win.dispatchEvent(new Event("pagehide"));
      expect(beacon).toHaveBeenCalledTimes(1);
      const [url, blob] = beacon.mock.calls[0]!;
      expect(url).toBe("/api/telemetry/batch");
      expect(blob.type).toBe("application/json");
      const sent = JSON.parse(await blob.text());
      expect(sent.events).toHaveLength(2);
      expect(tracker.getStats()).toMatchObject({ beaconed: 2, pending: 2 });
      // The next normal upload re-sends with the same idempotency key; the server dedups.
      await tracker.flush();
      expect(fetch.calls[0]!.batch.idempotencyKey).toBe(sent.idempotencyKey);
      expect(tracker.getStats().pending).toBe(0);
      tracker.stop();
    });

    it("falls back to fetch keepalive when the beacon is refused, on visibilitychange to hidden", async () => {
      const { win, doc } = lifecycle();
      const beacon = vi.fn(() => false);
      const { tracker, fetch } = make([], { sendBeacon: beacon, lifecycle: { window: win, document: doc } });
      tracker.start();
      await tracker.pageEntered();
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      expect(beacon).toHaveBeenCalledTimes(1);
      expect(fetch.calls).toHaveLength(1);
      expect(fetch.calls[0]!.init.keepalive).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      // page_entered plus the timing_paused that hiding the tab logs (staged before the flush).
      expect(tracker.getStats()).toMatchObject({ acked: 2, pending: 0 });
      tracker.stop();
    });

    it("uses keepalive fetch when sendBeacon is unavailable", async () => {
      const { win, doc } = lifecycle();
      const { tracker, fetch } = make([], { sendBeacon: null, lifecycle: { window: win, document: doc } });
      tracker.start();
      await tracker.pageEntered();
      win.dispatchEvent(new Event("pagehide"));
      expect(fetch.calls[0]!.init.keepalive).toBe(true);
      tracker.stop();
    });
  });
});
