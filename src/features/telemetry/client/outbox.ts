/**
 * Persistent telemetry outbox (client only). Events are written here BEFORE any upload and
 * removed only after the server acknowledged them (or after they were moved to the dead-letter
 * list, which is itself persisted and counted). Three implementations:
 *
 *  - IndexedDB (preferred): database `ie-telemetry` v1 with object stores
 *      `events`  keyPath [sessionId, seq]   { sessionId, seq, event }
 *      `meta`    keyPath sessionId          { sessionId, nextSeq }
 *      `dead`    autoIncrement, index `bySession` on sessionId   { sessionId, ...DeadLetter }
 *  - localStorage (fallback): keys `ie-telemetry:v1:<sessionId>:events` (JSON array),
 *      `…:next-seq` (number) and `…:dead` (JSON array);
 *  - memory (last resort: SSR, private mode with storage disabled). Not durable across reloads.
 *
 * `openDefaultOutbox()` picks the first that works. Client-safe: no Node APIs.
 */
import type { TelemetryEvent } from "@/features/telemetry/contracts";

export type OutboxKind = "indexeddb" | "localstorage" | "memory";

export interface DeadLetter {
  event: TelemetryEvent;
  /** Error code from the server body (e.g. `invalid_batch`), or `http_<status>`. */
  reason: string;
  status: number | null;
  /** ISO time the events were given up on. */
  at: string;
}

export interface Outbox {
  readonly kind: OutboxKind;
  /** Store events and the session's next seq atomically (where the backend allows). */
  append(sessionId: string, events: readonly TelemetryEvent[], nextSeq: number): Promise<void>;
  /** All stored (unacknowledged) events of the session, ascending seq. */
  list(sessionId: string): Promise<TelemetryEvent[]>;
  remove(sessionId: string, seqs: readonly number[]): Promise<void>;
  getNextSeq(sessionId: string): Promise<number | null>;
  addDeadLetters(sessionId: string, items: readonly DeadLetter[]): Promise<void>;
  listDeadLetters(sessionId: string): Promise<DeadLetter[]>;
}

const bySeq = (a: TelemetryEvent, b: TelemetryEvent) => a.seq - b.seq;

// ---------------------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------------------

export class MemoryOutbox implements Outbox {
  readonly kind: OutboxKind = "memory";
  private events = new Map<string, Map<number, TelemetryEvent>>();
  private next = new Map<string, number>();
  private dead = new Map<string, DeadLetter[]>();

  private bucket(sessionId: string) {
    let b = this.events.get(sessionId);
    if (!b) this.events.set(sessionId, (b = new Map()));
    return b;
  }
  async append(sessionId: string, events: readonly TelemetryEvent[], nextSeq: number) {
    const b = this.bucket(sessionId);
    for (const e of events) b.set(e.seq, e);
    this.next.set(sessionId, nextSeq);
  }
  async list(sessionId: string) {
    return [...this.bucket(sessionId).values()].sort(bySeq);
  }
  async remove(sessionId: string, seqs: readonly number[]) {
    const b = this.bucket(sessionId);
    for (const s of seqs) b.delete(s);
  }
  async getNextSeq(sessionId: string) {
    return this.next.get(sessionId) ?? null;
  }
  async addDeadLetters(sessionId: string, items: readonly DeadLetter[]) {
    this.dead.set(sessionId, [...(this.dead.get(sessionId) ?? []), ...items]);
  }
  async listDeadLetters(sessionId: string) {
    return [...(this.dead.get(sessionId) ?? [])];
  }
}

// ---------------------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------------------

