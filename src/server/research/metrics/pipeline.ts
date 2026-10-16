/**
 * Derived-metric pipeline: recompute and store a study's behavioural metrics
 * (`derived_metrics`, keyed by session + metric + version). Raw events are never modified;
 * rows are upserted only when their input hash changed, so recomputation is idempotent and a
 * stale row (new events arrived) is detectable by comparing `input_sha256`.
 */
import type { MapEdgeInput, SnapshotRelationship } from "./correspondence";
import type { ConceptFacts, NavEvent } from "./navigation";
import { computeSessionMetrics, METRICS_PIPELINE_VERSION, metricInputHash, type ComputedMetrics } from "./session";
import type { Q } from "../db";

export interface SnapshotFacts {
  concepts: Map<string, ConceptFacts & { key: string; title: string; type: string }>;
  relationships: SnapshotRelationship[];
  traditions: Map<string, { slug: string; name: string }>;
}

const snapshotFactsCache = new Map<string, SnapshotFacts>();

/** Concept / relationship facts of a snapshot payload (immutable once stored, so cached). */
export async function loadSnapshotFacts(q: Q, snapshotId: string): Promise<SnapshotFacts> {
  const hit = snapshotFactsCache.get(snapshotId);
  if (hit) return hit;
  const r = await q.query<{ concepts: unknown; relationships: unknown; types: unknown; traditions: unknown }>(
    `SELECT payload->'concepts' AS concepts, payload->'relationships' AS relationships,
            payload->'relationshipTypes' AS types, payload->'traditions' AS traditions
       FROM content_snapshots WHERE id = $1`,
    [snapshotId],
  );
  const row = r.rows[0];
  const concepts = new Map<string, ConceptFacts & { key: string; title: string; type: string }>();
  const idByKey = new Map<string, string>();
  for (const c of (row?.concepts as { id: string; key: string; title?: string; type?: string; traditionId?: string | null; category?: string }[] | null) ?? []) {
    concepts.set(c.id, { key: c.key, title: c.title ?? c.key, type: c.type ?? "unknown", traditionId: c.traditionId ?? null, category: c.category ?? "unknown" });
    idByKey.set(c.key, c.id);
  }
  const directed = new Map(((row?.types as { code: string; directed?: boolean }[] | null) ?? []).map((t) => [t.code, t.directed !== false]));
  const relationships: SnapshotRelationship[] = [];
  for (const rel of (row?.relationships as { id: string; source: string; target: string; type: string }[] | null) ?? []) {
    const s = idByKey.get(rel.source);
    const t = idByKey.get(rel.target);
    if (s && t) relationships.push({ id: rel.id, sourceId: s, targetId: t, type: rel.type, directed: directed.get(rel.type) ?? true });
  }
  const traditions = new Map(((row?.traditions as { id: string; slug: string; name: string }[] | null) ?? []).map((t) => [t.id, { slug: t.slug, name: t.name }]));
  const facts = { concepts, relationships, traditions };
  if (row) snapshotFactsCache.set(snapshotId, facts);
  return facts;
}

export type StoredEvent = NavEvent & {
  eventId: string;
  clientTs: string;
  serverTs: string;
  clientMonoMs: number | null;
  roomOrPageId: string | null;
  target: string | null;
  traditionId: string | null;
  categoryCode: string | null;
};

export async function loadSessionEvents(q: Q, sessionId: string): Promise<StoredEvent[]> {
  const r = await q.query<StoredEvent>(
    `SELECT event_id AS "eventId", seq, event_type_code AS type, concept_id AS "conceptId", metadata,
            to_json(client_ts)#>>'{}' AS "clientTs", to_json(server_ts)#>>'{}' AS "serverTs", client_mono_ms AS "clientMonoMs",
            room_or_page_id AS "roomOrPageId", target, tradition_id AS "traditionId", category_code AS "categoryCode"
       FROM telemetry_events WHERE session_id = $1 ORDER BY seq`,
    [sessionId],
  );
  return r.rows;
}

/** The final post-learning concept map of a session (latest submitted), with its edges. */
export async function loadFinalPostMap(q: Q, sessionId: string): Promise<{ id: string; revision: number; edges: MapEdgeInput[] } | null> {
  const m = await q.query<{ id: string; revision: number }>(
    `SELECT id, revision FROM concept_maps
      WHERE session_id = $1 AND phase = 'post' AND is_final
      ORDER BY submitted_at DESC NULLS LAST, id DESC LIMIT 1`,
    [sessionId],
  );
  const map = m.rows[0];
  if (!map) return null;
  const e = await q.query<MapEdgeInput>(
    `SELECT source_concept_id AS "sourceConceptId", target_concept_id AS "targetConceptId",
            relationship_type_code AS "relationshipTypeCode", directed
       FROM concept_map_edges WHERE concept_map_id = $1 ORDER BY edge_key`,
    [map.id],
  );
  return { id: map.id, revision: map.revision, edges: e.rows };
}

