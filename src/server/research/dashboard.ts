import { createHash } from "node:crypto";

import { describe, type Descriptives } from "@/features/research/descriptive";
import { DASHBOARD_METRICS_VERSION, metricDefinition, metricRole, metricVersionHeader, PRE_TEST_COVARIATE, PRIMARY_OUTCOMES } from "@/features/research/metric-definitions";
import { numericAnswer, SCALES, scoreScale } from "@/features/research/scale-scores";

import { ANALYSIS_REFERENCES_SQL } from "./analysis-reference";
import { isAnalysable } from "./analysis-scope";
import { studyConditions, type ConditionRef } from "./analytics";
import { fullTelemetry, refreshRollups, type SessionTelemetry } from "./dashboard-rollups";
import { queryAll, type Q } from "./db";
import { toCsv } from "./exports/csv";
import { DASHBOARD_TABLE_BY_NAME, type DashboardTableName } from "./exports/dictionary";

const MAP_METRIC = "cmap.recall.dl";
export const SECONDARY_METRICS = [MAP_METRIC, "cmap.recall.du", "cmap.precision.dl", "cmap.edges_drawn", "cmap.incorrect_relationships", "cmap.f1.dl", "cmap.cross_category.valid_normalised", "cmap.valid_relationships"] as const;
const STORED_MAP_METRICS = SECONDARY_METRICS.filter((m) => m !== "cmap.edges_drawn");
const TEST_METRICS = [PRE_TEST_COVARIATE.metric, ...PRIMARY_OUTCOMES];
const TEST_PHASES = ["post", "follow_up"] as const;

export interface DashboardStudy {
  id: string;
  slug: string;
  title: string;
  status: string;
  isDemo: boolean;
  nonExperimental: boolean;
  snapshotId: string | null;
}

interface ConditionStats {
  conditionId: string;
  stats: Descriptives;
  values: number[];
}

export interface MeasureRow {
  key: string;
  version: string;
  phase: string;
  label?: string;
  byCondition: ConditionStats[];
}

interface AncovaRow {
  participantCode: string;
  conditionCode: string;
  conditionInterface: string;
  stratum: string | null;
  preTest: number | null;
  sequence: number | null;
  sequenceDelayed: number | null;
  stagePlacement: number | null;
  stagePlacementDelayed: number | null;
  sessionId: string;
}

export interface SessionTelemetryRow {
  sessionId: string;
  participantCode: string;
  conditionId: string;
  status: string;
  events: number;
  stageMs: number;
  stopsVisited: number;
  revisits: number;
  backSteps: number;
  sourcesOpened: number;
  pauseMs: number;
}

interface QualityData {
  sessionsByStatus: { conditionId: string | null; status: string; n: number }[];
  sequence: { kind: string; open: number; resolved: number; missingSeq: number }[];
  quarantine: { reason: string; n: number; unresolved: number }[];
  duplicates: number;
  interruptedSessions: number;
  interruptions: number;
  deviceCheckNotPassed: { verdict: string; n: number }[];
  webglFailures: { step: string; n: number }[];
  clientErrors: number;
  excluded: { category: string; n: number }[];
  withdrawn: number;
  completedWithoutTelemetry: number;
}

export interface DashboardData {
  generatedAt: string;
  study: DashboardStudy;
  conditions: ConditionRef[];
  sessionsTotal: number;
  sessionsInScope: number;
  primary: { summary: MeasureRow[]; ancova: AncovaRow[] };
  secondary: MeasureRow[];
  knowledge: MeasureRow[];
  questionnaires: MeasureRow[];
  telemetry: { summary: MeasureRow[]; sessions: SessionTelemetryRow[] };
  quality: QualityData;
  fingerprint: string;
}

export async function dashboardStudy(q: Q, studyId: string): Promise<DashboardStudy | null> {
  const r = await q.query<DashboardStudy>(
    `SELECT id, slug, title, status::text AS status, is_demo AS "isDemo",
            (is_demo OR coalesce((config->>'nonExperimental')::boolean, false)) AS "nonExperimental", snapshot_id AS "snapshotId"
       FROM studies WHERE id = $1`,
    [studyId],
  );
  return r.rows[0] ?? null;
}

