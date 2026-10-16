/**
 * Research analytics read models (descriptive, observational). Sessions flagged excluded,
 * withdrawn sessions and non-experimental studies are excluded from distributions unless the
 * caller asks otherwise; every result says what it counted.
 */
import { EVENT_TYPE_REGISTRY } from "@/features/telemetry/contracts";
import { KNOWLEDGE_CATEGORY_CODES } from "@/lib/validation/enums";

import { ANALYSIS_REFERENCES_SQL } from "./analysis-reference";
import { loadSnapshotFacts } from "./metrics/pipeline";
import { visitSequence, type NavEvent } from "./metrics/navigation";
import type { Q } from "./db";

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
  const [flag, enrol, alloc, sess, excl, dev, tel] = await Promise.all([
    q.query<{ ne: boolean }>("SELECT (is_demo OR coalesce((config->>'nonExperimental')::boolean, false)) AS ne FROM studies WHERE id = $1", [studyId]),
    q.query<{ status: string; n: number }>("SELECT status::text AS status, count(*)::int AS n FROM participants WHERE study_id = $1 GROUP BY 1 ORDER BY 1", [studyId]),
    q.query<{ conditionId: string; n: number }>(`SELECT condition_id AS "conditionId", count(*)::int AS n FROM allocations WHERE study_id = $1 GROUP BY 1`, [studyId]),
    q.query<{ conditionId: string; status: string; n: number }>(
      `SELECT condition_id AS "conditionId", status::text AS status, count(*)::int AS n FROM study_sessions WHERE study_id = $1 GROUP BY 1, 2`,
      [studyId],
    ),
    q.query<{ excluded: number; withdrawn: number }>(
      "SELECT count(*) FILTER (WHERE excluded)::int AS excluded, count(*) FILTER (WHERE withdrawn)::int AS withdrawn FROM study_sessions WHERE study_id = $1",
      [studyId],
    ),
    q.query<{ severity: string; category: string; n: number }>(
      "SELECT severity::text AS severity, category, count(*)::int AS n FROM protocol_deviations WHERE study_id = $1 GROUP BY 1, 2 ORDER BY 1, 2",
      [studyId],
    ),
    q.query<StudyOverview["telemetry"][number]>(
      `SELECT ss.condition_id AS "conditionId", count(*)::int AS sessions,
              count(*) FILTER (WHERE ev.n > 0)::int AS "sessionsWithEvents",
              coalesce(sum(ev.n), 0)::int AS events,
              coalesce(sum(qu.n), 0)::int AS quarantined,
              count(*) FILTER (WHERE gp.n > 0)::int AS "sessionsWithOpenGaps",
              coalesce(sum(gp.missing), 0)::int AS "missingSeq",
              coalesce(sum(ev.starts - ev.ends), 0)::int AS "unterminatedIntervals"
         FROM study_sessions ss
         LEFT JOIN LATERAL (SELECT count(*) AS n,
                                   count(*) FILTER (WHERE event_type_code IN ('exposure_started', 'navigation_started')) AS starts,
                                   count(*) FILTER (WHERE event_type_code IN ('exposure_ended', 'navigation_ended')) AS ends
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

/** Values of one metric per condition (one value per session). */
export interface MetricDistribution {
  metricName: string;
  metricVersion: string;
  byCondition: Record<string, number[]>;
  nullCount: number;
}

const ANALYSABLE = "NOT ss.excluded AND NOT ss.withdrawn";

/**
 * Outcome distributions from derived_scores: one value per analysable, allocated session and
 * administration (latest row per session, metric, version, assessment and map phase).
 *
 * Final review scoring-07:
 *  - response-level rows (item.key_match, rubric.rating.*) are left out: one session has one row
 *    per item, so a per-session distribution would keep an arbitrary item (the per-item and
 *    per-rubric statistics are on the dashboard);
 *  - each administration is its own distribution: concept-map scores by map phase (one assessment
 *    yields a pre and a post map), every other score by assessment kind, code and version, so the
 *    pre-test, post-test and transfer totals are never pooled (prior knowledge vs outcome);
 *  - concept-map scores are read against the study's analysis reference map only (scoring-04).
 */
export async function outcomeDistributions(q: Q, studyId: string, opts: { includeExcluded?: boolean } = {}): Promise<MetricDistribution[]> {
  const r = await q.query<{ metric_name: string; metric_version: string; condition_id: string; value: number | null }>(
    `WITH ar AS (${ANALYSIS_REFERENCES_SQL})
     SELECT DISTINCT ON (ds.session_id, ds.metric_name, ds.metric_version, ds.assessment_id, cm.phase)
            CASE WHEN cm.phase IS NOT NULL THEN ds.metric_name || ' (' || cm.phase::text || ')'
                 ELSE ds.metric_name || ' (' || a.kind::text || ' ' || a.code || ' v' || a.version || ')' END AS metric_name,
            ds.metric_version, ss.condition_id, ds.value
       FROM derived_scores ds JOIN study_sessions ss ON ss.id = ds.session_id
       JOIN assessments a ON a.id = ds.assessment_id
       LEFT JOIN concept_maps cm ON cm.id = ds.concept_map_id
       LEFT JOIN ar ON ar.assessment_id = ds.assessment_id
      WHERE ss.study_id = $1 AND ss.condition_id IS NOT NULL AND ($2 OR (${ANALYSABLE}))
        AND ds.response_id IS NULL
        AND (ds.concept_map_id IS NULL OR ds.reference_map_id IS NOT DISTINCT FROM ar.reference_map_id)
      ORDER BY ds.session_id, ds.metric_name, ds.metric_version, ds.assessment_id, cm.phase, ds.computed_at DESC`,
    [studyId, opts.includeExcluded ?? false],
  );
  return group(r.rows);
}

/** Behavioural metric distributions from derived_metrics. */
export async function behaviourDistributions(q: Q, studyId: string, opts: { includeExcluded?: boolean } = {}): Promise<MetricDistribution[]> {
  const r = await q.query<{ metric_name: string; metric_version: string; condition_id: string; value: number | null }>(
    `SELECT dm.metric_name, dm.metric_version, dm.condition_id, dm.value
       FROM derived_metrics dm JOIN study_sessions ss ON ss.id = dm.session_id
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

/** Correspondence details (navigation vs concept map) summed per condition. */
export async function correspondenceSummary(q: Q, studyId: string) {
  const r = await q.query<{ condition_id: string; details: Record<string, number | boolean> }>(
    `SELECT dm.condition_id, dm.details FROM derived_metrics dm JOIN study_sessions ss ON ss.id = dm.session_id
      WHERE dm.study_id = $1 AND dm.metric_name = 'nav.map_correspondence' AND ${ANALYSABLE}`,
    [studyId],
  );
  const keys = ["conceptsExposed", "conceptsInspected", "relationshipsFollowed", "mapEdges", "reconstructedCorrect", "reconstructedIncorrect", "correctAndFollowed", "correctWithBothEndpointsInspected", "incorrectWithBothEndpointsInspected"] as const;
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

/**
 * First-order transition matrices between knowledge categories of consecutive concept visits
 * (visit = exposure interval; ../metrics/navigation.ts), per condition.
 */
export async function transitionMatrices(q: Q, studyId: string): Promise<TransitionMatrix[]> {
  const sess = await q.query<{ id: string; condition_id: string; snapshot_id: string | null }>(
    `SELECT ss.id, ss.condition_id, ss.snapshot_id FROM study_sessions ss WHERE ss.study_id = $1 AND ${ANALYSABLE}`,
    [studyId],
  );
  const labels = [...KNOWLEDGE_CATEGORY_CODES];
  const index = new Map(labels.map((l, i) => [l, i]));
  const out = new Map<string, TransitionMatrix>();
  for (const s of sess.rows) {
    if (!s.snapshot_id) continue;
    const facts = await loadSnapshotFacts(q, s.snapshot_id);
    const ev = await q.query<NavEvent>(
      `SELECT seq, event_type_code AS type, concept_id AS "conceptId" FROM telemetry_events WHERE session_id = $1 AND event_type_code = 'exposure_started' ORDER BY seq`,
      [s.id],
    );
    const m = out.get(s.condition_id) ?? out.set(s.condition_id, { conditionId: s.condition_id, labels, counts: labels.map(() => labels.map(() => 0)), sessions: 0, transitions: 0 }).get(s.condition_id)!;
    m.sessions++;
    const visits = visitSequence(ev.rows);
    for (let i = 1; i < visits.length; i++) {
      const a = index.get(facts.concepts.get(visits[i - 1]!.conceptId)?.category as never);
      const b = index.get(facts.concepts.get(visits[i]!.conceptId)?.category as never);
      if (a === undefined || b === undefined) continue;
      m.counts[a]![b]!++;
      m.transitions++;
    }
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

/** Interaction timeline of one session: ms since its first event (client clock, ordered by seq). */
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