interface SessionRow {
  id: string;
  study_id: string;
  participant_id: string;
  /** Null until the session is allocated (allocation after the pre-test, D3). */
  condition_id: string | null;
  snapshot_id: string | null;
}

export async function computeStoredSession(q: Q, s: SessionRow): Promise<ComputedMetrics | null> {
  // An unallocated session (still in, or dropped out during, the pre-test) has no condition and
  // no learning telemetry: there is nothing to derive, and derived_metrics.condition_id is NOT NULL.
  if (!s.snapshot_id || !s.condition_id) return null;
  const [events, facts, map] = await Promise.all([loadSessionEvents(q, s.id), loadSnapshotFacts(q, s.snapshot_id), loadFinalPostMap(q, s.id)]);
  return computeSessionMetrics({ events, concepts: facts.concepts, relationships: facts.relationships, map });
}

export interface RecomputeSummary {
  sessions: number;
  rowsWritten: number;
  unchanged: number;
}

/**
 * Recomputes every allocated session of a study; writes only rows whose inputs changed. Each
 * session's rows are written by ONE statement, so a session is never left half-updated (the
 * pool runs in autocommit), and a failure cannot leave a mix of old and new metric rows.
 */
export async function recomputeStudyMetrics(q: Q, studyId: string): Promise<RecomputeSummary> {
  const sessions = await q.query<SessionRow>(
    "SELECT id, study_id, participant_id, condition_id, snapshot_id FROM study_sessions WHERE study_id = $1 AND condition_id IS NOT NULL ORDER BY id",
    [studyId],
  );
  let rowsWritten = 0;
  let unchanged = 0;
  for (const s of sessions.rows) {
    const computed = await computeStoredSession(q, s);
    if (!computed || computed.values.length === 0) continue;
    const values = computed.values.map((v) => ({ metric_name: v.metricName, metric_version: v.metricVersion, value: v.value, details: v.details }));
    const r = await q.query(
      `INSERT INTO derived_metrics (study_id, participant_id, session_id, condition_id, metric_name, metric_version,
                                    value, details, input_event_count, input_sha256, pipeline_version)
       SELECT $1, $2, $3, $4, v.metric_name, v.metric_version, v.value, coalesce(v.details, '{}'::jsonb), $6, $7, $8
         FROM jsonb_to_recordset($5::jsonb) AS v(metric_name text, metric_version text, value double precision, details jsonb)
       ON CONFLICT (session_id, metric_name, metric_version) DO UPDATE
         SET value = EXCLUDED.value, details = EXCLUDED.details, input_event_count = EXCLUDED.input_event_count,
             input_sha256 = EXCLUDED.input_sha256, pipeline_version = EXCLUDED.pipeline_version, computed_at = now()
       WHERE derived_metrics.input_sha256 <> EXCLUDED.input_sha256 OR derived_metrics.pipeline_version <> EXCLUDED.pipeline_version`,
      [s.study_id, s.participant_id, s.id, s.condition_id, JSON.stringify(values), computed.inputEventCount, computed.inputSha256, METRICS_PIPELINE_VERSION],
    );
    rowsWritten += r.rowCount ?? 0;
    unchanged += values.length - (r.rowCount ?? 0);
  }
  return { sessions: sessions.rowCount ?? 0, rowsWritten, unchanged };
}

/**
 * Allocated sessions whose stored metrics are missing or stale (input hash differs from the raw
 * events). Unallocated sessions have no metrics to derive and are not counted in `total`.
 */
export async function staleMetricSessions(q: Q, studyId: string): Promise<{ stale: number; total: number }> {
  const sessions = await q.query<{ id: string; stored: string | null }>(
    `SELECT ss.id, (SELECT dm.input_sha256 FROM derived_metrics dm WHERE dm.session_id = ss.id AND dm.metric_name = 'nav.path_length' LIMIT 1) AS stored
       FROM study_sessions ss WHERE ss.study_id = $1 AND ss.condition_id IS NOT NULL`,
    [studyId],
  );
  let stale = 0;
  for (const s of sessions.rows) {
    const ev = await q.query<{ eventId: string; seq: number }>(`SELECT event_id AS "eventId", seq FROM telemetry_events WHERE session_id = $1`, [s.id]);
    const map = await q.query<{ id: string; revision: number }>(
      `SELECT id, revision FROM concept_maps WHERE session_id = $1 AND phase = 'post' AND is_final ORDER BY submitted_at DESC NULLS LAST, id DESC LIMIT 1`,
      [s.id],
    );
    if (ev.rows.length === 0 && !s.stored) continue;
    if (s.stored !== metricInputHash(ev.rows, map.rows[0] ?? null)) stale++;
  }
  return { stale, total: sessions.rowCount ?? 0 };
}
