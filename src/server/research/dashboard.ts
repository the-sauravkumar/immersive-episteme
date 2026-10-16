/**
 * Research dashboard read model (/research/dashboard): scores, telemetry and data quality of ONE
 * study, read live from the database on every call (nothing cached; the dashboard must never
 * show stale data). Descriptive only; the inferential analysis is analysis/episteme_stats.
 *
 * Reuses the existing services instead of parallel data layers:
 *  - conditions: studyConditions (./analytics.ts);
 *  - time accounting: computeTimingMetrics (src/features/telemetry/metrics.ts) through the
 *    per-session rollups (./dashboard-rollups.ts): only sessions with new events are re-read, so
 *    a refresh costs O(sessions + events of changed sessions), not O(all events);
 *  - the study snapshot's concept set: loadSnapshotFacts (./metrics/pipeline.ts);
 *  - scope: excluded and withdrawn sessions leave every distribution (isAnalysable,
 *    ./analysis-scope.ts); a demo / pilot study is labelled non-experimental as a whole.
 * Definitions and versions: src/features/research/metric-definitions.ts.
 *
 * Sessions are read with one indexed query (not listSessions / studyOverview, whose per-session
 * event counts scan every event); events per session come from the rollups.
 * Queries are study-scoped through indexed columns only (see dashboardFingerprint).
 */
import { createHash } from "node:crypto";

import { describe, type Descriptives } from "@/features/research/descriptive";
import { DASHBOARD_METRICS_VERSION, metricDefinition, metricRole, metricVersionHeader, PRIMARY_OUTCOME } from "@/features/research/metric-definitions";
import { numericAnswer, SCALES, scoreScale } from "@/features/research/scale-scores";

import { ANALYSIS_REFERENCES_SQL } from "./analysis-reference";
import { isAnalysable } from "./analysis-scope";
import { studyConditions, type ConditionRef } from "./analytics";
import { fullTelemetry, refreshRollups, type SessionTelemetry } from "./dashboard-rollups";
import type { Q } from "./db";
import { toCsv } from "./exports/csv";
import { DASHBOARD_TABLE_BY_NAME, type DashboardTableName } from "./exports/dictionary";
import { loadSnapshotFacts } from "./metrics/pipeline";

export const PRIMARY_METRIC = PRIMARY_OUTCOME.metric;
/**
 * The concept-map section: the D2 secondary outcomes in D2 order (SECONDARY_OUTCOMES in
 * metric-definitions.ts; edges drawn and the incorrect count are reported with precision).
 */
export const SECONDARY_METRICS = ["cmap.recall.du", "cmap.precision.dl", "cmap.edges_drawn", "cmap.incorrect_relationships", "cmap.f1.dl", "cmap.cross_category.valid_normalised", "cmap.valid_relationships"] as const;
const STORED_MAP_METRICS = [PRIMARY_METRIC, ...SECONDARY_METRICS.filter((m) => m !== "cmap.edges_drawn")];

export interface DashboardStudy {
  id: string;
  slug: string;
  title: string;
  status: string;
  isDemo: boolean;
  nonExperimental: boolean;
  snapshotId: string | null;
}

/** Descriptives of one measure per condition. */
export interface ConditionStats {
  conditionId: string;
  stats: Descriptives;
  values: number[];
}

export interface MeasureRow {
  /** Metric key (metric-definitions.ts). */
  key: string;
  version: string;
  /** pre | post | change | session | post_learning | end … */
  phase: string;
  /** Extra qualifier, e.g. the assessment code@version. */
  label?: string;
  byCondition: ConditionStats[];
}

export interface AncovaRow {
  participantCode: string;
  conditionCode: string;
  conditionInterface: string;
  stratum: string | null;
  pre: number | null;
  post: number | null;
  change: number | null;
  sessionId: string;
  referenceMapIds: string[];
}

export interface SessionTelemetryRow {
  sessionId: string;
  participantCode: string;
  conditionId: string;
  status: string;
  events: number;
  exposureMs: number;
  navigationMs: number;
  pauseMs: number;
  unterminated: number;
  conceptsExposed: number;
  coverage: number | null;
  relationshipsFollowed: number;
  citationOpens: number;
  guidanceUses: number;
}

