/**
 * Client telemetry tracker (framework-agnostic). One tracker per study/demo session.
 *
 * Guarantees (the virtual-walkthrough tracker cleared its outbox on a failed upload and lost
 * events silently; this one never does):
 *  - every event gets the next per-session `seq`; the next seq is persisted with the event, so
 *    numbering continues after a reload (resume = max(stored next seq, max stored seq + 1));
 *  - every event is validated with `telemetryEventSchema` and written to the persistent outbox
 *    BEFORE any upload; an invalid event is counted (`stats.invalid`) and reported (`onDrop`);
 *  - events leave the outbox only after a 2xx response that parses as
 *    `telemetryIngestResponseSchema`, or after a final (non-retryable) refusal, in which case
 *    they are moved to the persisted dead-letter list and counted in `stats.dropped`;
 *  - network errors, 408, 429 (Retry-After honoured) and 5xx are retried with exponential
 *    backoff and jitter, re-using the batch's idempotency key; 413 halves the batch first;
 *  - on `pagehide` / `visibilitychange` to hidden the pending events are sent with
 *    `navigator.sendBeacon` (or `fetch(..., { keepalive: true })`). Those sends are
 *    fire-and-forget: the events stay in the outbox until a normal upload is acknowledged
 *    (the server deduplicates by idempotency key and eventId).
 *
 * Seq starts at 0 for a new session. Demo and preview sessions use the same path (the server
 * answers `persisted: false, nonExperimental: true`).
 */
import {
  MAX_EVENTS_PER_BATCH,
  TELEMETRY_BATCH_ENDPOINT,
  TELEMETRY_SCHEMA_VERSION,
  telemetryEventSchema,
  telemetryIngestResponseSchema,
  type EventTypeCode,
  type TelemetryEvent,
  type TelemetryIngestResponse,
} from "@/features/telemetry/contracts";

import { createEventHelpers, isTimingEventType, type EventHelpers, type RawTrackFn, type TrackFields, type TrackFn } from "./events";
import { createTimeAccountant, type TimeAccountant } from "./timing";
import { openDefaultOutbox, type DeadLetter, type Outbox, type OutboxKind } from "./outbox";

export type TelemetryMode = "study" | "demo" | "preview";

/** Largest beacon / keepalive body we attempt (browsers cap both at about 64 KiB). */
export const BEACON_MAX_BYTES = 60 * 1024;
export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
export const DEFAULT_BASE_RETRY_DELAY_MS = 1_000;
export const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
/** Upper bound for a server-requested Retry-After. */
export const MAX_RETRY_AFTER_MS = 10 * 60_000;

export interface TelemetryDrop {
  reason: string;
  status: number | null;
  count: number;
  /** Present for invalid events (client-side validation messages). */
  issues?: string[];
}

export interface TelemetryErrorInfo {
  code: string;
  status: number | null;
  at: string;
}

export interface TelemetryStats {
  storage: OutboxKind | null;
  /** Events validated and stored. */
  enqueued: number;
  /** Event transmissions in normal uploads (a retried event counts again). */
  sent: number;
  /** Event transmissions via sendBeacon / keepalive on page exit. */
  beaconed: number;
  /** Events acknowledged by the server (accepted + duplicates + quarantined). */
  acked: number;
  duplicates: number;
  quarantined: number;
  /** Upload attempts that failed retryably. */
  retries: number;
  /** Events given up on after a final refusal (kept in the dead-letter list). */
  dropped: number;
  /** Events refused by client-side validation (never stored). */
  invalid: number;
  /** Outbox writes that failed (events then kept in memory only). */
  storageErrors: number;
  /** Events stored and not yet acknowledged. */
  pending: number;
  lastError: TelemetryErrorInfo | null;
  /** Missing seq ranges reported by the server after the last acknowledged batch. */
  gaps: { fromSeq: number; toSeq: number }[];
  /** From the last acknowledged batch. */
  persisted: boolean | null;
  nonExperimental: boolean | null;
}

