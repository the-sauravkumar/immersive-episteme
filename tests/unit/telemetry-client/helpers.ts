import { randomUUID } from "node:crypto";

import type { TelemetryEvent } from "@/features/telemetry/contracts";

export const SESSION = "0190f0a0-0000-7000-8000-000000000001";

export interface SentBatch {
  idempotencyKey: string;
  sessionId: string;
  schemaVersion: number;
  appBuild: string;
  contentVersion: string;
  clientSentAt: string;
  events: TelemetryEvent[];
}

export type Reply = number | "network" | { status: number; body?: unknown; headers?: Record<string, string> };

export function ackFor(batch: SentBatch, extra: Record<string, unknown> = {}) {
  return {
    batchId: randomUUID(),
    status: "accepted",
    replayed: false,
    accepted: batch.events.length,
    duplicates: 0,
    quarantined: 0,
    persisted: true,
    nonExperimental: false,
    gaps: [],
    serverReceivedAt: new Date().toISOString(),
    ...extra,
  };
}

/** Scripted fetch: each call consumes the next reply (default: 200 ack). */
export function fakeFetch(replies: Reply[] = []) {
  const calls: { batch: SentBatch; init: RequestInit }[] = [];
  const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const batch = JSON.parse(String(init!.body)) as SentBatch;
    calls.push({ batch, init: init! });
    const r = replies.shift() ?? 200;
    if (r === "network") throw new TypeError("Failed to fetch");
    const spec = typeof r === "number" ? { status: r } : r;
    const body = spec.body ?? (spec.status === 200 ? ackFor(batch) : { error: "server_error", message: "x" });
    return new Response(JSON.stringify(body), { status: spec.status, headers: { "content-type": "application/json", ...spec.headers } });
  }) as typeof fetch;
  return { impl, calls };
}