export interface QualityData {
  sessionsByStatus: { conditionId: string | null; status: string; n: number }[];
  sequence: { kind: string; open: number; resolved: number; missingSeq: number }[];
  quarantine: { reason: string; n: number; unresolved: number }[];
  duplicates: number;
  interruptedSessions: number;
  interruptions: number;
  deviceCheckNotPassed: { verdict: string; n: number }[];
  webglContextLost: number;
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
  primary: { summary: MeasureRow[]; ancova: AncovaRow[]; referenceMaps: string[] };
  secondary: MeasureRow[];
  knowledge: MeasureRow[];
  questionnaires: MeasureRow[];
  telemetry: { summary: MeasureRow[]; sessions: SessionTelemetryRow[]; scopeConcepts: number | null };
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

/**
 * Change detector (live-update fallback poll, request-coalescing key). ONE statement; cost
 * O(log n) for telemetry_events (max(server_ts) on telemetry_events_study_server_ts_idx) and
 * O(sessions) index probes for the session-keyed tables, never a scan of a study's events:
 *  - study_sessions / participants: a hash of the fields the dashboard shows (study_sessions has
 *    no reliable updated_at: the study engine updates it with plain SQL);
 *  - per session: max(received_at) of batches and quarantine, sequence anomalies, the latest
 *    score, response and final map (indexes led by session_id).
 * max(server_ts) can miss an ingest transaction that commits after a later one; the push channel
 * (NOTIFY at commit) covers that case, and the coalescing key also carries the notification
 * generation (./dashboard-live.ts).
 */
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
  /** "rollup" (default): incremental per-session rollups; "full": recompute from all events (reference path). */
  telemetry?: "rollup" | "full";
  /** A fingerprint read by the caller just before (request coalescing); read here otherwise. */
  fingerprint?: { serverTime: string; fingerprint: string };
}

