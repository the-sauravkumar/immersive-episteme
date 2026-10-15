/**
 * Per-session telemetry rollups for the research dashboard (hot/cold split).
 *
 * The dashboard's telemetry figures are a pure function of a session's raw events
 * (`computeSessionTelemetry`, built on the shared `computeTimingMetrics`). Recomputing them for
 * every session on every refresh is O(all events of the study). Instead each session's result is
 * kept in `session_telemetry_rollups` and recomputed only when the session changed:
 *
 *  - no row, or `metrics_version` differs (a metrics change recomputes everything);
 *  - the session's status differs from the one recorded;
 *  - max(seq) differs from `last_seq` (checked for every session: one backward index probe on
 *    telemetry_events (session_id, seq), O(log n));
 *  - for a session still open (scheduled / in_progress) only: count(*) differs from `event_count`
 *    (index-only count over that session), which also catches a late, lower seq.
 * An ended session whose max(seq) is unchanged is never recomputed: the ingest trigger refuses
 * events emitted after the end, and a late page-exit batch carries the highest seq, so it changes
 * max(seq).
 *
 * Order matters for correctness under concurrent ingest: the watermark (max seq, count) is read
 * BEFORE the events, so a row can only under-state its watermark (and is then recomputed on the
 * next load), never claim events it did not include. The upsert is one statement (atomic).
 */
import type { TelemetryEvent } from "@/features/telemetry/contracts";
import { computeTimingMetrics, TIMING_METRICS_VERSION } from "@/features/telemetry/metrics";

import type { Q } from "./db";

/** Bump the suffix when the rollup's own derivation changes; the timing version is included. */
export const ROLLUP_VERSION = `timing-${TIMING_METRICS_VERSION}/rollup-1`;

/** Event types the rollup reads (everything else only counts towards event_count). */
export const ROLLUP_EVENT_TYPES = [
  "exposure_started",
  "exposure_ended",
  "navigation_started",
  "navigation_ended",
  "timing_resumed",
  "citation_opened",
  "concept_encountered",
  "relationship_followed",
  "guidance_cue_used",
  "webgl_context_lost",
  "client_error",
] as const;

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
  exposureMs: number;
  navigationMs: number;
  pauseMs: number;
  unterminated: number;
  conceptsExposed: number;
  conceptsInScope: number;
  relationshipsFollowed: number;
  citationOpens: number;
  guidanceUses: number;
  webglContextLost: number;
  clientErrors: number;
}

/**
 * The dashboard's telemetry figures of one session from its events (any order). `scope` is the
 * study snapshot's concept set (coverage numerator); `eventCount` / `lastSeq` describe ALL the
 * session's events, including types this function does not read.
 */