export async function dashboardFingerprint(q: Q, studyId: string): Promise<{ serverTime: string; fingerprint: string }> {
  const r = await q.query<Record<string, string | null>>(
    `WITH s AS (SELECT id, status, excluded, withdrawn, interrupted, interruption_count, condition_id, device->'check'->>'verdict' AS v
                  FROM study_sessions WHERE study_id = $1)
     SELECT to_json(now())#>>'{}' AS server_time,
            (SELECT max(server_ts) FROM telemetry_events WHERE study_id = $1)::text AS events,
            (SELECT md5(coalesce(string_agg(concat_ws(',', id, status, excluded, withdrawn, interrupted, interruption_count, condition_id, v), ';' ORDER BY id), '')) FROM s) AS sessions,
            (SELECT md5(coalesce(string_agg(concat_ws(',', code, status, stratum), ';' ORDER BY code), '')) FROM participants WHERE study_id = $1) AS participants,
            (SELECT concat_ws('|', max(x.b), max(x.q), max(x.qr), max(x.g), max(x.gr), sum(x.gn), max(x.d), max(x.r), max(x.m))
               FROM s, LATERAL (SELECT
                 (SELECT max(received_at) FROM telemetry_batches WHERE session_id = s.id) AS b,
                 (SELECT max(received_at) FROM telemetry_quarantine WHERE session_id = s.id) AS q,
                 (SELECT max(resolved_at) FROM telemetry_quarantine WHERE session_id = s.id) AS qr,
                 (SELECT max(detected_at) FROM sequence_gaps WHERE session_id = s.id) AS g,
                 (SELECT max(resolved_at) FROM sequence_gaps WHERE session_id = s.id) AS gr,
                 (SELECT count(*) FROM sequence_gaps WHERE session_id = s.id) AS gn,
                 (SELECT max(computed_at) FROM derived_scores WHERE session_id = s.id) AS d,
                 (SELECT max(server_received_at) FROM responses WHERE session_id = s.id) AS r,
                 (SELECT max(coalesce(submitted_at, started_at)) FROM concept_maps WHERE session_id = s.id AND is_final) AS m) x) AS per_session`,
    [studyId],
  );
  const row = r.rows[0]!;
  const { server_time: serverTime, ...parts } = row;
  return { serverTime: serverTime!, fingerprint: createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16) };
}

const category = (reason: string | null) => (reason ?? "unspecified").split(":")[0]!.trim() || "unspecified";

function byCondition(conditions: ConditionRef[], values: Map<string, (number | null)[]>): ConditionStats[] {
  return conditions.map((c) => {
    const v = values.get(c.id) ?? [];
    return { conditionId: c.id, stats: describe(v), values: v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) };
  });
}

function push<K>(m: Map<K, (number | null)[]>, k: K, v: number | null) {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
}

interface SessionRow {
  id: string;
  participantCode: string;
  conditionId: string | null;
  period: number;
  status: string;
  excluded: boolean;
  exclusionReason: string | null;
  withdrawn: boolean;
  interrupted: boolean;
  interruptionCount: number;
  verdict: string | null;
  duplicates: number;
}

export interface LoadOptions {
  telemetry?: "rollup" | "full";
  fingerprint?: { serverTime: string; fingerprint: string };
}

type TestPhase = "pre" | (typeof TEST_PHASES)[number];