export interface TelemetryTrackerOptions {
  sessionId: string;
  contentVersion: string;
  appBuild: string;
  mode: TelemetryMode;
  endpoint?: string;
  /** Defaults to `openDefaultOutbox()` (IndexedDB, localStorage, memory). */
  storage?: Outbox | Promise<Outbox>;
  fetchImpl?: typeof fetch;
  /** Defaults to `navigator.sendBeacon` when present; `null` disables beacons. */
  sendBeacon?: ((url: string, data: Blob) => boolean) | null;
  /** Epoch milliseconds (default Date.now). */
  now?: () => number;
  /** Monotonic milliseconds for `clientMonoMs` (default performance.now). */
  monotonicNow?: () => number;
  /** [0, 1) for retry jitter (default Math.random). */
  random?: () => number;
  uuid?: () => string;
  batchSize?: number;
  flushIntervalMs?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  /** Page lifecycle sources; defaults to `window` / `document`; `false` disables the listeners. */
  lifecycle?: { window?: EventTarget | null; document?: (EventTarget & { visibilityState?: string }) | null } | false;
  onDrop?: (drop: TelemetryDrop) => void;
  onError?: (error: TelemetryErrorInfo) => void;
}

export interface TelemetryTracker extends EventHelpers {
  readonly sessionId: string;
  readonly mode: TelemetryMode;
  track: TrackFn;
  /**
   * Content-exposure / navigation intervals (./timing.ts). The only way to emit interval events;
   * paused on tab hide and window blur (resumed on show / focus), ended on pagehide and dispose;
   * pause it yourself while a non-content modal is open (`usePauseWhile`).
   */
  timing: TimeAccountant;
  /** Starts timers and lifecycle listeners (idempotent; restartable after stop()). */
  start(): void;
  /** Stops timers and listeners; stored events stay in the outbox. */
  stop(): void;
  /** stop() and refuse further tracking. */
  dispose(): void;
  /** Uploads everything that can be sent now (respects an active backoff). */
  flush(): Promise<void>;
  /** Synchronous exit flush via sendBeacon / keepalive (what pagehide triggers). */
  flushOnExit(): void;
  getStats(): TelemetryStats;
  subscribe(listener: (stats: TelemetryStats) => void): () => void;
  getDeadLetters(): Promise<DeadLetter[]>;
  /** Resolves once the outbox is open and the seq counter restored. */
  ready(): Promise<void>;
}

const RETRYABLE = (status: number) => status === 408 || status === 429 || status >= 500;

/** Stable idempotency key of a batch: same events (seq range) => same key. */
export function batchIdempotencyKey(sessionId: string, events: readonly TelemetryEvent[]): string {
  return `b:${sessionId}:${events[0]!.seq}-${events[events.length - 1]!.seq}`;
}

function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - nowMs);
}

type SendOutcome =
  | { kind: "ack"; response: TelemetryIngestResponse }
  | { kind: "retry"; code: string; status: number | null; retryAfterMs: number | null }
  | { kind: "too_large" }
  | { kind: "final"; code: string; status: number };