export const LOCAL_STORAGE_PREFIX = "ie-telemetry:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export class LocalStorageOutbox implements Outbox {
  readonly kind: OutboxKind = "localstorage";
  constructor(private readonly storage: StorageLike) {}

  private key(sessionId: string, part: "events" | "next-seq" | "dead") {
    return `${LOCAL_STORAGE_PREFIX}:${sessionId}:${part}`;
  }
  private read<T>(key: string, fallback: T): T {
    const raw = this.storage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  async append(sessionId: string, events: readonly TelemetryEvent[], nextSeq: number) {
    const k = this.key(sessionId, "events");
    const existing = this.read<TelemetryEvent[]>(k, []);
    const seen = new Set(existing.map((e) => e.seq));
    const merged = [...existing, ...events.filter((e) => !seen.has(e.seq))].sort(bySeq);
    // setItem throws on quota errors: the tracker catches, counts and keeps the events in memory.
    this.storage.setItem(k, JSON.stringify(merged));
    this.storage.setItem(this.key(sessionId, "next-seq"), String(nextSeq));
  }
  async list(sessionId: string) {
    return this.read<TelemetryEvent[]>(this.key(sessionId, "events"), []).sort(bySeq);
  }
  async remove(sessionId: string, seqs: readonly number[]) {
    const k = this.key(sessionId, "events");
    const drop = new Set(seqs);
    const kept = this.read<TelemetryEvent[]>(k, []).filter((e) => !drop.has(e.seq));
    if (kept.length === 0) this.storage.removeItem(k);
    else this.storage.setItem(k, JSON.stringify(kept));
  }
  async getNextSeq(sessionId: string) {
    const raw = this.storage.getItem(this.key(sessionId, "next-seq"));
    const n = raw === null ? NaN : Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }
  async addDeadLetters(sessionId: string, items: readonly DeadLetter[]) {
    const k = this.key(sessionId, "dead");
    this.storage.setItem(k, JSON.stringify([...this.read<DeadLetter[]>(k, []), ...items]));
  }
  async listDeadLetters(sessionId: string) {
    return this.read<DeadLetter[]>(this.key(sessionId, "dead"), []);
  }
}

// ---------------------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------------------

export const IDB_NAME = "ie-telemetry";
export const IDB_VERSION = 1;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IndexedDbOutbox implements Outbox {
  readonly kind: OutboxKind = "indexeddb";
  private constructor(private readonly db: IDBDatabase) {}

  /** Opens (and creates) the database. Rejects when IndexedDB is unavailable or blocked. */
  static async open(factory: IDBFactory = globalThis.indexedDB, name = IDB_NAME): Promise<IndexedDbOutbox> {
    if (!factory) throw new Error("IndexedDB is not available");
    const req = factory.open(name, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("events")) db.createObjectStore("events", { keyPath: ["sessionId", "seq"] });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "sessionId" });
      if (!db.objectStoreNames.contains("dead")) {
        db.createObjectStore("dead", { keyPath: "id", autoIncrement: true }).createIndex("bySession", "sessionId");
      }
    };
    return new IndexedDbOutbox(await request(req));
  }

  private range(sessionId: string) {
    return IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
  }

  async append(sessionId: string, events: readonly TelemetryEvent[], nextSeq: number) {
    const tx = this.db.transaction(["events", "meta"], "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("events");
    for (const e of events) store.put({ sessionId, seq: e.seq, event: e });
    tx.objectStore("meta").put({ sessionId, nextSeq });
    await done;
  }
  async list(sessionId: string) {
    const tx = this.db.transaction("events", "readonly");
    const rows = await request(tx.objectStore("events").getAll(this.range(sessionId)));
    return (rows as { event: TelemetryEvent }[]).map((r) => r.event).sort(bySeq);
  }
  async remove(sessionId: string, seqs: readonly number[]) {
    if (seqs.length === 0) return;
    const tx = this.db.transaction("events", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("events");
    for (const s of seqs) store.delete([sessionId, s]);
    await done;
  }
  async getNextSeq(sessionId: string) {
    const tx = this.db.transaction("meta", "readonly");
    const row = (await request(tx.objectStore("meta").get(sessionId))) as { nextSeq?: number } | undefined;
    return typeof row?.nextSeq === "number" ? row.nextSeq : null;
  }
  async addDeadLetters(sessionId: string, items: readonly DeadLetter[]) {
    const tx = this.db.transaction("dead", "readwrite");
    const done = completed(tx);
    const store = tx.objectStore("dead");
    for (const d of items) store.add({ sessionId, ...d });
    await done;
  }
  async listDeadLetters(sessionId: string) {
    const tx = this.db.transaction("dead", "readonly");
    const rows = await request(tx.objectStore("dead").index("bySession").getAll(sessionId));
    return (rows as (DeadLetter & { sessionId: string; id: number })[]).map(({ event, reason, status, at }) => ({ event, reason, status, at }));
  }
  close() {
    this.db.close();
  }
}

// ---------------------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------------------

function usableLocalStorage(): StorageLike | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = `${LOCAL_STORAGE_PREFIX}:probe`;
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/** IndexedDB, else localStorage, else memory. Never rejects. */
export async function openDefaultOutbox(): Promise<Outbox> {
  if (typeof globalThis.indexedDB !== "undefined") {
    try {
      return await IndexedDbOutbox.open();
    } catch {
      // fall through
    }
  }
  const ls = usableLocalStorage();
  if (ls) return new LocalStorageOutbox(ls);
  return new MemoryOutbox();
}