export async function loadDashboard(q: Q, studyId: string, opts: LoadOptions = {}): Promise<DashboardData | null> {
  const study = await dashboardStudy(q, studyId);
  if (!study) return null;
  // The fingerprint is read FIRST: a change committed during the load makes the next check differ.
  const fp = opts.fingerprint ?? (await dashboardFingerprint(q, studyId));
  const [conditions, sessionRows, strata, mapScores, edges, keyed, rubric, answers, gaps, quarantine] = await Promise.all([
    studyConditions(q, studyId),
    q.query<SessionRow>(
      `SELECT ss.id, p.code AS "participantCode", ss.condition_id AS "conditionId", ss.period, ss.status::text AS status, ss.excluded,
              ss.exclusion_reason AS "exclusionReason", ss.withdrawn, ss.interrupted, ss.interruption_count AS "interruptionCount",
              ss.device->'check'->>'verdict' AS verdict,
              ((SELECT count(*) FROM sequence_gaps g WHERE g.session_id = ss.id AND g.kind = 'duplicate')
                + coalesce((SELECT sum(tb.duplicate_count) FROM telemetry_batches tb WHERE tb.session_id = ss.id AND tb.duplicate_count > 0), 0))::int AS duplicates
         FROM study_sessions ss JOIN participants p ON p.id = ss.participant_id
        WHERE ss.study_id = $1`,
      [studyId],
    ),
    q.query<{ id: string; code: string; stratum: string | null }>(
      `SELECT p.id, p.code, coalesce((SELECT a.stratum FROM allocations a WHERE a.participant_id = p.id ORDER BY a.period DESC, a.allocated_at DESC LIMIT 1), p.stratum) AS stratum
         FROM participants p WHERE p.study_id = $1`,
      [studyId],
    ),
    // Only scores against the study's analysis reference map and at the scoring library's current
    // metric version (final review scoring-04): pre and post then share one expected-edge set.
    q.query<{ session_id: string; participant_id: string; phase: "pre" | "post"; metric_name: string; value: number | null; reference_map_id: string | null }>(
      `WITH ar AS (${ANALYSIS_REFERENCES_SQL})
       SELECT DISTINCT ON (ds.concept_map_id, ds.metric_name) ds.session_id, ss.participant_id, cm.phase::text AS phase, ds.metric_name, ds.value, ds.reference_map_id
         FROM study_sessions ss
         JOIN derived_scores ds ON ds.session_id = ss.id
         JOIN concept_maps cm ON cm.id = ds.concept_map_id AND cm.is_final
         LEFT JOIN ar ON ar.assessment_id = ds.assessment_id
        WHERE ss.study_id = $1 AND (ds.metric_name, ds.metric_version) IN (SELECT * FROM unnest($2::text[], $3::text[]))
          AND ds.reference_map_id IS NOT DISTINCT FROM ar.reference_map_id
        ORDER BY ds.concept_map_id, ds.metric_name, ds.computed_at DESC`,
      [studyId, STORED_MAP_METRICS, STORED_MAP_METRICS.map((m) => metricDefinition(m).version)],
    ),
    q.query<{ session_id: string; participant_id: string; phase: "pre" | "post"; n: number }>(
      `SELECT cm.session_id, cm.participant_id, cm.phase::text AS phase, (SELECT count(*)::int FROM concept_map_edges e WHERE e.concept_map_id = cm.id) AS n
         FROM study_sessions ss JOIN concept_maps cm ON cm.session_id = ss.id AND cm.is_final
        WHERE ss.study_id = $1 AND EXISTS (SELECT 1 FROM derived_scores d WHERE d.session_id = cm.session_id AND d.concept_map_id = cm.id AND d.metric_name = $2)`,
      [studyId, PRIMARY_METRIC],
    ),
    q.query<{ session_id: string; code: string; version: number; kind: string; value: number | null }>(
      `SELECT DISTINCT ON (ds.session_id, ds.assessment_id) ds.session_id, a.code, a.version, a.kind::text AS kind, ds.value
         FROM study_sessions ss JOIN derived_scores ds ON ds.session_id = ss.id JOIN assessments a ON a.id = ds.assessment_id
        WHERE ss.study_id = $1 AND ds.metric_name = $2
        ORDER BY ds.session_id, ds.assessment_id, ds.computed_at DESC`,
      [studyId, metricDefinition("assessment.key_match_total").key],
    ),
    q.query<{ session_id: string; code: string; version: number; kind: string; value: number }>(
      `SELECT ds.session_id, a.code, a.version, a.kind::text AS kind, avg(ds.value)::float8 AS value
         FROM study_sessions ss JOIN derived_scores ds ON ds.session_id = ss.id JOIN assessments a ON a.id = ds.assessment_id
        WHERE ss.study_id = $1 AND ds.metric_name LIKE 'rubric.rating.r%' AND ds.value IS NOT NULL
        GROUP BY ds.session_id, a.code, a.version, a.kind`,
      [studyId],
    ),
    // `step`: the journey step the administration was given in (the engine's
    // study.assessment_submitted journal entry); null for rows written without the engine.
    q.query<{ session_id: string; code: string; attempt: number; item_key: string; raw: unknown; step: string | null }>(
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
    q.query<{ kind: string; open: number; resolved: number; missing: number }>(
      `SELECT g.kind::text AS kind, count(*) FILTER (WHERE g.resolved_at IS NULL)::int AS open, count(*) FILTER (WHERE g.resolved_at IS NOT NULL)::int AS resolved,
              coalesce(sum(g.to_seq - g.from_seq + 1) FILTER (WHERE g.resolved_at IS NULL AND g.kind = 'gap'), 0)::int AS missing
         FROM study_sessions ss JOIN sequence_gaps g ON g.session_id = ss.id WHERE ss.study_id = $1 GROUP BY 1 ORDER BY 1`,
      [studyId],
    ),
    q.query<{ reason: string; n: number; unresolved: number }>(
      `SELECT split_part(tq.reason, ':', 1) AS reason, count(*)::int AS n, count(*) FILTER (WHERE tq.resolved_at IS NULL)::int AS unresolved
         FROM study_sessions ss JOIN telemetry_quarantine tq ON tq.session_id = ss.id WHERE ss.study_id = $1 GROUP BY 1 ORDER BY 1`,
      [studyId],
    ),
  ]);

  const sessions = sessionRows.rows;
  const sessionInfo = new Map<string, SessionRow & { inScope: boolean }>();
  for (const s of sessions) {
    // Excluded and withdrawn sessions leave every distribution; the study's demo / pilot status is a label of the whole view.
    sessionInfo.set(s.id, { ...s, inScope: s.conditionId !== null && isAnalysable({ excluded: s.excluded, withdrawn: s.withdrawn, nonExperimental: false }) });
  }
  const inScope = (sessionId: string) => sessionInfo.get(sessionId)?.inScope ?? false;
  const conditionOf = (sessionId: string) => sessionInfo.get(sessionId)?.conditionId ?? null;

  // ---- Primary and secondary (concept maps) ------------------------------------------------
  // Keyed by participant: the pre-test map is condition-blind and may sit on an earlier session
  // (reassignment after a failed device check); condition and scope come from the post session.
  type Phase = { value: number | null; sessionId: string; ref: string | null };
  const byParticipant = new Map<string, Record<string, { pre?: Phase; post?: Phase }>>();
  for (const r of mapScores.rows) {
    const m = byParticipant.get(r.participant_id) ?? byParticipant.set(r.participant_id, {}).get(r.participant_id)!;
    (m[r.metric_name] ??= {})[r.phase] = { value: r.value === null ? null : Number(r.value), sessionId: r.session_id, ref: r.reference_map_id };
  }
  for (const r of edges.rows) {
    const m = byParticipant.get(r.participant_id) ?? byParticipant.set(r.participant_id, {}).get(r.participant_id)!;
    (m["cmap.edges_drawn"] ??= {})[r.phase] = { value: r.n, sessionId: r.session_id, ref: null };
  }
  const codeOfParticipant = new Map(strata.rows.map((p) => [p.id, p.code]));
  const idOfCode = new Map(strata.rows.map((p) => [p.code, p.id]));
  // The participant's analysed session: the latest-period session with a condition.
  const participantSessions = new Map<string, string>();
  for (const s of [...sessions].sort((a, b) => a.period - b.period)) {
    const pid = idOfCode.get(s.participantCode);
    if (pid && sessionInfo.get(s.id)?.conditionId) participantSessions.set(pid, s.id);
  }
  /**
   * The analysed session of the participant who owns `sessionId` (null when out of scope).
   * Condition-blind data (SSQ before learning, the pre-test) may sit on an earlier session that a
   * reassignment closed; it belongs to the participant, analysed in the condition of their
   * analysed session, not in the closed session's condition (final review study-03).
   */
  const analysedSessionOf = (sessionId: string): string | null => {
    const code = sessionInfo.get(sessionId)?.participantCode;
    const pid = code === undefined ? undefined : idOfCode.get(code);
    const analysed = pid === undefined ? undefined : participantSessions.get(pid);
    return analysed && inScope(analysed) ? analysed : null;
  };
  const strataByCode = new Map(strata.rows.map((r) => [r.code, r.stratum]));
  const ancova: AncovaRow[] = [];
  const primaryVals = { pre: new Map<string, (number | null)[]>(), post: new Map<string, (number | null)[]>(), change: new Map<string, (number | null)[]>() };
  const secondaryVals = new Map<string, Map<string, (number | null)[]>>();
  const refs = new Set<string>();
  for (const [pid, metrics] of byParticipant) {
    const sessionId = participantSessions.get(pid);
    if (!sessionId || !inScope(sessionId)) continue;
    const cid = conditionOf(sessionId)!;
    const prim = metrics[PRIMARY_METRIC];
    if (prim) {
      let pre = prim.pre?.value ?? null;
      const post = prim.post?.value ?? null;
      const sameRef = prim.pre && prim.post ? prim.pre.ref === prim.post.ref : true;
      // Belt and braces: a pre score against another reference than the post score is never
      // paired with it (it would be a different denominator), so it is treated as missing.
      if (!sameRef) pre = null;
      const change = pre !== null && post !== null ? post - pre : null;
      const refIds = [...new Set([prim.pre?.ref, prim.post?.ref].filter((x): x is string => !!x))];
      refIds.forEach((x) => refs.add(x));
      const cond = conditions.find((c) => c.id === cid)!;
      ancova.push({ participantCode: codeOfParticipant.get(pid) ?? "", conditionCode: cond.code, conditionInterface: cond.interface, stratum: strataByCode.get(codeOfParticipant.get(pid) ?? "") ?? null, pre, post, change, sessionId, referenceMapIds: refIds });
      if (prim.pre && sameRef) push(primaryVals.pre, cid, pre);
      if (prim.post) push(primaryVals.post, cid, post);
      if (prim.pre && prim.post) push(primaryVals.change, cid, change);
    }
    for (const key of SECONDARY_METRICS) {
      const m = metrics[key];
      if (!m) continue;
      for (const phase of ["pre", "post"] as const) {
        if (!m[phase]) continue;
        const k = `${key}|${phase}`;
        const map = secondaryVals.get(k) ?? secondaryVals.set(k, new Map()).get(k)!;
        push(map, cid, m[phase]!.value);
      }
    }
  }
  ancova.sort((a, b) => (a.participantCode < b.participantCode ? -1 : a.participantCode > b.participantCode ? 1 : 0));
  const primaryKey = metricDefinition(PRIMARY_METRIC);
  const changeKey = metricDefinition(`${PRIMARY_METRIC}.change`);
  const primarySummary: MeasureRow[] = (["pre", "post", "change"] as const).map((phase) => ({
    key: phase === "change" ? changeKey.key : primaryKey.key,
    version: phase === "change" ? changeKey.version : primaryKey.version,
    phase,
    byCondition: byCondition(conditions, primaryVals[phase]),
  }));
  const secondary: MeasureRow[] = SECONDARY_METRICS.flatMap((key) =>
    (["pre", "post"] as const).flatMap((phase) => {
      const vals = secondaryVals.get(`${key}|${phase}`);
      return vals ? [{ key, version: metricDefinition(key).version, phase, byCondition: byCondition(conditions, vals) }] : [];
    }),
  );

  // ---- Knowledge test and transfer ---------------------------------------------------------
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

  // ---- Questionnaires ----------------------------------------------------------------------
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
      // SSQ: the administration before learning (pre) and the one after (post), told apart by the
      // journey step it was given in; by the attempt number only for rows without a journal step.
      // Others: the first administration only.
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

  // ---- Telemetry ----------------------------------------------------------------------------
  const facts = study.snapshotId ? await loadSnapshotFacts(q, study.snapshotId) : null;
  const scopeConcepts = facts && facts.concepts.size > 0 ? facts.concepts.size : null;
  // Every allocated session (excluded ones too: their WebGL / client errors are data-quality facts).
  const allocated = sessions.filter((x) => x.conditionId !== null).map((x) => ({ id: x.id, status: x.status }));
  const scopeMap = facts && facts.concepts.size > 0 ? facts.concepts : null;
  const telemetryBySession: Map<string, SessionTelemetry> =
    opts.telemetry === "full" ? await fullTelemetry(q, allocated, scopeMap) : (await refreshRollups(q, studyId, allocated, scopeMap)).bySession;
  const empty: SessionTelemetry = { eventCount: 0, lastSeq: -1, exposureMs: 0, navigationMs: 0, pauseMs: 0, unterminated: 0, conceptsExposed: 0, conceptsInScope: 0, relationshipsFollowed: 0, citationOpens: 0, guidanceUses: 0, webglContextLost: 0, clientErrors: 0 };
  const tel = (id: string) => telemetryBySession.get(id) ?? empty;
  let webglContextLost = 0;
  let clientErrors = 0;
  for (const t of telemetryBySession.values()) {
    webglContextLost += t.webglContextLost;
    clientErrors += t.clientErrors;
  }
  const telemetrySessions: SessionTelemetryRow[] = [];
  for (const s of sessionInfo.values()) {
    if (!s.inScope || !s.conditionId) continue;
    const t = tel(s.id);
    telemetrySessions.push({
      sessionId: s.id,
      participantCode: s.participantCode,
      conditionId: s.conditionId,
      status: s.status,
      events: t.eventCount,
      exposureMs: t.exposureMs,
      navigationMs: t.navigationMs,
      pauseMs: t.pauseMs,
      unterminated: t.unterminated,
      conceptsExposed: t.conceptsExposed,
      coverage: scopeConcepts ? t.conceptsInScope / scopeConcepts : null,
      relationshipsFollowed: t.relationshipsFollowed,
      citationOpens: t.citationOpens,
      guidanceUses: t.guidanceUses,
    });
  }
  telemetrySessions.sort((a, b) => (a.participantCode < b.participantCode ? -1 : a.participantCode > b.participantCode ? 1 : 0));
  const tMeasure = (key: string, pick: (r: SessionTelemetryRow) => number | null, scale = 1): MeasureRow => {
    const vals = new Map<string, (number | null)[]>();
    for (const r of telemetrySessions) {
      const v = pick(r);
      push(vals, r.conditionId, v === null ? null : v / scale);
    }
    return { key, version: metricDefinition(key).version, phase: "session", byCondition: byCondition(conditions, vals) };
  };
  const telemetrySummary = telemetrySessions.length
    ? [
        tMeasure("time.exposure_total_ms", (r) => r.exposureMs, 60_000),
        tMeasure("time.navigation_ms", (r) => r.navigationMs, 60_000),
        tMeasure("time.pause_ms", (r) => r.pauseMs, 60_000),
        tMeasure("exposure.concepts", (r) => r.conceptsExposed),
        tMeasure("exposure.coverage", (r) => r.coverage),
        tMeasure("nav.relationships_followed", (r) => r.relationshipsFollowed),
        tMeasure("citation.openings", (r) => r.citationOpens),
        tMeasure("guidance.uses", (r) => r.guidanceUses),
        tMeasure("telemetry.events", (r) => r.events),
      ]
    : [];

  // ---- Data quality ------------------------------------------------------------------------
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
    webglContextLost,
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
    primary: { summary: primarySummary, ancova, referenceMaps: [...refs] },
    secondary,
    knowledge,
    questionnaires,
    telemetry: { summary: telemetrySummary, sessions: telemetrySessions, scopeConcepts },
    quality,
    fingerprint: fp.fingerprint,
  };
}