export function createTelemetryTracker(options: TelemetryTrackerOptions): TelemetryTracker {
  const {
    sessionId,
    contentVersion,
    appBuild,
    mode,
    endpoint = TELEMETRY_BATCH_ENDPOINT,
    now = () => Date.now(),
    monotonicNow = () => globalThis.performance?.now() ?? 0,
    random = Math.random,
    uuid = () => globalThis.crypto.randomUUID(),
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    baseRetryDelayMs = DEFAULT_BASE_RETRY_DELAY_MS,
    maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  } = options;
  const batchSize = Math.max(1, Math.min(options.batchSize ?? DEFAULT_BATCH_SIZE, MAX_EVENTS_PER_BATCH));
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((...a) => globalThis.fetch(...a));
  const beacon =
    options.sendBeacon === undefined
      ? typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? (url: string, data: Blob) => navigator.sendBeacon(url, data)
        : null
      : options.sendBeacon;

  let outbox: Outbox | null = null;
  let initPromise: Promise<void> | null = null;
  /** True once the outbox is open and the seq counter restored: events can then be staged synchronously. */
  let initDone = false;
  /** Track calls waiting in `chain` for init (their seqs are not assigned yet). */
  let waiting = 0;
  let nextSeq = 0;
  /** In-memory mirror of the outbox (lets the exit flush run synchronously). */
  const pending = new Map<number, TelemetryEvent>();
  let chain: Promise<unknown> = Promise.resolve();
  let disposed = false;
  let started = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let detach: (() => void) | null = null;
  let attempt = 0;
  let nextAttemptAt = 0;
  let limit = batchSize;
  let draining: Promise<void> | null = null;
  let drainAgain = false;

  let stats: TelemetryStats = {
    storage: null,
    enqueued: 0,
    sent: 0,
    beaconed: 0,
    acked: 0,
    duplicates: 0,
    quarantined: 0,
    retries: 0,
    dropped: 0,
    invalid: 0,
    storageErrors: 0,
    pending: 0,
    lastError: null,
    gaps: [],
    persisted: null,
    nonExperimental: null,
  };
  const listeners = new Set<(s: TelemetryStats) => void>();
  const update = (patch: Partial<TelemetryStats>) => {
    stats = { ...stats, ...patch, pending: pending.size };
    for (const l of listeners) l(stats);
  };
  const fail = (code: string, status: number | null) => {
    const info = { code, status, at: new Date(now()).toISOString() };
    update({ lastError: info });
    options.onError?.(info);
  };

  function init(): Promise<void> {
    initPromise ??= (async () => {
      try {
        outbox = await (options.storage ?? openDefaultOutbox());
        const stored = await outbox.list(sessionId);
        for (const e of stored) pending.set(e.seq, e);
        const persistedNext = (await outbox.getNextSeq(sessionId)) ?? 0;
        const maxStored = stored.length ? stored[stored.length - 1]!.seq + 1 : 0;
        nextSeq = Math.max(nextSeq, persistedNext, maxStored);
        update({ storage: outbox.kind });
      } catch {
        update({ storageErrors: stats.storageErrors + 1 });
        fail("storage_unavailable", null);
      } finally {
        initDone = true;
      }
    })();
    return initPromise;
  }

  /**
   * Validates the event, assigns the next seq and puts it in the in-memory queue SYNCHRONOUSLY,
   * so an event tracked inside a pagehide / visibilitychange handler is part of the exit flush
   * that runs right after it. The outbox write follows asynchronously (in order, via `chain`).
   */
  function stage(type: EventTypeCode, fields: TrackFields<EventTypeCode> | undefined, clientTs: string, mono: number): TelemetryEvent | null {
    const { metadata, ...context } = (fields ?? {}) as TrackFields<EventTypeCode> & { metadata?: Record<string, unknown> };
    const candidate = {
      eventId: uuid(),
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      sessionId,
      seq: nextSeq,
      type,
      clientTs,
      clientMonoMs: Math.max(0, mono),
      ...Object.fromEntries(Object.entries(context).filter(([, v]) => v !== undefined)),
      metadata: metadata ?? {},
    };
    const parsed = telemetryEventSchema.safeParse(candidate);
    if (!parsed.success) {
      // The seq is not consumed, so an invalid event never shows up as a server-side gap.
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      update({ invalid: stats.invalid + 1 });
      options.onDrop?.({ reason: "invalid_event", status: null, count: 1, issues });
      return null;
    }
    const event = parsed.data;
    nextSeq = event.seq + 1;
    pending.set(event.seq, event);
    update({ enqueued: stats.enqueued + 1 });
    return event;
  }

  async function persist(event: TelemetryEvent, seqAfter: number) {
    try {
      if (!outbox) throw new Error("no outbox");
      await outbox.append(sessionId, [event], seqAfter);
    } catch {
      update({ storageErrors: stats.storageErrors + 1 });
      fail("storage_write_failed", null);
    }
    if (pending.size >= batchSize) void flush();
  }

  const rawTrack: RawTrackFn = (type, ...args) => {
    if (disposed) return Promise.resolve(null);
    const clientTs = new Date(now()).toISOString();
    const mono = monotonicNow();
    const fields = args[0] as TrackFields<EventTypeCode> | undefined;
    if (initDone && waiting === 0) {
      const event = stage(type, fields, clientTs, mono);
      if (!event) return Promise.resolve(null);
      const seqAfter = nextSeq;
      chain = chain.then(() => persist(event, seqAfter)).catch(() => undefined);
      return chain.then(() => event);
    }
    waiting++;
    const p = chain.then(async () => {
      await init();
      waiting--;
      const event = stage(type, fields, clientTs, mono);
      if (event) await persist(event, nextSeq);
      return event;
    });
    chain = p.catch(() => undefined);
    return p;
  };

  /** Public entry point: interval (timing) events are reserved for the time accountant. */
  const track: TrackFn = (type, ...args) => {
    if (isTimingEventType(type)) {
      update({ invalid: stats.invalid + 1 });
      options.onDrop?.({ reason: "invalid_event", status: null, count: 1, issues: [`${type} is emitted only by tracker.timing`] });
      return Promise.resolve(null);
    }
    return rawTrack(type, ...args);
  };

  const timing = createTimeAccountant({ track: rawTrack, monotonicNow });

  function takeBatch(max: number): TelemetryEvent[] {
    return [...pending.keys()]
      .sort((a, b) => a - b)
      .slice(0, max)
      .map((s) => pending.get(s)!);
  }

  function payloadOf(events: readonly TelemetryEvent[]) {
    return JSON.stringify({
      idempotencyKey: batchIdempotencyKey(sessionId, events),
      sessionId,
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      appBuild,
      contentVersion,
      clientSentAt: new Date(now()).toISOString(),
      events,
    });
  }

  async function removeEvents(events: readonly TelemetryEvent[]) {
    const seqs = events.map((e) => e.seq);
    for (const s of seqs) pending.delete(s);
    try {
      await outbox?.remove(sessionId, seqs);
    } catch {
      update({ storageErrors: stats.storageErrors + 1 });
    }
  }

  async function acknowledge(events: readonly TelemetryEvent[], response: TelemetryIngestResponse) {
    const live = events.filter((e) => pending.has(e.seq));
    await removeEvents(live);
    update({
      acked: stats.acked + live.length,
      duplicates: stats.duplicates + response.duplicates,
      quarantined: stats.quarantined + response.quarantined,
      gaps: response.gaps,
      persisted: response.persisted,
      nonExperimental: response.nonExperimental,
    });
  }

  async function send(events: readonly TelemetryEvent[], init?: RequestInit): Promise<SendOutcome> {
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: payloadOf(events),
        ...init,
      });
    } catch {
      return { kind: "retry", code: "network_error", status: null, retryAfterMs: null };
    }
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const parsed = telemetryIngestResponseSchema.safeParse(body);
      return parsed.success
        ? { kind: "ack", response: parsed.data }
        : { kind: "retry", code: "invalid_response", status: res.status, retryAfterMs: null };
    }
    if (res.status === 413) return { kind: "too_large" };
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const code = typeof body?.error === "string" ? body.error : `http_${res.status}`;
    if (RETRYABLE(res.status)) {
      return { kind: "retry", code, status: res.status, retryAfterMs: res.status === 429 ? parseRetryAfter(res.headers.get("retry-after"), now()) : null };
    }
    return { kind: "final", code, status: res.status };
  }

  async function deadLetter(events: readonly TelemetryEvent[], reason: string, status: number | null) {
    const at = new Date(now()).toISOString();
    try {
      await outbox?.addDeadLetters(sessionId, events.map((event) => ({ event, reason, status, at })));
    } catch {
      update({ storageErrors: stats.storageErrors + 1 });
    }
    await removeEvents(events);
    update({ dropped: stats.dropped + events.length });
    fail(reason, status);
    options.onDrop?.({ reason, status, count: events.length });
  }

  function scheduleRetry(delay: number) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flush();
    }, Math.max(0, delay));
  }

  async function drain() {
    await init();
    for (;;) {
      const wait = nextAttemptAt - now();
      if (wait > 0) {
        scheduleRetry(wait);
        return;
      }
      const events = takeBatch(limit);
      if (events.length === 0) return;
      update({ sent: stats.sent + events.length });
      const outcome = await send(events);
      switch (outcome.kind) {
        case "ack":
          attempt = 0;
          nextAttemptAt = 0;
          limit = batchSize;
          await acknowledge(events, outcome.response);
          break;
        case "too_large":
          if (events.length > 1) {
            limit = Math.ceil(events.length / 2);
            break;
          }
          limit = batchSize;
          await deadLetter(events, "payload_too_large", 413);
          break;
        case "final":
          await deadLetter(events, outcome.code, outcome.status);
          break;
        case "retry": {
          attempt++;
          const backoff = Math.min(maxRetryDelayMs, baseRetryDelayMs * 2 ** (attempt - 1));
          const delay =
            outcome.retryAfterMs !== null ? Math.min(outcome.retryAfterMs, MAX_RETRY_AFTER_MS) : Math.round(backoff * (0.5 + random() * 0.5));
          nextAttemptAt = now() + delay;
          update({ retries: stats.retries + 1 });
          fail(outcome.code, outcome.status);
          scheduleRetry(delay);
          return;
        }
      }
    }
  }

  function flush(): Promise<void> {
    if (draining) {
      drainAgain = true;
      return draining;
    }
    draining = (async () => {
      try {
        do {
          drainAgain = false;
          await chain;
          await drain();
        } while (drainAgain);
      } finally {
        draining = null;
      }
    })();
    return draining;
  }

  /**
   * Synchronous exit flush: every event already staged (including intervals closed by the
   * pagehide / hide handler just before) goes out in successive beacons (fallback: keepalive
   * fetch), oldest first, until the queue is sent or the browser refuses a beacon. The events
   * stay in the outbox until a normal upload is acknowledged (server dedups by eventId).
   */
  function flushOnExit() {
    const queue = takeBatch(pending.size);
    let i = 0;
    while (i < queue.length) {
      let events = queue.slice(i, i + batchSize);
      let body = payloadOf(events);
      while (new Blob([body]).size > BEACON_MAX_BYTES && events.length > 1) {
        events = events.slice(0, Math.ceil(events.length / 2));
        body = payloadOf(events);
      }
      if (new Blob([body]).size > BEACON_MAX_BYTES) return; // a normal upload will carry it
      i += events.length;
      let beaconed = false;
      if (beacon) {
        try {
          beaconed = beacon(endpoint, new Blob([body], { type: "application/json" }));
        } catch {
          beaconed = false;
        }
      }
      update({ beaconed: stats.beaconed + events.length });
      if (beaconed) continue;
      const sent = events;
      void send(sent, { keepalive: true, body })
        .then((outcome) => (outcome.kind === "ack" ? acknowledge(sent, outcome.response) : undefined))
        .catch(() => undefined);
    }
  }

  function attachLifecycle(): (() => void) | null {
    if (options.lifecycle === false) return null;
    const win = options.lifecycle?.window !== undefined ? options.lifecycle.window : typeof window !== "undefined" ? window : null;
    const doc = options.lifecycle?.document !== undefined ? options.lifecycle.document : typeof document !== "undefined" ? document : null;
    const onPageHide = () => {
      timing.end("exit");
      flushOnExit();
    };
    const onVisibility = () => {
      if (doc?.visibilityState === "hidden") {
        timing.pause("hidden");
        flushOnExit();
      } else {
        timing.resume("hidden");
        void flush();
      }
    };
    const onBlur = () => timing.pause("blur");
    const onFocus = () => timing.resume("blur");
    const onOnline = () => void flush();
    win?.addEventListener("pagehide", onPageHide);
    win?.addEventListener("online", onOnline);
    win?.addEventListener("blur", onBlur);
    win?.addEventListener("focus", onFocus);
    doc?.addEventListener("visibilitychange", onVisibility);
    return () => {
      win?.removeEventListener("pagehide", onPageHide);
      win?.removeEventListener("online", onOnline);
      win?.removeEventListener("blur", onBlur);
      win?.removeEventListener("focus", onFocus);
      doc?.removeEventListener("visibilitychange", onVisibility);
    };
  }

  function start() {
    if (disposed || started) return;
    started = true;
    void init().then(() => (pending.size > 0 ? flush() : undefined));
    interval = setInterval(() => void flush(), flushIntervalMs);
    detach = attachLifecycle();
  }

  function stop() {
    started = false;
    if (interval) clearInterval(interval);
    if (retryTimer) clearTimeout(retryTimer);
    interval = null;
    retryTimer = null;
    detach?.();
    detach = null;
  }

  return {
    sessionId,
    mode,
    track,
    timing,
    ...createEventHelpers(track),
    start,
    stop,
    dispose() {
      timing.end("exit");
      stop();
      disposed = true;
    },
    flush,
    flushOnExit,
    getStats: () => stats,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async getDeadLetters() {
      await init();
      return outbox ? outbox.listDeadLetters(sessionId) : [];
    },
    ready: init,
  };
}
