import { EVENT_TYPE_REGISTRY } from "@/features/telemetry/contracts";

import { ANALYSIS_REFERENCES_SQL } from "./analysis-reference";
import { loadSnapshotFacts } from "./metrics/pipeline";
import { queryAll, type Q } from "./db";

export interface ConditionRef {
  id: string;
  code: string;
  label: string;
  interface: string;
}

export async function studyConditions(q: Q, studyId: string): Promise<ConditionRef[]> {
  const r = await q.query<ConditionRef>("SELECT id, code, label, interface::text AS interface FROM study_conditions WHERE study_id = $1 ORDER BY position, code", [studyId]);
  return r.rows;
}

export interface StudyOverview {
  nonExperimental: boolean;
  enrolment: { status: string; n: number }[];
  allocation: { conditionId: string; n: number }[];
  sessions: { conditionId: string; status: string; n: number }[];
  excluded: number;
  withdrawn: number;
  deviations: { severity: string; category: string; n: number }[];
  telemetry: {
    conditionId: string;
    sessions: number;
    sessionsWithEvents: number;
    events: number;
    quarantined: number;
    sessionsWithOpenGaps: number;
    missingSeq: number;
    unterminatedIntervals: number;
  }[];
}

export async function studyOverview(q: Q, studyId: string): Promise<StudyOverview> {
  const [flag, enrol, alloc, sess, excl, dev, tel] = await queryAll(q, [
    () => q.query<{ ne: boolean }>("SELECT (is_demo OR coalesce((config->>'nonExperimental')::boolean, false)) AS ne FROM studies WHERE id = $1", [studyId]),
    () => q.query<{ status: string; n: number }>("SELECT status::text AS status, count(*)::int AS n FROM participants WHERE study_id = $1 GROUP BY 1 ORDER BY 1", [studyId]),
    () => q.query<{ conditionId: string; n: number }>(`SELECT condition_id AS "conditionId", count(*)::int AS n FROM allocations WHERE study_id = $1 GROUP BY 1`, [studyId]),
    () => q.query<{ conditionId: string; status: string; n: number }>(
      `SELECT condition_id AS "conditionId", status::text AS status, count(*)::int AS n FROM study_sessions WHERE study_id = $1 GROUP BY 1, 2`,
      [studyId],
    ),
    () => q.query<{ excluded: number; withdrawn: number }>(
      "SELECT count(*) FILTER (WHERE excluded)::int AS excluded, count(*) FILTER (WHERE withdrawn)::int AS withdrawn FROM study_sessions WHERE study_id = $1",
      [studyId],
    ),
    () => q.query<{ severity: string; category: string; n: number }>(
      "SELECT severity::text AS severity, category, count(*)::int AS n FROM protocol_deviations WHERE study_id = $1 GROUP BY 1, 2 ORDER BY 1, 2",
      [studyId],
    ),
    () => q.query<StudyOverview["telemetry"][number]>(
      `SELECT ss.condition_id AS "conditionId", count(*)::int AS sessions,
              count(*) FILTER (WHERE ev.n > 0)::int AS "sessionsWithEvents",
              coalesce(sum(ev.n), 0)::int AS events,
              coalesce(sum(qu.n), 0)::int AS quarantined,
              count(*) FILTER (WHERE gp.n > 0)::int AS "sessionsWithOpenGaps",
              coalesce(sum(gp.missing), 0)::int AS "missingSeq",
              coalesce(sum(ev.starts - ev.ends), 0)::int AS "unterminatedIntervals"
         FROM study_sessions ss
         LEFT JOIN LATERAL (SELECT count(*) AS n,
                                   count(*) FILTER (WHERE event_type_code = 'stage_entered') AS starts,
                                   count(*) FILTER (WHERE event_type_code = 'stage_left') AS ends
                              FROM telemetry_events te WHERE te.session_id = ss.id) ev ON true
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM telemetry_quarantine tq WHERE tq.session_id = ss.id) qu ON true
         LEFT JOIN LATERAL (SELECT count(*) AS n, sum(to_seq - from_seq + 1) AS missing FROM sequence_gaps g
                             WHERE g.session_id = ss.id AND g.kind = 'gap' AND g.resolved_at IS NULL) gp ON true
        WHERE ss.study_id = $1 GROUP BY ss.condition_id`,
      [studyId],
    ),
  ]);
  return {
    nonExperimental: flag.rows[0]?.ne ?? false,
    enrolment: enrol.rows,
    allocation: alloc.rows,
    sessions: sess.rows,
    excluded: excl.rows[0]?.excluded ?? 0,
    withdrawn: excl.rows[0]?.withdrawn ?? 0,
    deviations: dev.rows,
    telemetry: tel.rows,
  };
}