export function computeSessionTelemetry(events: readonly RollupEvent[], scope: ReadonlySet<string> | ReadonlyMap<string, unknown> | null, all: { eventCount: number; lastSeq: number }): SessionTelemetry {
  const timing = computeTimingMetrics(events.map((e) => ({ type: e.type as TelemetryEvent["type"], seq: e.seq, conceptId: e.conceptId ?? undefined, metadata: e.metadata as TelemetryEvent["metadata"] })));
  const t = (name: string) => timing.find((x) => x.metricName === name);
  const exposed = new Set<string>();
  let relationships = 0;
  let guidance = 0;
  let webgl = 0;
  let errors = 0;
  for (const e of events) {
    if ((e.type === "exposure_started" || e.type === "concept_encountered") && e.conceptId) exposed.add(e.conceptId);
    else if (e.type === "relationship_followed") relationships++;
    else if (e.type === "guidance_cue_used") guidance++;
    else if (e.type === "webgl_context_lost") webgl++;
    else if (e.type === "client_error") errors++;
  }
  return {
    eventCount: all.eventCount,
    lastSeq: all.lastSeq,
    exposureMs: t("time.exposure_total_ms")?.value ?? 0,
    navigationMs: t("time.navigation_ms")?.value ?? 0,
    pauseMs: t("time.pause_ms")?.value ?? 0,
    unterminated: Number(t("time.exposure_total_ms")?.details.unterminated ?? 0),
    conceptsExposed: exposed.size,
    conceptsInScope: scope ? [...exposed].filter((c) => scope.has(c)).length : 0,
    relationshipsFollowed: relationships,
    citationOpens: t("citation.openings")?.value ?? 0,
    guidanceUses: guidance,
    webglContextLost: webgl,
    clientErrors: errors,
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

/** count(*) and max(seq) of the given sessions (index-only on (session_id, seq)). */
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
  /** Sessions recomputed by this call (0 when nothing changed). */
  recomputed: number;
}

/**
 * Brings the rollups of `sessions` (all of one study) up to date and returns them. Only sessions
 * whose events changed are read and recomputed.
 */
export async function refreshRollups(q: Q, studyId: string, sessions: readonly RollupSession[], scope: ReadonlyMap<string, unknown> | null): Promise<RollupResult> {
  const stored = await q.query<{
    session_id: string;
    metrics_version: string;
    session_status: string;
    last_seq: number;
    event_count: number;
    exposure_ms: number;
    navigation_ms: number;
    pause_ms: number;
    unterminated: number;
    concepts_exposed: number;
    concepts_in_scope: number;
    relationships_followed: number;
    citation_opens: number;
    guidance_uses: number;
    webgl_context_lost: number;
    client_errors: number;
  }>("SELECT * FROM session_telemetry_rollups WHERE study_id = $1", [studyId]);
  const byId = new Map(stored.rows.map((r) => [r.session_id, r]));
  const open = sessions.filter((s) => !ENDED.has(s.status)).map((s) => s.id);
  const ended = sessions.filter((s) => ENDED.has(s.status)).map((s) => s.id);
  // Watermarks first (see the header), then the events of the sessions that changed.
  const [wOpen, wEnded] = await Promise.all([watermarks(q, open, true), watermarks(q, ended, false)]);
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
    if (!r) continue;
    bySession.set(s.id, {
      eventCount: r.event_count,
      lastSeq: r.last_seq,
      exposureMs: Number(r.exposure_ms),
      navigationMs: Number(r.navigation_ms),
      pauseMs: Number(r.pause_ms),
      unterminated: r.unterminated,
      conceptsExposed: r.concepts_exposed,
      conceptsInScope: r.concepts_in_scope,
      relationshipsFollowed: r.relationships_followed,
      citationOpens: r.citation_opens,
      guidanceUses: r.guidance_uses,
      webglContextLost: r.webgl_context_lost,
      clientErrors: r.client_errors,
    });
  }
  if (stale.length === 0) return { bySession, recomputed: 0 };

  // Ended sessions were probed for max(seq) only: count them now (they are recomputed once).
  const needCount = stale.filter((s) => s.eventCount < 0).map((s) => s.id);
  const counts = await watermarks(q, needCount, true);
  for (const s of stale) if (s.eventCount < 0) s.eventCount = counts.get(s.id)?.eventCount ?? 0;
  const events = await fetchEvents(q, stale.map((s) => s.id));
  const fresh = stale.map((s) => ({ s, t: computeSessionTelemetry(events.get(s.id) ?? [], scope, { eventCount: s.eventCount, lastSeq: s.lastSeq }) }));
  const col = <K extends keyof SessionTelemetry>(k: K) => fresh.map((f) => f.t[k]);
  await q.query(
    `INSERT INTO session_telemetry_rollups (session_id, study_id, metrics_version, session_status, last_seq, event_count, exposure_ms, navigation_ms, pause_ms,
                                            unterminated, concepts_exposed, concepts_in_scope, relationships_followed, citation_opens, guidance_uses,
                                            webgl_context_lost, client_errors, computed_at)
     SELECT u.*, now() FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::int[], $6::int[], $7::float8[], $8::float8[], $9::float8[],
                                   $10::int[], $11::int[], $12::int[], $13::int[], $14::int[], $15::int[], $16::int[], $17::int[]) AS u
     ON CONFLICT (session_id) DO UPDATE SET
       metrics_version = EXCLUDED.metrics_version, session_status = EXCLUDED.session_status, last_seq = EXCLUDED.last_seq,
       event_count = EXCLUDED.event_count, exposure_ms = EXCLUDED.exposure_ms, navigation_ms = EXCLUDED.navigation_ms, pause_ms = EXCLUDED.pause_ms,
       unterminated = EXCLUDED.unterminated, concepts_exposed = EXCLUDED.concepts_exposed, concepts_in_scope = EXCLUDED.concepts_in_scope,
       relationships_followed = EXCLUDED.relationships_followed, citation_opens = EXCLUDED.citation_opens, guidance_uses = EXCLUDED.guidance_uses,
       webgl_context_lost = EXCLUDED.webgl_context_lost, client_errors = EXCLUDED.client_errors, computed_at = now()`,
    [
      fresh.map((f) => f.s.id),
      fresh.map(() => studyId),
      fresh.map(() => ROLLUP_VERSION),
      fresh.map((f) => f.s.status),
      col("lastSeq"),
      col("eventCount"),
      col("exposureMs"),
      col("navigationMs"),
      col("pauseMs"),
      col("unterminated"),
      col("conceptsExposed"),
      col("conceptsInScope"),
      col("relationshipsFollowed"),
      col("citationOpens"),
      col("guidanceUses"),
      col("webglContextLost"),
      col("clientErrors"),
    ],
  );
  for (const f of fresh) bySession.set(f.s.id, f.t);
  return { bySession, recomputed: fresh.length };
}

/** The same figures computed from ALL events, without the rollup table (reference path, tests). */
export async function fullTelemetry(q: Q, sessions: readonly RollupSession[], scope: ReadonlyMap<string, unknown> | null): Promise<Map<string, SessionTelemetry>> {
  const ids = sessions.map((s) => s.id);
  const [w, events] = await Promise.all([watermarks(q, ids, true), fetchEvents(q, ids)]);
  return new Map(ids.map((id) => [id, computeSessionTelemetry(events.get(id) ?? [], scope, { eventCount: w.get(id)?.eventCount ?? 0, lastSeq: w.get(id)?.lastSeq ?? -1 })]));
}
