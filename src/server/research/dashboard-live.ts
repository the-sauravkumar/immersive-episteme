/**
 * Push channel of the research dashboard: ONE shared `LISTEN ie_dashboard` connection per server
 * process (migration 0014 sends one NOTIFY per changed study per statement, at commit), fanned
 * out to in-process subscribers (the SSE streams of /api/research/dashboard/stream).
 *
 *  - The connection is a dedicated pg Client OUTSIDE the request pool, created lazily on the
 *    first subscription and kept on globalThis (dev hot reload must not open more).
 *  - It reconnects with exponential backoff (0.5 s doubling to 30 s). A reconnect starts a new
 *    `epoch` and wakes every subscribed study, because notifications sent while disconnected are
 *    lost.
 *  - `version(studyId)` = epoch + per-study notification count, or null while disconnected. The
 *    request coalescer (./dashboard-cache.ts) only memoises under a non-null version, so a memo
 *    entry is valid exactly as long as no notification for its study has arrived since.
 */
import { Client } from "pg";

import type { PgConnectionConfig } from "@/server/db/connection-config";

export const DASHBOARD_CHANNEL = "ie_dashboard";

type Listener = (studyId: string) => void;

export class DashboardNotifier {
  private client: Client | null = null;
  private connecting = false;
  private closed = false;
  private backoffMs = 500;
  private readonly subs = new Map<string, Set<Listener>>();
  private readonly generations = new Map<string, number>();
  /** Incremented on every successful (re)connect. */
  epoch = 0;
  connected = false;

  constructor(
    /** DATABASE_URL, or the TLS-pinned settings from pgConnectionConfig (source change S3). */
    private readonly connection: string | PgConnectionConfig,
    private readonly log: Pick<Console, "error" | "warn"> = console,
  ) {}

  /** Opens the shared connection if it is not open or opening. */
  ensure(): void {
    if (this.client || this.connecting || this.closed) return;
    this.connecting = true;
    void this.connect().finally(() => {
      this.connecting = false;
    });
  }

  private async connect(): Promise<void> {
    const base = typeof this.connection === "string" ? { connectionString: this.connection } : this.connection;
    const c = new Client({ ...base, application_name: "ie-dashboard-listener", keepAlive: true });
    c.on("notification", (m) => {
      if (m.channel === DASHBOARD_CHANNEL && m.payload) this.bump(m.payload);
    });
    c.on("error", (err) => this.drop(c, err));
    c.on("end", () => this.drop(c));
    try {
      await c.connect();
      await c.query(`LISTEN ${DASHBOARD_CHANNEL}`);
      if (this.closed) {
        await c.end();
        return;
      }
      this.client = c;
      this.connected = true;
      this.epoch++;
      this.backoffMs = 500;
      // Anything may have changed while we were not listening.
      for (const studyId of this.subs.keys()) this.bump(studyId);
    } catch (err) {
      this.log.warn("[dashboard-live] LISTEN connection failed; retrying", (err as Error).message);
      c.end().catch(() => {});
      this.scheduleReconnect();
    }
  }

  private drop(c: Client, err?: Error): void {
    if (this.client !== c) return;
    if (err) this.log.warn("[dashboard-live] LISTEN connection lost; reconnecting", err.message);
    this.client = null;
    this.connected = false;
    c.end().catch(() => {});
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, 30_000);
    const t = setTimeout(() => this.ensure(), delay);
    t.unref?.();
  }

  private bump(studyId: string): void {
    this.generations.set(studyId, (this.generations.get(studyId) ?? 0) + 1);
    for (const l of this.subs.get(studyId) ?? []) {
      try {
        l(studyId);
      } catch (err) {
        this.log.error("[dashboard-live] subscriber failed", err);
      }
    }
  }

  /** Calls `listener` after every committed change of the study. Returns the unsubscribe function. */
  subscribe(studyId: string, listener: Listener): () => void {
    this.ensure();
    const set = this.subs.get(studyId) ?? this.subs.set(studyId, new Set()).get(studyId)!;
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.subs.delete(studyId);
    };
  }

  /** Coalescing token: changes with every notification for the study; null while not listening. */
  version(studyId: string): string | null {
    return this.connected ? `${this.epoch}:${this.generations.get(studyId) ?? 0}` : null;
  }

  subscriberCount(): number {
    let n = 0;
    for (const s of this.subs.values()) n += s.size;
    return n;
  }

  /** Resolves once listening (tests), or after `timeoutMs`. */
  async ready(timeoutMs = 5_000): Promise<boolean> {
    this.ensure();
    const t0 = Date.now();
    while (!this.connected && Date.now() - t0 < timeoutMs) await new Promise((r) => setTimeout(r, 20));
    return this.connected;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.connected = false;
    const c = this.client;
    this.client = null;
    await c?.end().catch(() => {});
  }
}

type LiveGlobal = typeof globalThis & { __episteme_dashboard_notifier?: DashboardNotifier };

/** The process-wide notifier (DATABASE_URL), created lazily. */
export function getDashboardNotifier(connection: string | PgConnectionConfig): DashboardNotifier {
  const g = globalThis as LiveGlobal;
  g.__episteme_dashboard_notifier ??= new DashboardNotifier(connection);
  return g.__episteme_dashboard_notifier;
}