export interface MetricDistribution {
  metricName: string;
  metricVersion: string;
  byCondition: Record<string, number[]>;
  nullCount: number;
}

const ANALYSED_SESSIONS_SQL = `
  SELECT DISTINCT ON (participant_id) participant_id, id, condition_id, excluded, withdrawn
    FROM study_sessions
   WHERE study_id = $1 AND condition_id IS NOT NULL
   ORDER BY participant_id, period DESC, id DESC`;

const ANALYSABLE = "NOT an.excluded AND NOT an.withdrawn";

export async function outcomeDistributions(q: Q, studyId: string, opts: { includeExcluded?: boolean } = {}): Promise<MetricDistribution[]> {
  const r = await q.query<{ metric_name: string; metric_version: string; condition_id: string; value: number | null }>(
    `WITH ar AS (${ANALYSIS_REFERENCES_SQL}), an AS (${ANALYSED_SESSIONS_SQL})
     SELECT DISTINCT ON (an.id, ds.metric_name, ds.metric_version, ds.assessment_id, cm.phase)
            CASE WHEN cm.phase IS NOT NULL THEN ds.metric_name || ' (' || cm.phase::text || ')'
                 ELSE ds.metric_name || ' (' || a.kind::text || ' ' || a.code || ' v' || a.version || ')' END AS metric_name,
            ds.metric_version, an.condition_id, ds.value
       FROM derived_scores ds JOIN study_sessions ss ON ss.id = ds.session_id
       JOIN an ON an.participant_id = ss.participant_id
       JOIN assessments a ON a.id = ds.assessment_id
       LEFT JOIN concept_maps cm ON cm.id = ds.concept_map_id
       LEFT JOIN ar ON ar.assessment_id = ds.assessment_id
      WHERE ss.study_id = $1 AND ($2 OR (${ANALYSABLE}))
        AND ds.response_id IS NULL
        AND (ds.concept_map_id IS NULL OR ds.reference_map_id IS NOT DISTINCT FROM ar.reference_map_id)
      ORDER BY an.id, ds.metric_name, ds.metric_version, ds.assessment_id, cm.phase, ss.period DESC, ds.computed_at DESC`,
    [studyId, opts.includeExcluded ?? false],
  );
  return group(r.rows);
}

export async function behaviourDistributions(q: Q, studyId: string, opts: { includeExcluded?: boolean } = {}): Promise<MetricDistribution[]> {
  const r = await q.query<{ metric_name: string; metric_version: string; condition_id: string; value: number | null }>(
    `WITH an AS (${ANALYSED_SESSIONS_SQL})
     SELECT dm.metric_name, dm.metric_version, dm.condition_id, dm.value
       FROM derived_metrics dm JOIN an ON an.id = dm.session_id
      WHERE dm.study_id = $1 AND ($2 OR (${ANALYSABLE}))`,
    [studyId, opts.includeExcluded ?? false],
  );
  return group(r.rows);
}

function group(rows: { metric_name: string; metric_version: string; condition_id: string; value: number | null }[]): MetricDistribution[] {
  const by = new Map<string, MetricDistribution>();
  for (const row of rows) {
    const k = `${row.metric_name}@${row.metric_version}`;
    const d = by.get(k) ?? by.set(k, { metricName: row.metric_name, metricVersion: row.metric_version, byCondition: {}, nullCount: 0 }).get(k)!;
    if (row.value === null) d.nullCount++;
    else (d.byCondition[row.condition_id] ??= []).push(Number(row.value));
  }
  return [...by.values()].sort((a, b) => (a.metricName < b.metricName ? -1 : 1));
}