export async function loadDashboard(q: Q, studyId: string, opts: LoadOptions = {}): Promise<DashboardData | null> {
  const study = await dashboardStudy(q, studyId);
  if (!study) return null;
  const fp = opts.fingerprint ?? (await dashboardFingerprint(q, studyId));
  const [conditions, sessionRows, strata, testScores, mapScores, edges, keyed, rubric, answers, gaps, quarantine, webglFailures] = await queryAll(q, [
    () => studyConditions(q, studyId),
    () => q.query<SessionRow>(
      `SELECT ss.id, p.code AS "participantCode", ss.condition_id AS "conditionId", ss.period, ss.status::text AS status, ss.excluded,
              ss.exclusion_reason AS "exclusionReason", ss.withdrawn, ss.interrupted, ss.interruption_count AS "interruptionCount",
              ss.device->'check'->>'verdict' AS verdict,
              ((SELECT count(*) FROM sequence_gaps g WHERE g.session_id = ss.id AND g.kind = 'duplicate')
                + coalesce((SELECT sum(tb.duplicate_count) FROM telemetry_batches tb WHERE tb.session_id = ss.id AND tb.duplicate_count > 0), 0))::int AS duplicates
         FROM study_sessions ss JOIN participants p ON p.id = ss.participant_id
        WHERE ss.study_id = $1`,
      [studyId],
    ),
    () => q.query<{ id: string; code: string; stratum: string | null }>(
      `SELECT p.id, p.code, coalesce((SELECT a.stratum FROM allocations a WHERE a.participant_id = p.id ORDER BY a.period DESC, a.allocated_at DESC LIMIT 1), p.stratum) AS stratum
         FROM participants p WHERE p.study_id = $1`,
      [studyId],
    ),
    () => q.query<{ participant_id: string; metric_name: string; phase: TestPhase; value: number | null }>(
      `SELECT DISTINCT ON (ds.participant_id, ds.metric_name, x.phase) ds.participant_id, ds.metric_name, x.phase, ds.value
         FROM study_sessions ss
         JOIN derived_scores ds ON ds.session_id = ss.id
         CROSS JOIN LATERAL (SELECT coalesce(
                CASE ds.details->>'step' WHEN 'pre_test' THEN 'pre' WHEN 'post_test' THEN 'post' WHEN 'delayed_test' THEN 'follow_up' END,
                (SELECT sa.phase::text FROM study_assessments sa WHERE sa.study_id = ss.study_id AND sa.assessment_id = ds.assessment_id ORDER BY sa.phase LIMIT 1)) AS phase) x
        WHERE ss.study_id = $1 AND ds.metric_name = ANY($2::text[]) AND ds.metric_version = ANY($3::text[]) AND x.phase IN ('pre', 'post', 'follow_up')
        ORDER BY ds.participant_id, ds.metric_name, x.phase, ds.computed_at DESC`,
      [studyId, TEST_METRICS, [...new Set(TEST_METRICS.map((m) => metricDefinition(m).version))]],
    ),
    () => q.query<{ session_id: string; participant_id: string; phase: "pre" | "post"; metric_name: string; value: number | null }>(
      `WITH ar AS (${ANALYSIS_REFERENCES_SQL})
       SELECT DISTINCT ON (ds.concept_map_id, ds.metric_name) ds.session_id, ss.participant_id, cm.phase::text AS phase, ds.metric_name, ds.value
         FROM study_sessions ss
         JOIN derived_scores ds ON ds.session_id = ss.id
         JOIN concept_maps cm ON cm.id = ds.concept_map_id AND cm.is_final
         LEFT JOIN ar ON ar.assessment_id = ds.assessment_id
        WHERE ss.study_id = $1 AND (ds.metric_name, ds.metric_version) IN (SELECT * FROM unnest($2::text[], $3::text[]))
          AND ds.reference_map_id IS NOT DISTINCT FROM ar.reference_map_id
        ORDER BY ds.concept_map_id, ds.metric_name, ds.computed_at DESC`,
      [studyId, STORED_MAP_METRICS, STORED_MAP_METRICS.map((m) => metricDefinition(m).version)],
    ),
    () => q.query<{ session_id: string; participant_id: string; phase: "pre" | "post"; n: number }>(
      `SELECT cm.session_id, cm.participant_id, cm.phase::text AS phase, (SELECT count(*)::int FROM concept_map_edges e WHERE e.concept_map_id = cm.id) AS n
         FROM study_sessions ss JOIN concept_maps cm ON cm.session_id = ss.id AND cm.is_final
        WHERE ss.study_id = $1 AND EXISTS (SELECT 1 FROM derived_scores d WHERE d.session_id = cm.session_id AND d.concept_map_id = cm.id AND d.metric_name = $2)`,
      [studyId, MAP_METRIC],
    ),
    () => q.query<{ session_id: string; code: string; version: number; kind: string; value: number | null }>(
      `SELECT DISTINCT ON (ds.session_id, ds.assessment_id) ds.session_id, a.code, a.version, a.kind::text AS kind, ds.value
         FROM study_sessions ss JOIN derived_scores ds ON ds.session_id = ss.id JOIN assessments a ON a.id = ds.assessment_id
        WHERE ss.study_id = $1 AND ds.metric_name = $2
        ORDER BY ds.session_id, ds.assessment_id, ds.computed_at DESC`,
      [studyId, metricDefinition("assessment.key_match_total").key],
    ),
    () => q.query<{ session_id: string; code: string; version: number; kind: string; value: number }>(
      `SELECT ds.session_id, a.code, a.version, a.kind::text AS kind, avg(ds.value)::float8 AS value
         FROM study_sessions ss JOIN derived_scores ds ON ds.session_id = ss.id JOIN assessments a ON a.id = ds.assessment_id
        WHERE ss.study_id = $1 AND ds.metric_name LIKE 'rubric.rating.r%' AND ds.value IS NOT NULL
        GROUP BY ds.session_id, a.code, a.version, a.kind`,
      [studyId],
    ),
    () => q.query<{ session_id: string; code: string; attempt: number; item_key: string; raw: unknown; step: string | null }>(
      `SELECT r.session_id, a.code, r.attempt, i.item_key, r.raw,
              (SELECT al.after->>'step' FROM audit_log al
                WHERE al.entity = 'study_session' AND al.entity_id = r.session_id::text AND al.action = 'study.assessment_submitted'
                  AND al.after->>'assessmentId' = r.assessment_id::text AND (al.after->>'attempt')::int = r.attempt
                LIMIT 1) AS step
         FROM study_sessions ss
         JOIN responses r ON r.session_id = ss.id AND r.status = 'answered'
         JOIN assessments a ON a.id = r.assessment_id AND a.kind = 'questionnaire'
         JOIN assessment_items i ON i.id = r.item_id
        WHERE ss.study_id = $1 AND a.code = ANY($2::text[])`,
      [studyId, [...new Set(SCALES.map((s) => s.instrument))]],
    ),
    () => q.query<{ kind: string; open: number; resolved: number; missing: number }>(
      `SELECT g.kind::text AS kind, count(*) FILTER (WHERE g.resolved_at IS NULL)::int AS open, count(*) FILTER (WHERE g.resolved_at IS NOT NULL)::int AS resolved,
              coalesce(sum(g.to_seq - g.from_seq + 1) FILTER (WHERE g.resolved_at IS NULL AND g.kind = 'gap'), 0)::int AS missing
         FROM study_sessions ss JOIN sequence_gaps g ON g.session_id = ss.id WHERE ss.study_id = $1 GROUP BY 1 ORDER BY 1`,
      [studyId],
    ),
    () => q.query<{ reason: string; n: number; unresolved: number }>(
      `SELECT split_part(tq.reason, ':', 1) AS reason, count(*)::int AS n, count(*) FILTER (WHERE tq.resolved_at IS NULL)::int AS unresolved
         FROM study_sessions ss JOIN telemetry_quarantine tq ON tq.session_id = ss.id WHERE ss.study_id = $1 GROUP BY 1 ORDER BY 1`,
      [studyId],
    ),
    () => q.query<{ step: string; n: number }>(
      `SELECT coalesce(al.after->>'step', 'unrecorded') AS step, count(*)::int AS n
         FROM study_sessions ss JOIN audit_log al ON al.entity = 'study_session' AND al.entity_id = ss.id::text AND al.action = 'study.webgl_failed'
        WHERE ss.study_id = $1 GROUP BY 1 ORDER BY 1`,
      [studyId],
    ),
  ]);

  const sessions = sessionRows.rows;
  const sessionInfo = new Map<string, SessionRow & { inScope: boolean }>();
  for (const s of sessions) {
    sessionInfo.set(s.id, { ...s, inScope: s.conditionId !== null && isAnalysable({ excluded: s.excluded, withdrawn: s.withdrawn, nonExperimental: false }) });
  }
  const inScope = (sessionId: string) => sessionInfo.get(sessionId)?.inScope ?? false;
  const conditionOf = (sessionId: string) => sessionInfo.get(sessionId)?.conditionId ?? null;

  const codeOfParticipant = new Map(strata.rows.map((p) => [p.id, p.code]));
  const idOfCode = new Map(strata.rows.map((p) => [p.code, p.id]));
  const participantSessions = new Map<string, string>();
  for (const s of [...sessions].sort((a, b) => a.period - b.period)) {
    const pid = idOfCode.get(s.participantCode);
    if (pid && sessionInfo.get(s.id)?.conditionId) participantSessions.set(pid, s.id);
  }
  const analysedSessionOf = (sessionId: string): string | null => {
    const code = sessionInfo.get(sessionId)?.participantCode;
    const pid = code === undefined ? undefined : idOfCode.get(code);
    const analysed = pid === undefined ? undefined : participantSessions.get(pid);
    return analysed && inScope(analysed) ? analysed : null;
  };
  const strataByCode = new Map(strata.rows.map((r) => [r.code, r.stratum]));

  const testsByParticipant = new Map<string, Map<string, number | null>>();
  for (const r of testScores.rows) {
    const scores = testsByParticipant.get(r.participant_id) ?? testsByParticipant.set(r.participant_id, new Map()).get(r.participant_id)!;
    scores.set(`${r.metric_name}|${r.phase}`, r.value === null ? null : Number(r.value));
  }
  const primaryCells: { key: string; phase: TestPhase; label?: string }[] = [
    { key: PRE_TEST_COVARIATE.metric, phase: PRE_TEST_COVARIATE.phase, label: "covariate" },
    ...PRIMARY_OUTCOMES.flatMap((key) => TEST_PHASES.map((phase) => ({ key, phase }))),
  ];
  const primaryVals = new Map(primaryCells.map((cell) => [`${cell.key}|${cell.phase}`, new Map<string, (number | null)[]>()]));
  const ancova: AncovaRow[] = [];
  for (const [pid, scores] of testsByParticipant) {
    const sessionId = participantSessions.get(pid);
    if (!sessionId || !inScope(sessionId)) continue;
    const cid = conditionOf(sessionId)!;
    for (const [id, value] of scores) {
      const vals = primaryVals.get(id);
      if (vals) push(vals, cid, value);
    }
    const score = (key: string, phase: TestPhase) => scores.get(`${key}|${phase}`) ?? null;
    const cond = conditions.find((c) => c.id === cid)!;
    const code = codeOfParticipant.get(pid) ?? "";
    ancova.push({
      participantCode: code,
      conditionCode: cond.code,
      conditionInterface: cond.interface,
      stratum: strataByCode.get(code) ?? null,
      preTest: score(PRE_TEST_COVARIATE.metric, "pre"),
      sequence: score("test.sequence", "post"),
      sequenceDelayed: score("test.sequence", "follow_up"),
      stagePlacement: score("test.stage_placement", "post"),
      stagePlacementDelayed: score("test.stage_placement", "follow_up"),
      sessionId,
    });
  }
  ancova.sort((a, b) => (a.participantCode < b.participantCode ? -1 : a.participantCode > b.participantCode ? 1 : 0));
  const primarySummary: MeasureRow[] = primaryCells.map((cell) => ({
    key: cell.key,
    version: metricDefinition(cell.key).version,
    phase: cell.phase,
    ...(cell.label ? { label: cell.label } : {}),
    byCondition: byCondition(conditions, primaryVals.get(`${cell.key}|${cell.phase}`)!),
  }));

  const mapsByParticipant = new Map<string, Record<string, { pre?: number | null; post?: number | null }>>();
  for (const r of mapScores.rows) {
    const m = mapsByParticipant.get(r.participant_id) ?? mapsByParticipant.set(r.participant_id, {}).get(r.participant_id)!;
    (m[r.metric_name] ??= {})[r.phase] = r.value === null ? null : Number(r.value);
  }
  for (const r of edges.rows) {
    const m = mapsByParticipant.get(r.participant_id) ?? mapsByParticipant.set(r.participant_id, {}).get(r.participant_id)!;
    (m["cmap.edges_drawn"] ??= {})[r.phase] = r.n;
  }
  const secondaryVals = new Map<string, Map<string, (number | null)[]>>();
  for (const [pid, metrics] of mapsByParticipant) {
    const sessionId = participantSessions.get(pid);
    if (!sessionId || !inScope(sessionId)) continue;
    const cid = conditionOf(sessionId)!;
    for (const key of SECONDARY_METRICS) {
      const m = metrics[key];
      if (!m) continue;
      for (const phase of ["pre", "post"] as const) {
        const value = m[phase];
        if (value === undefined) continue;
        const k = `${key}|${phase}`;
        push(secondaryVals.get(k) ?? secondaryVals.set(k, new Map()).get(k)!, cid, value);
      }
    }
  }
  const secondary: MeasureRow[] = SECONDARY_METRICS.flatMap((key) =>
    (["pre", "post"] as const).flatMap((phase) => {
      const vals = secondaryVals.get(`${key}|${phase}`);
      return vals ? [{ key, version: metricDefinition(key).version, phase, byCondition: byCondition(conditions, vals) }] : [];
    }),
  );

  const knowledgeVals = new Map<string, { row: Omit<MeasureRow, "byCondition">; vals: Map<string, (number | null)[]> }>();
  const addKnowledge = (key: string, r: { session_id: string; code: string; version: number; kind: string; value: number | null }) => {
    const analysed = analysedSessionOf(r.session_id);
    if (!analysed) return;
    const phase = r.kind === "pretest" ? "pre" : "post";
    const id = `${key}|${r.code}@${r.version}`;
    const e = knowledgeVals.get(id) ?? knowledgeVals.set(id, { row: { key, version: metricDefinition(key).version, phase, label: `${r.code} v${r.version} (${r.kind})` }, vals: new Map() }).get(id)!;
    push(e.vals, conditionOf(analysed)!, r.value === null ? null : Number(r.value));
  };
  keyed.rows.forEach((r) => addKnowledge("assessment.key_match_total", r));
  rubric.rows.forEach((r) => addKnowledge("rubric.rating.mean", r));
  const kindOrder = (label = "") => (label.includes("(pretest)") ? 0 : label.includes("(posttest)") ? 1 : 2);
  const knowledge = [...knowledgeVals.values()]
    .map((e) => ({ ...e.row, byCondition: byCondition(conditions, e.vals) }))
    .sort((a, b) => kindOrder(a.label) - kindOrder(b.label) || (a.key < b.key ? -1 : 1) || ((a.label ?? "") < (b.label ?? "") ? -1 : 1));

  const administrations = new Map<string, { analysed: string; step: string | null; attempt: number; code: string; items: Map<string, number | null> }>();
  for (const r of answers.rows) {
    const analysed = analysedSessionOf(r.session_id);
    if (!analysed) continue;
    const k = `${r.session_id}|${r.code}|${r.attempt}`;
    const a = administrations.get(k) ?? administrations.set(k, { analysed, step: r.step, attempt: r.attempt, code: r.code, items: new Map() }).get(k)!;
    a.items.set(r.item_key, numericAnswer(r.raw));
  }
  const qVals = new Map<string, Map<string, (number | null)[]>>();
  for (const { analysed, step, attempt, code, items } of administrations.values()) {
    const iface = conditions.find((c) => c.id === conditionOf(analysed))?.interface;
    for (const spec of SCALES.filter((s) => s.instrument === code)) {
      if (spec.interfaces && !spec.interfaces.includes(iface as never)) continue;
      const ssqPhase = step === "questionnaire_pre" ? "pre" : step === "questionnaire_post_learning" ? "post" : step ? null : attempt === 1 ? "pre" : attempt === 2 ? "post" : null;
      const phase = spec.instrument === "ssq" ? ssqPhase : attempt === 1 ? "session" : null;
      if (!phase) continue;
      const id = `${spec.name}|${phase}`;
      push(qVals.get(id) ?? qVals.set(id, new Map()).get(id)!, conditionOf(analysed)!, scoreScale(spec, items));
    }
  }
  const questionnaires: MeasureRow[] = SCALES.flatMap((spec) =>
    (spec.instrument === "ssq" ? ["pre", "post"] : ["session"]).flatMap((phase) => {
      const vals = qVals.get(`${spec.name}|${phase}`);
      const conds = spec.interfaces ? conditions.filter((c) => spec.interfaces!.includes(c.interface as never)) : conditions;
      return vals ? [{ key: spec.name, version: metricDefinition(spec.name).version, phase, byCondition: byCondition(conds, vals) }] : [];
    }),
  );

  const allocated = sessions.filter((x) => x.conditionId !== null).map((x) => ({ id: x.id, status: x.status }));
  const telemetryBySession: Map<string, SessionTelemetry> = opts.telemetry === "full" ? await fullTelemetry(q, allocated) : (await refreshRollups(q, studyId, allocated)).bySession;
  const empty: SessionTelemetry = { eventCount: 0, lastSeq: -1, stageMs: 0, stopsVisited: 0, revisits: 0, backSteps: 0, sourcesOpened: 0, pauseMs: 0, clientErrors: 0 };
  const tel = (id: string) => telemetryBySession.get(id) ?? empty;
  let clientErrors = 0;
  for (const t of telemetryBySession.values()) clientErrors += t.clientErrors;
  const telemetrySessions: SessionTelemetryRow[] = [];
  for (const s of sessionInfo.values()) {
    if (!s.inScope || !s.conditionId || analysedSessionOf(s.id) !== s.id) continue;
    const t = tel(s.id);
    telemetrySessions.push({
      sessionId: s.id,
      participantCode: s.participantCode,
      conditionId: s.conditionId,
      status: s.status,
      events: t.eventCount,
      stageMs: t.stageMs,
      stopsVisited: t.stopsVisited,
      revisits: t.revisits,
      backSteps: t.backSteps,
      sourcesOpened: t.sourcesOpened,
      pauseMs: t.pauseMs,
    });
  }
  telemetrySessions.sort((a, b) => (a.participantCode < b.participantCode ? -1 : a.participantCode > b.participantCode ? 1 : 0));
  const tMeasure = (key: string, pick: (r: SessionTelemetryRow) => number, scale = 1): MeasureRow => {
    const vals = new Map<string, (number | null)[]>();
    for (const r of telemetrySessions) push(vals, r.conditionId, pick(r) / scale);
    return { key, version: metricDefinition(key).version, phase: "session", byCondition: byCondition(conditions, vals) };
  };
  const telemetrySummary = telemetrySessions.length
    ? [
        tMeasure("stage.total_ms", (r) => r.stageMs, 60_000),
        tMeasure("time.pause_ms", (r) => r.pauseMs, 60_000),
        tMeasure("stage.stops_visited", (r) => r.stopsVisited),
        tMeasure("stage.revisits", (r) => r.revisits),
        tMeasure("stage.back_steps", (r) => r.backSteps),
        tMeasure("stage.sources_opened", (r) => r.sourcesOpened),
        tMeasure("telemetry.events", (r) => r.events),
      ]
    : [];

  const all = [...sessionInfo.values()];
  const verdicts = new Map<string, number>();
  for (const s of all) {
    if (s.verdict && s.verdict !== "passed") verdicts.set(s.verdict, (verdicts.get(s.verdict) ?? 0) + 1);
  }
  const byStatus = new Map<string, { conditionId: string | null; status: string; n: number }>();
  for (const s of all) {
    const k = `${s.conditionId}|${s.status}`;
    const e = byStatus.get(k) ?? byStatus.set(k, { conditionId: s.conditionId, status: s.status, n: 0 }).get(k)!;
    e.n++;
  }
  const excludedBy = new Map<string, number>();
  for (const s of all.filter((x) => x.excluded)) excludedBy.set(category(s.exclusionReason), (excludedBy.get(category(s.exclusionReason)) ?? 0) + 1);
  const quality: QualityData = {
    sessionsByStatus: [...byStatus.values()],
    sequence: gaps.rows.map((g) => ({ kind: g.kind, open: g.open, resolved: g.resolved, missingSeq: g.missing })),
    quarantine: quarantine.rows,
    duplicates: all.reduce((n, s) => n + s.duplicates, 0),
    interruptedSessions: all.filter((s) => s.interrupted).length,
    interruptions: all.reduce((n, s) => n + s.interruptionCount, 0),
    deviceCheckNotPassed: [...verdicts].map(([verdict, n]) => ({ verdict, n })).sort((a, b) => (a.verdict < b.verdict ? -1 : 1)),
    webglFailures: webglFailures.rows,
    clientErrors,
    excluded: [...excludedBy].map(([c, n]) => ({ category: c, n })).sort((a, b) => (a.category < b.category ? -1 : 1)),
    withdrawn: all.filter((s) => s.withdrawn).length,
    completedWithoutTelemetry: all.filter((s) => s.status === "completed" && tel(s.id).eventCount === 0).length,
  };

  return {
    generatedAt: fp.serverTime,
    study,
    conditions,
    sessionsTotal: sessions.length,
    sessionsInScope: all.filter((s) => s.inScope).length,
    primary: { summary: primarySummary, ancova },
    secondary,
    knowledge,
    questionnaires,
    telemetry: { summary: telemetrySummary, sessions: telemetrySessions },
    quality,
    fingerprint: fp.fingerprint,
  };
}