// ---------------------------------------------------------------------------------------------
// CSV (pseudonymised: participant codes only)
// ---------------------------------------------------------------------------------------------

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

/** Rows and metric keys of one dashboard table, in dictionary column order. */
export function dashboardTableRows(data: DashboardData, table: DashboardTableName): { rows: Record<string, unknown>[]; metrics: string[] } {
  const cond = (id: string | null) => data.conditions.find((c) => c.id === id);
  switch (table) {
    case "dashboard_primary":
      return { rows: summaryRows("primary", data.primary.summary, data.conditions), metrics: [PRIMARY_METRIC, `${PRIMARY_METRIC}.change`] };
    case "dashboard_primary_ancova":
      return {
        rows: data.primary.ancova.map((r) => ({
          participant_code: r.participantCode,
          condition_code: r.conditionCode,
          condition_interface: r.conditionInterface,
          stratum: r.stratum,
          pre_cmap_recall_dl: r.pre,
          post_cmap_recall_dl: r.post,
          change_cmap_recall_dl: r.change,
          reference_map_ids: r.referenceMapIds.join(" "),
        })),
        metrics: [PRIMARY_METRIC, `${PRIMARY_METRIC}.change`],
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
          exposure_ms: r.exposureMs,
          navigation_ms: r.navigationMs,
          pause_ms: r.pauseMs,
          unterminated_intervals: r.unterminated,
          concepts_exposed: r.conceptsExposed,
          exposure_coverage: round(r.coverage),
          relationships_followed: r.relationshipsFollowed,
          citation_opens: r.citationOpens,
          guidance_uses: r.guidanceUses,
        })),
        metrics: ["telemetry.events", "time.exposure_total_ms", "time.navigation_ms", "time.pause_ms", "exposure.concepts", "exposure.coverage", "nav.relationships_followed", "citation.openings", "guidance.uses"],
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
        { check: "webgl_context_lost_events", detail: "", condition_code: null, n: q.webglContextLost },
        { check: "client_error_events", detail: "", condition_code: null, n: q.clientErrors },
        ...q.excluded.map((e) => ({ check: "excluded_sessions", detail: e.category, condition_code: null, n: e.n })),
        { check: "withdrawn_sessions", detail: "", condition_code: null, n: q.withdrawn },
        { check: "completed_without_telemetry", detail: "", condition_code: null, n: q.completedWithoutTelemetry },
      ];
      return { rows, metrics: ["quality.sequence_gaps", "quality.quarantine", "quality.duplicates", "quality.interruptions", "quality.device_failures", "quality.exclusions"] };
    }
  }
}

/**
 * One dashboard table as CSV: a `#` comment line naming the study, its demo / experimental status,
 * the server time and the metric versions, then RFC 4180 CSV (read with e.g. pandas
 * `read_csv(..., comment="#")`).
 */
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
