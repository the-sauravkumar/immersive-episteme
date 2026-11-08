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

type TelemetryMode = "study" | "demo" | "preview";

const BEACON_MAX_BYTES = 60 * 1024;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
const DEFAULT_BASE_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_AFTER_MS = 10 * 60_000;

interface TelemetryDrop {
  reason: string;
  status: number | null;
  count: number;
  issues?: string[];
}

interface TelemetryErrorInfo {
  code: string;
  status: number | null;
  at: string;
}

export interface TelemetryStats {
  storage: OutboxKind | null;
  enqueued: number;
  sent: number;
  beaconed: number;
  acked: number;
  duplicates: number;
  quarantined: number;
  retries: number;
  dropped: number;
  invalid: number;
  storageErrors: number;
  pending: number;
  lastError: TelemetryErrorInfo | null;
  gaps: { fromSeq: number; toSeq: number }[];
  persisted: boolean | null;
  nonExperimental: boolean | null;
}

export interface TelemetryTrackerOptions {
  sessionId: string;
  contentVersion: string;
  appBuild: string;
  mode: TelemetryMode;
  endpoint?: string;
  storage?: Outbox | Promise<Outbox>;
  firstSeq?: number;
  handoff?: SeqHandoff;
  seqMark?: SeqMark | null;
  fetchImpl?: typeof fetch;
  sendBeacon?: ((url: string, data: Blob) => boolean) | null;
  now?: () => number;
  monotonicNow?: () => number;
  random?: () => number;
  uuid?: () => string;
  batchSize?: number;
  flushIntervalMs?: number;
  baseRetryDelayMs?: number;
  maxRetryDelayMs?: number;
  lifecycle?: { window?: EventTarget | null; document?: (EventTarget & { visibilityState?: string }) | null } | false;
  onDrop?: (drop: TelemetryDrop) => void;
  onError?: (error: TelemetryErrorInfo) => void;
}

export interface TelemetryTracker extends EventHelpers {
  readonly sessionId: string;
  readonly mode: TelemetryMode;
  track: TrackFn;
  timing: TimeAccountant;
  start(): void;
  stop(): void;
  dispose(): void;
  flush(): Promise<void>;
  flushNow(opts?: { deadlineMs?: number }): Promise<{ pending: number }>;
  flushOnExit(): void;
  getStats(): TelemetryStats;
  subscribe(listener: (stats: TelemetryStats) => void): () => void;
  getDeadLetters(): Promise<DeadLetter[]>;
  ready(): Promise<void>;
}

const RETRYABLE = (status: number) => status === 408 || status === 429 || status >= 500;

function fnv1a64(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export function batchIdempotencyKey(sessionId: string, events: readonly TelemetryEvent[]): string {
  const ids = events.map((e) => e.eventId).join(",");
  return `b:${sessionId}:${events[0]!.seq}-${events[events.length - 1]!.seq}:${fnv1a64(ids)}`;
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

export type SeqHandoff = Map<string, { nextSeq: number; writes: Promise<unknown> }>;
export const createSeqHandoff = (): SeqHandoff => new Map();

export interface SeqMark {
  get(sessionId: string): number | null;
  set(sessionId: string, nextSeq: number): void;
}

function localStorageSeqMark(): SeqMark | null {
  let ls: Storage;
  try {
    ls = globalThis.localStorage;
    if (!ls) return null;
  } catch {
    return null;
  }
  const key = (s: string) => `ie-telemetry:v1:${s}:mark`;
  return {
    get(s) {
      try {
        const n = Number(ls.getItem(key(s)));
        return Number.isInteger(n) && n > 0 ? n : null;
      } catch {
        return null;
      }
    },
    set(s, n) {
      try {
        ls.setItem(key(s), String(n));
      } catch {
      }
    },
  };
}
const pageHandoff: SeqHandoff = createSeqHandoff();

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

  const handoff = options.handoff ?? (options.storage === undefined ? pageHandoff : null);
  const seqMark = options.seqMark !== undefined ? options.seqMark : options.storage === undefined ? localStorageSeqMark() : null;
  const handoffEntry = () => {
    let h = handoff?.get(sessionId);
    if (handoff && !h) handoff.set(sessionId, (h = { nextSeq: 0, writes: Promise.resolve() }));
    return h;
  };
  let outbox: Outbox | null = null;
  let initPromise: Promise<void> | null = null;
  let initDone = false;
  let waiting = 0;
  let nextSeq = 0;
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
        const prior = handoffEntry();
        await prior?.writes.catch(() => undefined);
        nextSeq = Math.max(nextSeq, options.firstSeq ?? 0, prior?.nextSeq ?? 0, seqMark?.get(sessionId) ?? 0);
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
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      update({ invalid: stats.invalid + 1 });
      options.onDrop?.({ reason: "invalid_event", status: null, count: 1, issues });
      return null;
    }
    const event = parsed.data;
    nextSeq = event.seq + 1;
    const h = handoffEntry();
    if (h) h.nextSeq = Math.max(h.nextSeq, nextSeq);
    seqMark?.set(sessionId, nextSeq);
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
      const h = handoffEntry();
      if (h) h.writes = chain;
      return chain.then(() => event);
    }
    waiting++;
    const ready = init();
    const p = chain.then(async () => {
      await ready;
      waiting--;
      const event = stage(type, fields, clientTs, mono);
      if (event) await persist(event, nextSeq);
      return event;
    });
    chain = p.catch(() => undefined);
    const h = handoffEntry();
    if (h) h.writes = chain;
    return p;
  };

  const track: TrackFn = (type, ...args) => {
    if (isTimingEventType(type)) {
      update({ invalid: stats.invalid + 1 });
      options.onDrop?.({ reason: "invalid_event", status: null, count: 1, issues: [`${type} is emitted only by tracker.timing`] });
      return Promise.resolve(null);
    }
    return rawTrack(type, ...args);
  };

  const intervalPrefix = uuid().replace(/-/g, "").slice(0, 10);
  let intervalCounter = 0;
  const timing = createTimeAccountant({ track: rawTrack, monotonicNow, newId: () => `iv-${intervalPrefix}-${(intervalCounter++).toString(36)}` });

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

  async function flushNow({ deadlineMs = 8_000 }: { deadlineMs?: number } = {}): Promise<{ pending: number }> {
    const until = now() + deadlineMs;
    attempt = 0;
    nextAttemptAt = 0;
    for (;;) {
      await flush();
      if (pending.size === 0) return { pending: 0 };
      const wait = Math.max(0, nextAttemptAt - now());
      if (now() + wait >= until) return { pending: pending.size };
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

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
      if (new Blob([body]).size > BEACON_MAX_BYTES) return;
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
    if (doc?.visibilityState === "hidden") timing.pause("hidden");
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
    flushNow,
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