export async function correspondenceSummary(q: Q, studyId: string) {
  const r = await q.query<{ condition_id: string; details: Record<string, number | boolean> }>(
    `WITH an AS (${ANALYSED_SESSIONS_SQL})
     SELECT dm.condition_id, dm.details FROM derived_metrics dm JOIN an ON an.id = dm.session_id
      WHERE dm.study_id = $1 AND dm.metric_name = 'nav.map_correspondence' AND ${ANALYSABLE}`,
    [studyId],
  );
  const keys = ["mapEdges", "reconstructedCorrect", "reconstructedIncorrect"] as const;
  const out: Record<string, { sessions: number; withMap: number } & Record<(typeof keys)[number], number>> = {};
  for (const row of r.rows) {
    const o = (out[row.condition_id] ??= { sessions: 0, withMap: 0, ...Object.fromEntries(keys.map((k) => [k, 0])) } as never);
    o.sessions++;
    if (row.details.mapAvailable) o.withMap++;
    for (const k of keys) o[k] += Number(row.details[k] ?? 0);
  }
  return { keys, byCondition: out };
}

export interface TransitionMatrix {
  conditionId: string;
  labels: string[];
  counts: number[][];
  sessions: number;
  transitions: number;
}

export async function transitionMatrices(q: Q, studyId: string): Promise<TransitionMatrix[]> {
  const ev = await q.query<{ session_id: string; condition_id: string; seq: number; stage: number | null }>(
    `WITH an AS (${ANALYSED_SESSIONS_SQL})
     SELECT an.id AS session_id, an.condition_id, te.seq, (te.metadata->>'stageNumber')::int AS stage
       FROM an JOIN study_sessions ss ON ss.id = an.id
       LEFT JOIN telemetry_events te ON te.session_id = an.id AND te.event_type_code = 'stage_entered'
      WHERE ${ANALYSABLE}
      ORDER BY an.id, te.seq`,
    [studyId],
  );
  const stages = [...new Set(ev.rows.flatMap((r) => (r.stage === null ? [] : [r.stage])))].sort((a, b) => a - b);
  const labels = stages.map((n) => `Stop ${n}`);
  const index = new Map(stages.map((n, i) => [n, i]));
  const out = new Map<string, TransitionMatrix>();
  let previous = null as { session: string; stage: number } | null;
  for (const row of ev.rows) {
    let m = out.get(row.condition_id);
    if (!m) {
      m = { conditionId: row.condition_id, labels, counts: labels.map(() => labels.map(() => 0)), sessions: 0, transitions: 0 };
      out.set(row.condition_id, m);
    }
    if (previous?.session !== row.session_id) {
      m.sessions++;
      previous = null;
    }
    if (row.stage === null) continue;
    if (previous && previous.stage !== row.stage) {
      m.counts[index.get(previous.stage)!]![index.get(row.stage)!]!++;
      m.transitions++;
    }
    previous = { session: row.session_id, stage: row.stage };
  }
  return [...out.values()];
}

export interface TimelinePoint {
  seq: number;
  tMs: number;
  type: string;
  analyticConcept: string;
  technical: boolean;
  conceptTitle: string | null;
}

const ANALYTIC = new Map(EVENT_TYPE_REGISTRY.map((e) => [e.code, { concept: e.analyticConcept, technical: "isTechnical" in e && e.isTechnical === true }]));

export async function sessionTimeline(q: Q, sessionId: string): Promise<TimelinePoint[]> {
  const s = await q.query<{ snapshot_id: string | null }>("SELECT snapshot_id FROM study_sessions WHERE id = $1", [sessionId]);
  const facts = s.rows[0]?.snapshot_id ? await loadSnapshotFacts(q, s.rows[0].snapshot_id) : null;
  const r = await q.query<{ seq: number; type: string; conceptId: string | null; t: number }>(
    `SELECT seq, event_type_code AS type, concept_id AS "conceptId",
            extract(epoch FROM client_ts - min(client_ts) OVER ()) * 1000 AS t
       FROM telemetry_events WHERE session_id = $1 ORDER BY seq`,
    [sessionId],
  );
  return r.rows.map((e) => ({
    seq: e.seq,
    tMs: Math.round(Number(e.t)),
    type: e.type,
    analyticConcept: ANALYTIC.get(e.type as never)?.concept ?? e.type,
    technical: ANALYTIC.get(e.type as never)?.technical ?? false,
    conceptTitle: e.conceptId ? (facts?.concepts.get(e.conceptId)?.title ?? null) : null,
  }));
}
