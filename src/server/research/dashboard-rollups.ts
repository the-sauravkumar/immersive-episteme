import type { TelemetryEvent } from "@/features/telemetry/contracts";
import { computeTimingMetrics, TIMING_METRICS_VERSION } from "@/features/telemetry/metrics";

import { queryAll, type Q } from "./db";
import { computeStageMetrics, STAGE_METRICS_VERSION } from "./metrics/stage";

export const ROLLUP_VERSION = `stage-${STAGE_METRICS_VERSION}/timing-${TIMING_METRICS_VERSION}/rollup-2`;

export const ROLLUP_EVENT_TYPES = ["stage_entered", "stage_left", "source_opened", "timing_resumed", "client_error"] as const;

const ENDED = new Set(["completed", "abandoned"]);

export interface RollupEvent {
  seq: number;
  type: string;
  conceptId: string | null;
  metadata: Record<string, unknown>;
}

export interface SessionTelemetry {
  eventCount: number;
  lastSeq: number;
  stageMs: number;
  stopsVisited: number;
  revisits: number;
  backSteps: number;
  sourcesOpened: number;
  pauseMs: number;
  clientErrors: number;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function computeSessionTelemetry(events: readonly RollupEvent[], all: { eventCount: number; lastSeq: number }): SessionTelemetry {
  const stage = computeStageMetrics(events);
  const stageValue = (name: string) => stage.find((m) => m.metricName === name)?.value ?? 0;
  const timing = computeTimingMetrics(events.map((e) => ({ type: e.type as TelemetryEvent["type"], seq: e.seq, conceptId: e.conceptId ?? undefined, metadata: e.metadata as TelemetryEvent["metadata"] })));
  const stops = new Set(events.filter((e) => e.type === "stage_entered").map((e) => `${text(e.metadata.traditionKey)}/${text(e.metadata.stageKey)}`));
  return {
    eventCount: all.eventCount,
    lastSeq: all.lastSeq,
    stageMs: stageValue("stage.total_ms"),
    stopsVisited: stops.size,
    revisits: stageValue("stage.revisits"),
    backSteps: stageValue("stage.back_steps"),
    sourcesOpened: events.filter((e) => e.type === "source_opened").length,
    pauseMs: timing.find((x) => x.metricName === "time.pause_ms")?.value ?? 0,
    clientErrors: events.filter((e) => e.type === "client_error").length,
  };
}

interface EventRow {
  session_id: string;
  seq: number;
  type: string;
  concept_id: string | null;
  metadata: Record<string, unknown>;
}

async function fetchEvents(q: Q, sessionIds: readonly string[]): Promise<Map<string, RollupEvent[]>> {
  const out = new Map<string, RollupEvent[]>();
  if (sessionIds.length === 0) return out;
  const r = await q.query<EventRow>(
    `SELECT session_id, seq, event_type_code AS type, concept_id, metadata
       FROM telemetry_events WHERE session_id = ANY($1::uuid[]) AND event_type_code = ANY($2::text[])`,
    [sessionIds, ROLLUP_EVENT_TYPES],
  );
  for (const e of r.rows) {
    const list = out.get(e.session_id) ?? out.set(e.session_id, []).get(e.session_id)!;
    list.push({ seq: e.seq, type: e.type, conceptId: e.concept_id, metadata: e.metadata });
  }
  return out;
}

async function watermarks(q: Q, sessionIds: readonly string[], withCount: boolean): Promise<Map<string, { eventCount: number | null; lastSeq: number }>> {
  const out = new Map<string, { eventCount: number | null; lastSeq: number }>();
  if (sessionIds.length === 0) return out;
  const r = await q.query<{ id: string; n: number | null; mx: number }>(
    withCount
      ? `SELECT s.id, x.n, x.mx FROM unnest($1::uuid[]) AS s(id),
           LATERAL (SELECT count(*)::int AS n, coalesce(max(te.seq), -1) AS mx FROM telemetry_events te WHERE te.session_id = s.id) x`
      : `SELECT s.id, NULL::int AS n, coalesce((SELECT te.seq FROM telemetry_events te WHERE te.session_id = s.id ORDER BY te.seq DESC LIMIT 1), -1) AS mx
           FROM unnest($1::uuid[]) AS s(id)`,
    [sessionIds],
  );
  for (const row of r.rows) out.set(row.id, { eventCount: row.n, lastSeq: row.mx });
  return out;
}

export interface RollupSession {
  id: string;
  status: string;
}

export interface RollupResult {
  bySession: Map<string, SessionTelemetry>;
  recomputed: number;
}

interface StoredRollup {
  session_id: string;
  metrics_version: string;
  session_status: string;
  last_seq: number;
  event_count: number;
  stage_ms: number;
  stops_visited: number;
  revisits: number;
  back_steps: number;
  sources_opened: number;
  pause_ms: number;
  client_errors: number;
}

const fromStored = (r: StoredRollup): SessionTelemetry => ({
  eventCount: r.event_count,
  lastSeq: r.last_seq,
  stageMs: Number(r.stage_ms),
  stopsVisited: r.stops_visited,
  revisits: r.revisits,
  backSteps: r.back_steps,
  sourcesOpened: r.sources_opened,
  pauseMs: Number(r.pause_ms),
  clientErrors: r.client_errors,
});

export async function refreshRollups(q: Q, studyId: string, sessions: readonly RollupSession[]): Promise<RollupResult> {
  const stored = await q.query<StoredRollup>("SELECT * FROM session_telemetry_rollups WHERE study_id = $1", [studyId]);
  const byId = new Map(stored.rows.map((r) => [r.session_id, r]));
  const open = sessions.filter((s) => !ENDED.has(s.status)).map((s) => s.id);
  const ended = sessions.filter((s) => ENDED.has(s.status)).map((s) => s.id);
  const [wOpen, wEnded] = await queryAll(q, [() => watermarks(q, open, true), () => watermarks(q, ended, false)]);
  const stale: { id: string; status: string; eventCount: number; lastSeq: number }[] = [];
  for (const s of sessions) {
    const w = (ENDED.has(s.status) ? wEnded : wOpen).get(s.id) ?? { eventCount: 0, lastSeq: -1 };
    const row = byId.get(s.id);
    const changed =
      !row ||
      row.metrics_version !== ROLLUP_VERSION ||
      row.session_status !== s.status ||
      row.last_seq !== w.lastSeq ||
      (w.eventCount !== null && row.event_count !== w.eventCount);
    if (changed) stale.push({ id: s.id, status: s.status, eventCount: w.eventCount ?? -1, lastSeq: w.lastSeq });
  }
  const bySession = new Map<string, SessionTelemetry>();
  for (const s of sessions) {
    const r = byId.get(s.id);
    if (r) bySession.set(s.id, fromStored(r));
  }
  if (stale.length === 0) return { bySession, recomputed: 0 };

  const needCount = stale.filter((s) => s.eventCount < 0).map((s) => s.id);
  const counts = await watermarks(q, needCount, true);
  for (const s of stale) if (s.eventCount < 0) s.eventCount = counts.get(s.id)?.eventCount ?? 0;
  const events = await fetchEvents(q, stale.map((s) => s.id));
  const fresh = stale.map((s) => ({ s, t: computeSessionTelemetry(events.get(s.id) ?? [], { eventCount: s.eventCount, lastSeq: s.lastSeq }) }));
  const col = <K extends keyof SessionTelemetry>(k: K) => fresh.map((f) => f.t[k]);
  await q.query(
    `INSERT INTO session_telemetry_rollups (session_id, study_id, metrics_version, session_status, last_seq, event_count, stage_ms, stops_visited, revisits,
                                            back_steps, sources_opened, pause_ms, client_errors, computed_at)
     SELECT u.*, now() FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::int[], $6::int[], $7::float8[], $8::int[], $9::int[],
                                   $10::int[], $11::int[], $12::float8[], $13::int[]) AS u
     ON CONFLICT (session_id) DO UPDATE SET
       metrics_version = EXCLUDED.metrics_version, session_status = EXCLUDED.session_status, last_seq = EXCLUDED.last_seq,
       event_count = EXCLUDED.event_count, stage_ms = EXCLUDED.stage_ms, stops_visited = EXCLUDED.stops_visited, revisits = EXCLUDED.revisits,
       back_steps = EXCLUDED.back_steps, sources_opened = EXCLUDED.sources_opened, pause_ms = EXCLUDED.pause_ms,
       client_errors = EXCLUDED.client_errors, computed_at = now()`,
    [
      fresh.map((f) => f.s.id),
      fresh.map(() => studyId),
      fresh.map(() => ROLLUP_VERSION),
      fresh.map((f) => f.s.status),
      col("lastSeq"),
      col("eventCount"),
      col("stageMs"),
      col("stopsVisited"),
      col("revisits"),
      col("backSteps"),
      col("sourcesOpened"),
      col("pauseMs"),
      col("clientErrors"),
    ],
  );
  for (const f of fresh) bySession.set(f.s.id, f.t);
  return { bySession, recomputed: fresh.length };
}

export async function fullTelemetry(q: Q, sessions: readonly RollupSession[]): Promise<Map<string, SessionTelemetry>> {
  const ids = sessions.map((s) => s.id);
  const [w, events] = await queryAll(q, [() => watermarks(q, ids, true), () => fetchEvents(q, ids)]);
  return new Map(ids.map((id) => [id, computeSessionTelemetry(events.get(id) ?? [], { eventCount: w.get(id)?.eventCount ?? 0, lastSeq: w.get(id)?.lastSeq ?? -1 })]));
}