const round = (v: number | null, digits = 6) => (v === null ? null : Number(v.toFixed(digits)));

function summaryRows(section: string, rows: MeasureRow[], conditions: ConditionRef[]) {
  return rows.flatMap((m) =>
    m.byCondition.map((c) => {
      const cond = conditions.find((x) => x.id === c.conditionId)!;
      return {
        section,
        metric: m.key,
        metric_version: m.version,
        role: metricRole(m.key),
        phase: m.phase,
        qualifier: m.label ?? null,
        condition_code: cond.code,
        condition_interface: cond.interface,
        n: c.stats.n,
        missing: c.stats.missing,
        mean: round(c.stats.mean),
        sd: round(c.stats.sd),
        median: round(c.stats.median),
        ci95_low: round(c.stats.ciLow),
        ci95_high: round(c.stats.ciHigh),
      };
    }),
  );
}

const TELEMETRY_SESSION_METRICS = ["telemetry.events", "stage.total_ms", "stage.stops_visited", "stage.revisits", "stage.back_steps", "stage.sources_opened", "time.pause_ms"];

function dashboardTableRows(data: DashboardData, table: DashboardTableName): { rows: Record<string, unknown>[]; metrics: string[] } {
  const cond = (id: string | null) => data.conditions.find((c) => c.id === id);
  switch (table) {
    case "dashboard_primary":
      return { rows: summaryRows("primary", data.primary.summary, data.conditions), metrics: [...TEST_METRICS] };
    case "dashboard_primary_ancova":
      return {
        rows: data.primary.ancova.map((r) => ({
          participant_code: r.participantCode,
          condition_code: r.conditionCode,
          condition_interface: r.conditionInterface,
          stratum: r.stratum,
          pre_test: r.preTest,
          sequence_immediate: r.sequence,
          sequence_delayed: r.sequenceDelayed,
          stage_placement_immediate: r.stagePlacement,
          stage_placement_delayed: r.stagePlacementDelayed,
        })),
        metrics: [...TEST_METRICS],
      };
    case "dashboard_secondary":
      return { rows: summaryRows("secondary", data.secondary, data.conditions), metrics: [...SECONDARY_METRICS] };
    case "dashboard_knowledge":
      return { rows: summaryRows("knowledge", data.knowledge, data.conditions), metrics: ["assessment.key_match_total", "rubric.rating.mean"] };
    case "dashboard_questionnaires":
      return { rows: summaryRows("questionnaire", data.questionnaires, data.conditions), metrics: SCALES.map((s) => s.name) };
    case "dashboard_telemetry":
      return { rows: summaryRows("telemetry", data.telemetry.summary, data.conditions), metrics: data.telemetry.summary.map((m) => m.key) };
    case "dashboard_telemetry_sessions":
      return {
        rows: data.telemetry.sessions.map((r) => ({
          participant_code: r.participantCode,
          session_id: r.sessionId,
          condition_code: cond(r.conditionId)?.code ?? null,
          status: r.status,
          events: r.events,
          stage_ms: r.stageMs,
          stops_visited: r.stopsVisited,
          revisits: r.revisits,
          back_steps: r.backSteps,
          sources_opened: r.sourcesOpened,
          pause_ms: r.pauseMs,
        })),
        metrics: TELEMETRY_SESSION_METRICS,
      };
    case "dashboard_quality": {
      const q = data.quality;
      const rows: { check: string; detail: string; condition_code: string | null; n: number }[] = [
        ...q.sessionsByStatus.map((s) => ({ check: "sessions_by_status", detail: s.status, condition_code: cond(s.conditionId)?.code ?? "unallocated", n: s.n })),
        ...q.sequence.flatMap((g) => [
          { check: "sequence_anomalies_open", detail: g.kind, condition_code: null, n: g.open },
          { check: "sequence_anomalies_resolved", detail: g.kind, condition_code: null, n: g.resolved },
          ...(g.kind === "gap" ? [{ check: "missing_seq_numbers", detail: "open gaps", condition_code: null, n: g.missingSeq }] : []),
        ]),
        ...q.quarantine.map((x) => ({ check: "quarantined_events", detail: x.reason, condition_code: null, n: x.n })),
        { check: "duplicate_uploads", detail: "", condition_code: null, n: q.duplicates },
        { check: "interrupted_sessions", detail: "", condition_code: null, n: q.interruptedSessions },
        { check: "interruptions", detail: "", condition_code: null, n: q.interruptions },
        ...q.deviceCheckNotPassed.map((d) => ({ check: "device_check_not_passed", detail: d.verdict, condition_code: null, n: d.n })),
        ...q.webglFailures.map((w) => ({ check: "webgl_failures", detail: w.step, condition_code: null, n: w.n })),
        { check: "client_error_events", detail: "", condition_code: null, n: q.clientErrors },
        ...q.excluded.map((e) => ({ check: "excluded_sessions", detail: e.category, condition_code: null, n: e.n })),
        { check: "withdrawn_sessions", detail: "", condition_code: null, n: q.withdrawn },
        { check: "completed_without_telemetry", detail: "", condition_code: null, n: q.completedWithoutTelemetry },
      ];
      return { rows, metrics: ["quality.sequence_gaps", "quality.quarantine", "quality.duplicates", "quality.interruptions", "quality.device_failures", "quality.exclusions"] };
    }
  }
}

export function dashboardTableCsv(data: DashboardData, table: DashboardTableName): string {
  const spec = DASHBOARD_TABLE_BY_NAME.get(table)!;
  const { rows, metrics } = dashboardTableRows(data, table);
  const header = [
    `# immersive-episteme dashboard table ${table}`,
    `study=${data.study.slug}`,
    `non_experimental=${data.study.nonExperimental}`,
    `generated_at=${data.generatedAt}`,
    `dashboard_version=${DASHBOARD_METRICS_VERSION}`,
    `metric versions: ${metricVersionHeader(metrics)}`,
  ].join("; ");
  return `${header}\r\n${toCsv(rows, spec.columns.map((c) => c.name))}`;
}
