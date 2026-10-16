/**
 * Scoring runs over raw participant data, stored as versioned `derived_scores`.
 *
 *  - Concept maps: `scoreConceptMap` (the verified library, unchanged) against an adjudicated
 *    reference map, with the assessment's frozen scoring configuration and the concept
 *    categories of the concept set. Each `ScoreItem` becomes one row via `toDerivedScores`
 *    (metric name, metric version, value, parameters + itemised details, pipeline version),
 *    plus a fingerprint of the reference edges used. Rows are append-only: a re-run with the
 *    same metric versions stores nothing new.
 *  - Pre/post change: `compareConceptMaps` for every session with a final pre and post map of the
 *    same assessment (`cmap.change.*`, stored on the post map, `details.preConceptMapId`).
 *  - Keyed items: answer-key match (`item.key_match`).
 *  - Rubric ratings: one row per rater and response (`rubric.rating.r<rater hash>`); agreement
 *    with the library's Cohen's and Fleiss' kappa.
 */
import { createHash } from "node:crypto";

import type { Pool } from "pg";

import {
  cohensKappa,
  compareConceptMaps,
  fleissKappa,
  scoreConceptMap,
  SCORING_PIPELINE_VERSION,
  toDerivedScores,
  type ConceptMapScoreResult,
  type ParticipantMapInput,
  type ReferenceEdgeInput,
  type ReferenceMapInput,
  type ScoringConfigInput,
} from "@/features/assessment/scoring";
import type { MapPayload } from "@/components/assessment/map-state";
import { KEY_MATCH_METRIC, keyMatch } from "@/features/assessment/responses";
import type { DerivedScore } from "@/features/research/contracts";
import { neutraliseFormula } from "@/server/research/exports/csv";

import { AssessmentError, assertUuid, audit, inTransaction, type Q } from "./common";
import type { ConceptSet } from "./concept-set";
import { rawToPayload } from "./participant-maps";
import { reconstructionItem } from "./reference-maps";
import type { RubricLevel } from "./definitions";

// ---------------------------------------------------------------------------------------
// Reference and participant inputs
// ---------------------------------------------------------------------------------------

export interface LoadedReference {
  id: string;
  assessmentId: string;
  version: number;
  title: string;
  isDemo: boolean;
  status: string;
  input: ReferenceMapInput;
  fingerprint: string;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function loadReference(q: Q, referenceMapId: string): Promise<LoadedReference> {
  assertUuid(referenceMapId, "Reference map");
  const r = await q.query<{ id: string; assessment_id: string; version: number; title: string; is_demo: boolean; status: string; nodes: Array<{ conceptId: string }>; adjudicated_at: Date | null }>(
    "SELECT id, assessment_id, version, title, is_demo, status, nodes, adjudicated_at FROM reference_maps WHERE id = $1",
    [referenceMapId],
  );
  const ref = r.rows[0];
  if (!ref) throw new AssessmentError("not_found", "Reference map not found");
  if (!ref.adjudicated_at) throw new AssessmentError("invalid", "Scoring needs an adjudicated reference map.");
  const e = await q.query<{ source_concept_id: string; target_concept_id: string; relationship_type_code: string | null; directed: boolean; weight: number; required: boolean; notes: string | null }>(
    "SELECT source_concept_id, target_concept_id, relationship_type_code, directed, weight, required, notes FROM reference_map_edges WHERE reference_map_id = $1",
    [referenceMapId],
  );
  const edges: ReferenceEdgeInput[] = e.rows.map((x) => {
    // Consensus-built edges carry their decided status; others fall back to `required`.
    const consensus = x.notes?.startsWith("consensus:") ? x.notes.slice("consensus:".length) : null;
    const status = x.required ? "expected" : consensus === "optional" ? "optional" : undefined;
    return {
      sourceConceptId: x.source_concept_id,
      targetConceptId: x.target_concept_id,
      relationshipTypeCode: x.relationship_type_code,
      directed: x.directed,
      weight: x.weight,
      required: x.required,
      ...(status ? { status } : {}),
    };
  });
  const input: ReferenceMapInput = { conceptIds: ref.nodes.map((n) => n.conceptId), edges };
  const canonical = JSON.stringify({
    conceptIds: [...input.conceptIds].sort(),
    edges: edges.map((x) => [x.sourceConceptId, x.targetConceptId, x.relationshipTypeCode ?? "", x.directed, x.weight, x.required, x.status ?? ""]).sort(),
  });
  return { id: ref.id, assessmentId: ref.assessment_id, version: ref.version, title: ref.title, isDemo: ref.is_demo, status: ref.status, input, fingerprint: sha256(canonical) };
}

interface FinalMapRow {
  id: string;
  session_id: string;
  participant_id: string;
  phase: "pre" | "post";
  nodes: Array<{ key: string; conceptId: string | null }>;
}

async function participantInput(q: Q, map: Pick<FinalMapRow, "id" | "nodes">): Promise<ParticipantMapInput> {
  const e = await q.query<{ edge_key: string; source_node_key: string; target_node_key: string; relationship_type_code: string | null; directed: boolean }>(
    "SELECT edge_key, source_node_key, target_node_key, relationship_type_code, directed FROM concept_map_edges WHERE concept_map_id = $1",
    [map.id],
  );
  return {
    nodes: map.nodes.map((n) => ({ key: n.key, conceptId: n.conceptId })),
    edges: e.rows.map((x) => ({ key: x.edge_key, source: x.source_node_key, target: x.target_node_key, relationshipType: x.relationship_type_code, directed: x.directed })),
  };
}

async function insertScores(q: Q, rows: DerivedScore[], participantId: string): Promise<number> {
  let inserted = 0;
  for (const s of rows) {
    const r = await q.query(
      `INSERT INTO derived_scores (session_id, participant_id, assessment_id, concept_map_id, response_id, reference_map_id, rubric_id, metric_name, metric_version, value, details, pipeline_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT ON CONSTRAINT derived_scores_uq DO NOTHING`,
      [s.sessionId, participantId, s.assessmentId, s.conceptMapId ?? null, s.responseId ?? null, s.referenceMapId ?? null, s.rubricId ?? null, s.metricName, s.metricVersion, s.value, JSON.stringify(s.details), s.pipelineVersion],
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

// ---------------------------------------------------------------------------------------
// Concept-map scoring run
// ---------------------------------------------------------------------------------------

export interface ScoringRunResult {
  maps: number;
  changePairs: number;
  inserted: number;
  alreadyStored: number;
}

/** Scores every final map of the reference's assessment (both phases) and every pre/post pair. */
export async function scoreConceptMaps(pool: Pool, actorId: string, referenceMapId: string): Promise<ScoringRunResult> {
  return inTransaction(pool, async (c) => {
    const ref = await loadReference(c, referenceMapId);
    const item = await reconstructionItem(c, ref.assessmentId);
    const context = { conceptCategories: item.set.categories };
    const maps = (
      await c.query<FinalMapRow>(
        `SELECT cm.id, cm.session_id, cm.participant_id, cm.phase, cm.nodes FROM concept_maps cm
           JOIN study_sessions ss ON ss.id = cm.session_id JOIN studies st ON st.id = ss.study_id
          WHERE cm.assessment_id = $1 AND cm.is_final AND st.is_demo = $2 ORDER BY cm.session_id, cm.phase`,
        [ref.assessmentId, ref.isDemo],
      )
    ).rows;
    const referenceTag = { id: ref.id, version: ref.version, fingerprint: ref.fingerprint };
    let inserted = 0;
    let total = 0;
    const inputs = new Map<string, ParticipantMapInput>();
    for (const m of maps) {
      const input = await participantInput(c, m);
      inputs.set(m.id, input);
      const result = scoreConceptMap(input, ref.input, item.scoring, context);
      const rows = toDerivedScores(result.scores, { sessionId: m.session_id, assessmentId: ref.assessmentId, conceptMapId: m.id, referenceMapId: ref.id }).map((r) => ({
        ...r,
        details: { ...r.details, reference: referenceTag },
      }));
      total += rows.length;
      inserted += await insertScores(c, rows, m.participant_id);
    }
    let pairs = 0;
    const bySession = new Map<string, { pre?: FinalMapRow; post?: FinalMapRow }>();
    for (const m of maps) bySession.set(m.session_id, { ...bySession.get(m.session_id), [m.phase]: m });
    for (const { pre, post } of bySession.values()) {
      if (!pre || !post) continue;
      pairs++;
      const change = compareConceptMaps(inputs.get(pre.id)!, inputs.get(post.id)!, item.scoring, ref.input, context);
      const rows = toDerivedScores(change.scores, { sessionId: post.session_id, assessmentId: ref.assessmentId, conceptMapId: post.id, referenceMapId: ref.id }).map((r) => ({
        ...r,
        details: { ...r.details, preConceptMapId: pre.id, reference: referenceTag },
      }));
      total += rows.length;
      inserted += await insertScores(c, rows, post.participant_id);
    }
    await audit(c, { actorId, action: "scoring.concept_maps", entity: "reference_maps", entityId: ref.id, after: { maps: maps.length, pairs, inserted, pipeline: SCORING_PIPELINE_VERSION } });
    return { maps: maps.length, changePairs: pairs, inserted, alreadyStored: total - inserted };
  });
}

/**
 * Scores ONE final concept map against one reference map with the library (same inputs as
 * `scoreConceptMaps`), stores the rows (idempotent) and returns the scores. Used by the study
 * engine to stratify allocation by the pre-test map (study decision D3, `cmap.recall.dl`).
 */
export async function scoreFinalMap(q: Q, conceptMapId: string, referenceMapId: string): Promise<{ scores: ConceptMapScoreResult["scores"]; reference: { id: string; version: number; fingerprint: string } }> {
  assertUuid(conceptMapId, "Concept map");
  const ref = await loadReference(q, referenceMapId);
  const item = await reconstructionItem(q, ref.assessmentId);
  const m = (
    await q.query<FinalMapRow>("SELECT id, session_id, participant_id, phase, nodes FROM concept_maps WHERE id = $1 AND is_final AND assessment_id = $2", [conceptMapId, ref.assessmentId])
  ).rows[0];
  if (!m) throw new AssessmentError("not_found", "No final concept map of this assessment");
  const input = await participantInput(q, m);
  const result = scoreConceptMap(input, ref.input, item.scoring, { conceptCategories: item.set.categories });
  const referenceTag = { id: ref.id, version: ref.version, fingerprint: ref.fingerprint };
  const rows = toDerivedScores(result.scores, { sessionId: m.session_id, assessmentId: ref.assessmentId, conceptMapId: m.id, referenceMapId: ref.id }).map((r) => ({
    ...r,
    details: { ...r.details, reference: referenceTag },
  }));
  await insertScores(q, rows, m.participant_id);
  return { scores: result.scores, reference: referenceTag };
}

// ---------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------

export const SUMMARY_METRICS = [
  "cmap.valid_relationships",
  "cmap.incorrect_relationships",
  "cmap.missing_expected_relationships",
  "cmap.f1.dl",
  "cmap.causal_chain_depth",
  "cmap.degree_profile_similarity",
  "cmap.cross_category.valid",
] as const;

export interface MapScoreRow {
  conceptMapId: string;
  sessionId: string;
  participantCode: string;
  condition: string;
  phase: "pre" | "post";
  submittedAt: Date | null;
  edgeCount: number;
  scores: Record<string, number | null>;
  scored: boolean;
}

export async function listMapScores(q: Q, referenceMapId: string): Promise<MapScoreRow[]> {
  const ref = await loadReference(q, referenceMapId);
  const rows = await q.query<{ id: string; session_id: string; code: string; interface: string; phase: "pre" | "post"; submitted_at: Date | null; edge_count: string }>(
    `SELECT cm.id, cm.session_id, p.code, sc.interface, cm.phase, cm.submitted_at,
            (SELECT count(*) FROM concept_map_edges e WHERE e.concept_map_id = cm.id) AS edge_count
       FROM concept_maps cm
       JOIN participants p ON p.id = cm.participant_id
       JOIN study_sessions ss ON ss.id = cm.session_id
       JOIN study_conditions sc ON sc.id = ss.condition_id
       JOIN studies st ON st.id = ss.study_id
      WHERE cm.assessment_id = $1 AND cm.is_final AND st.is_demo = $2
      ORDER BY p.code, cm.phase`,
    [ref.assessmentId, ref.isDemo],
  );
  const scores = await q.query<{ concept_map_id: string; metric_name: string; value: number | null }>(
    "SELECT concept_map_id, metric_name, value FROM derived_scores WHERE reference_map_id = $1 AND concept_map_id IS NOT NULL AND metric_name = ANY($2::text[])",
    [referenceMapId, SUMMARY_METRICS],
  );
  const byMap = new Map<string, Record<string, number | null>>();
  for (const s of scores.rows) byMap.set(s.concept_map_id, { ...byMap.get(s.concept_map_id), [s.metric_name]: s.value });
  return rows.rows.map((r) => ({
    conceptMapId: r.id,
    sessionId: r.session_id,
    participantCode: r.code,
    condition: r.interface,
    phase: r.phase,
    submittedAt: r.submitted_at,
    edgeCount: Number(r.edge_count),
    scores: byMap.get(r.id) ?? {},
    scored: byMap.has(r.id),
  }));
}

export interface StoredScore {
  metricName: string;
  metricVersion: string;
  value: number | null;
  pipelineVersion: string;
  computedAt: Date;
}

export interface MapBreakdown {
  map: { id: string; phase: "pre" | "post"; participantCode: string; condition: string; submittedAt: Date | null; sessionId: string };
  /** The raw graph as the participant left it (positions, edges, edit log). */
  payload: MapPayload;
  reference: LoadedReference;
  set: ConceptSet;
  /** Recomputed from the raw map with the parameters stored with the scores (or current ones). */
  result: ConceptMapScoreResult;
  parametersSource: "stored" | "current";
  stored: StoredScore[];
  /** Metrics whose stored value differs from the recomputation (should be empty). */
  mismatches: string[];
  change: ReturnType<typeof compareConceptMaps> | null;
  otherPhaseMapId: string | null;
}

export async function mapBreakdown(q: Q, conceptMapId: string, referenceMapId: string): Promise<MapBreakdown> {
  assertUuid(conceptMapId, "Concept map");
  const ref = await loadReference(q, referenceMapId);
  const m = await q.query<FinalMapRow & { code: string; interface: string; submitted_at: Date | null; assessment_id: string; is_final: boolean; raw: unknown }>(
    `SELECT cm.id, cm.session_id, cm.participant_id, cm.phase, cm.nodes, cm.raw, cm.submitted_at, cm.assessment_id, cm.is_final, p.code, sc.interface
       FROM concept_maps cm JOIN participants p ON p.id = cm.participant_id
       JOIN study_sessions ss ON ss.id = cm.session_id JOIN study_conditions sc ON sc.id = ss.condition_id
      WHERE cm.id = $1`,
    [conceptMapId],
  );
  const map = m.rows[0];
  if (!map || !map.is_final || map.assessment_id !== ref.assessmentId) throw new AssessmentError("not_found", "Concept map not found for this reference map");
  const item = await reconstructionItem(q, ref.assessmentId);
  const stored = (
    await q.query<{ metric_name: string; metric_version: string; value: number | null; pipeline_version: string; computed_at: Date; details: { parameters?: ScoringConfigInput } }>(
      "SELECT metric_name, metric_version, value, pipeline_version, computed_at, details FROM derived_scores WHERE concept_map_id = $1 AND reference_map_id = $2 ORDER BY metric_name",
      [conceptMapId, referenceMapId],
    )
  ).rows;
  const storedParams = stored.find((s) => s.metric_name === "cmap.valid_relationships")?.details.parameters;
  const config = storedParams ?? item.scoring;
  const context = { conceptCategories: item.set.categories };
  const input = await participantInput(q, map);
  const result = scoreConceptMap(input, ref.input, config, context);
  const mismatches = stored
    .filter((s) => s.metric_name.startsWith("cmap.") && !s.metric_name.startsWith("cmap.change"))
    .filter((s) => {
      const fresh = result.scores.find((x) => x.metricName === s.metric_name);
      return !fresh || fresh.value !== s.value;
    })
    .map((s) => s.metric_name);
  const other = await q.query<FinalMapRow>(
    "SELECT id, session_id, participant_id, phase, nodes FROM concept_maps WHERE session_id = $1 AND assessment_id = $2 AND phase <> $3 AND is_final",
    [map.session_id, map.assessment_id, map.phase],
  );
  let change: MapBreakdown["change"] = null;
  const o = other.rows[0];
  if (o) {
    const otherInput = await participantInput(q, o);
    const [pre, post] = map.phase === "pre" ? [input, otherInput] : [otherInput, input];
    change = compareConceptMaps(pre, post, config, ref.input, context);
  }
  return {
    map: { id: map.id, phase: map.phase, participantCode: map.code, condition: map.interface, submittedAt: map.submitted_at, sessionId: map.session_id },
    payload: rawToPayload(map.nodes, map.raw),
    reference: ref,
    set: item.set,
    result,
    parametersSource: storedParams ? "stored" : "current",
    stored: stored.map((s) => ({ metricName: s.metric_name, metricVersion: s.metric_version, value: s.value, pipelineVersion: s.pipeline_version, computedAt: s.computed_at })),
    mismatches,
    change,
    otherPhaseMapId: o?.id ?? null,
  };
}

// ---------------------------------------------------------------------------------------
// Keyed items
// ---------------------------------------------------------------------------------------

// One answer format and one key rule, shared with the study engine that writes the answers
// (src/features/assessment/responses.ts).
export { KEY_MATCH_METRIC, extractAnswer, keyMatch } from "@/features/assessment/responses";

/** Scores the latest answered attempt of every keyed item of an assessment. */
export async function scoreKeyedItems(pool: Pool, actorId: string, assessmentId: string): Promise<{ responses: number; inserted: number }> {
  assertUuid(assessmentId, "Assessment");
  return inTransaction(pool, async (c) => {
    const r = await c.query<{ id: string; session_id: string; participant_id: string; raw: unknown; answer_key: unknown }>(
      `SELECT DISTINCT ON (r.session_id, r.item_id) r.id, r.session_id, r.participant_id, r.raw, i.answer_key
         FROM responses r JOIN assessment_items i ON i.id = r.item_id
        WHERE r.assessment_id = $1 AND r.status = 'answered' AND i.answer_key IS NOT NULL
        ORDER BY r.session_id, r.item_id, r.attempt DESC`,
      [assessmentId],
    );
    let inserted = 0;
    for (const row of r.rows) {
      const m = keyMatch(row.answer_key, row.raw);
      inserted += await insertScores(
        c,
        [
          {
            sessionId: row.session_id,
            assessmentId,
            responseId: row.id,
            metricName: KEY_MATCH_METRIC.name,
            metricVersion: KEY_MATCH_METRIC.version,
            value: m.value,
            details: { parameters: { rule: "exact_match", answerKey: row.answer_key }, ...(m.reason ? { reason: m.reason } : {}) },
            pipelineVersion: KEY_MATCH_METRIC.pipeline,
          },
        ],
        row.participant_id,
      );
    }
    await audit(c, { actorId, action: "scoring.keyed_items", entity: "assessments", entityId: assessmentId, after: { responses: r.rows.length, inserted } });
    return { responses: r.rows.length, inserted };
  });
}

// ---------------------------------------------------------------------------------------
// Rubric ratings (multiple raters) and agreement
// ---------------------------------------------------------------------------------------

export const RUBRIC_METRIC = { prefix: "rubric.rating.r", version: "1.0.0", pipeline: "rubric-rating@1.0.0" } as const;

/** Stable, metric-name-safe rater tag (derived_scores has no rater column). */
export function raterMetricName(raterId: string): string {
  return `${RUBRIC_METRIC.prefix}${sha256(raterId).slice(0, 16)}`;
}

export interface RubricInfo {
  id: string;
  assessmentId: string;
  itemId: string;
  itemPrompt: string;
  version: number;
  status: string;
  levels: RubricLevel[];
  assessmentTitle: string;
}

export async function loadRubric(q: Q, rubricId: string): Promise<RubricInfo> {
  assertUuid(rubricId, "Rubric");
  const r = await q.query<{ id: string; assessment_id: string; item_id: string | null; version: number; status: string; rubric: { levels?: RubricLevel[] }; prompt: string | null; title: string }>(
    `SELECT s.id, s.assessment_id, s.item_id, s.version, s.status, s.rubric, i.prompt, a.title
       FROM scoring_rubrics s JOIN assessments a ON a.id = s.assessment_id LEFT JOIN assessment_items i ON i.id = s.item_id WHERE s.id = $1`,
    [rubricId],
  );
  const row = r.rows[0];
  if (!row || !row.item_id) throw new AssessmentError("not_found", "Rubric not found");
  return { id: row.id, assessmentId: row.assessment_id, itemId: row.item_id, itemPrompt: row.prompt ?? "", version: row.version, status: row.status, levels: row.rubric.levels ?? [], assessmentTitle: row.title };
}

export function responseText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const k of ["text", "value", "answer"]) if (typeof o[k] === "string") return o[k] as string;
  }
  return JSON.stringify(raw);
}

export interface RubricQueueItem {
  responseId: string;
  /** Opaque, condition-free label: raters are blind to participant and condition. */
  label: string;
  text: string;
  myRating: number | null;
  ratingCount: number;
}

/** Latest answered attempt per session for the rubric's item, with the viewer's own rating only. */
export async function rubricQueue(q: Q, rubricId: string, raterId: string): Promise<{ rubric: RubricInfo; items: RubricQueueItem[] }> {
  const rubric = await loadRubric(q, rubricId);
  const r = await q.query<{ id: string; raw: unknown }>(
    `SELECT DISTINCT ON (session_id) id, raw FROM responses WHERE item_id = $1 AND status = 'answered' ORDER BY session_id, attempt DESC`,
    [rubric.itemId],
  );
  const ratings = await q.query<{ response_id: string; metric_name: string; value: number | null }>(
    "SELECT response_id, metric_name, value FROM derived_scores WHERE rubric_id = $1 AND metric_name LIKE 'rubric.rating.%'",
    [rubricId],
  );
  const mine = raterMetricName(raterId);
  const items = r.rows
    .map((row) => ({ row, label: sha256(`${rubricId}:${row.id}`).slice(0, 8) }))
    .sort((a, b) => (a.label < b.label ? -1 : 1))
    .map(({ row, label }) => {
      const rs = ratings.rows.filter((x) => x.response_id === row.id);
      return { responseId: row.id, label: `Answer ${label}`, text: responseText(row.raw), myRating: rs.find((x) => x.metric_name === mine)?.value ?? null, ratingCount: rs.length };
    });
  return { rubric, items };
}

/** One rater's rating of one response (immutable once stored). */
export async function rateResponse(q: Q, raterId: string, rubricId: string, responseId: string, value: number, note?: string): Promise<void> {
  const rubric = await loadRubric(q, rubricId);
  if (rubric.status !== "locked") throw new AssessmentError("invalid", "Publish the rubric before rating.");
  const level = rubric.levels.find((l) => l.value === value);
  if (!level) throw new AssessmentError("invalid", "Choose one of the rubric levels.");
  assertUuid(responseId, "Response");
  const r = await q.query<{ session_id: string; participant_id: string }>(
    "SELECT session_id, participant_id FROM responses WHERE id = $1 AND item_id = $2 AND status = 'answered'",
    [responseId, rubric.itemId],
  );
  const resp = r.rows[0];
  if (!resp) throw new AssessmentError("not_found", "Response not found for this rubric");
  const n = await insertScores(
    q,
    [
      {
        sessionId: resp.session_id,
        assessmentId: rubric.assessmentId,
        responseId,
        rubricId,
        metricName: raterMetricName(raterId),
        metricVersion: RUBRIC_METRIC.version,
        value,
        details: { parameters: { rubricVersion: rubric.version, method: "levels" }, raterId, level: level.label, ...(note?.trim() ? { note: note.trim() } : {}) },
        pipelineVersion: RUBRIC_METRIC.pipeline,
      },
    ],
    resp.participant_id,
  );
  if (n === 0) throw new AssessmentError("immutable", "You have already rated this answer.");
}

export interface RubricAgreement {
  raters: number;
  responsesRated: number;
  /** Responses rated by every rater (the Fleiss' kappa items). */
  completeItems: number;
  fleissKappa: number | null;
  percentAgreement: number | null;
  pairwise: Array<{ raterA: string; raterB: string; n: number; cohensKappa: number | null; percentAgreement: number | null }>;
}

export async function rubricAgreement(q: Q, rubricId: string): Promise<RubricAgreement> {
  const rubric = await loadRubric(q, rubricId);
  const rows = await q.query<{ response_id: string; metric_name: string; value: number }>(
    "SELECT response_id, metric_name, value FROM derived_scores WHERE rubric_id = $1 AND metric_name LIKE 'rubric.rating.%' AND value IS NOT NULL",
    [rubricId],
  );
  const byResponse = new Map<string, Map<string, number>>();
  for (const r of rows.rows) {
    const m = byResponse.get(r.response_id) ?? new Map<string, number>();
    m.set(r.metric_name, r.value);
    byResponse.set(r.response_id, m);
  }
  const raters = [...new Set(rows.rows.map((r) => r.metric_name))].sort();
  const pairwise: RubricAgreement["pairwise"] = [];
  for (let i = 0; i < raters.length; i++) {
    for (let j = i + 1; j < raters.length; j++) {
      const a: string[] = [];
      const b: string[] = [];
      for (const m of byResponse.values()) {
        if (m.has(raters[i]!) && m.has(raters[j]!)) {
          a.push(String(m.get(raters[i]!)));
          b.push(String(m.get(raters[j]!)));
        }
      }
      const k = cohensKappa(a, b);
      pairwise.push({ raterA: raters[i]!, raterB: raters[j]!, n: k.n, cohensKappa: k.kappa, percentAgreement: k.po });
    }
  }
  const levels = rubric.levels.map((l) => l.value);
  const complete = [...byResponse.values()].filter((m) => raters.every((r) => m.has(r)));
  const fleiss = raters.length >= 2 && complete.length > 0 ? fleissKappa(complete.map((m) => levels.map((v) => raters.filter((r) => m.get(r) === v).length))) : null;
  return {
    raters: raters.length,
    responsesRated: byResponse.size,
    completeItems: complete.length,
    fleissKappa: fleiss?.kappa ?? null,
    percentAgreement: fleiss?.pBar ?? null,
    pairwise,
  };
}

export async function listRubricsForScoring(q: Q): Promise<Array<RubricInfo & { ratings: number }>> {
  const r = await q.query<{ id: string }>("SELECT s.id FROM scoring_rubrics s WHERE s.item_id IS NOT NULL ORDER BY s.created_at DESC");
  const out = [];
  for (const row of r.rows) {
    const info = await loadRubric(q, row.id);
    const n = await q.query<{ n: string }>("SELECT count(*) AS n FROM derived_scores WHERE rubric_id = $1", [row.id]);
    out.push({ ...info, ratings: Number(n.rows[0]!.n) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------

export const SCORE_EXPORT_COLUMNS = [
  "study_slug",
  "study_is_demo",
  "non_experimental",
  "participant_code",
  "session_id",
  "condition",
  "assessment_code",
  "assessment_version",
  "phase",
  "concept_map_id",
  "response_id",
  "reference_map_id",
  "reference_map_version",
  "rubric_id",
  "metric_name",
  "metric_version",
  "value",
  "pipeline_version",
  "computed_at",
] as const;

/** Long-format derived scores, joinable on participant code, session and condition. */
export async function exportScores(q: Q, assessmentId?: string): Promise<Array<Record<(typeof SCORE_EXPORT_COLUMNS)[number], string | number | boolean | null>>> {
  if (assessmentId) assertUuid(assessmentId, "Assessment");
  const r = await q.query(
    `SELECT st.slug AS study_slug, st.is_demo AS study_is_demo,
            (st.is_demo OR coalesce((st.config->>'nonExperimental')::boolean, false)) AS non_experimental,
            p.code AS participant_code, d.session_id, sc.interface AS condition, a.code AS assessment_code, a.version AS assessment_version,
            cm.phase, d.concept_map_id, d.response_id, d.reference_map_id, rm.version AS reference_map_version, d.rubric_id,
            d.metric_name, d.metric_version, d.value, d.pipeline_version, d.computed_at
       FROM derived_scores d
       JOIN study_sessions ss ON ss.id = d.session_id
       JOIN studies st ON st.id = ss.study_id
       JOIN study_conditions sc ON sc.id = ss.condition_id
       JOIN participants p ON p.id = d.participant_id
       JOIN assessments a ON a.id = d.assessment_id
       LEFT JOIN concept_maps cm ON cm.id = d.concept_map_id
       LEFT JOIN reference_maps rm ON rm.id = d.reference_map_id
      ${assessmentId ? "WHERE d.assessment_id = $1" : ""}
      ORDER BY st.slug, p.code, a.code, a.version, cm.phase NULLS FIRST, d.metric_name`,
    assessmentId ? [assessmentId] : [],
  );
  return r.rows.map((row: Record<string, unknown>) => ({ ...row, computed_at: row.computed_at instanceof Date ? row.computed_at.toISOString() : row.computed_at }) as never);
}

export const EDGE_EXPORT_COLUMNS = [
  "study_slug",
  "participant_code",
  "session_id",
  "condition",
  "assessment_code",
  "assessment_version",
  "phase",
  "concept_map_id",
  "is_final",
  "revision",
  "edge_key",
  "source_concept_id",
  "target_concept_id",
  "relationship_type_code",
  "directed",
] as const;

/** Raw participant map edges (one row per edge), for independent re-analysis. */
export async function exportMapEdges(q: Q, assessmentId?: string): Promise<Array<Record<(typeof EDGE_EXPORT_COLUMNS)[number], string | number | boolean | null>>> {
  if (assessmentId) assertUuid(assessmentId, "Assessment");
  const r = await q.query(
    `SELECT st.slug AS study_slug, p.code AS participant_code, cm.session_id, sc.interface AS condition, a.code AS assessment_code, a.version AS assessment_version,
            cm.phase, cm.id AS concept_map_id, cm.is_final, cm.revision, e.edge_key, e.source_concept_id, e.target_concept_id, e.relationship_type_code, e.directed
       FROM concept_map_edges e
       JOIN concept_maps cm ON cm.id = e.concept_map_id
       JOIN study_sessions ss ON ss.id = cm.session_id
       JOIN studies st ON st.id = ss.study_id
       JOIN study_conditions sc ON sc.id = ss.condition_id
       JOIN participants p ON p.id = cm.participant_id
       JOIN assessments a ON a.id = cm.assessment_id
      ${assessmentId ? "WHERE cm.assessment_id = $1" : ""}
      ORDER BY st.slug, p.code, cm.phase, e.edge_key`,
    assessmentId ? [assessmentId] : [],
  );
  return r.rows as never;
}

export function toCsv(columns: readonly string[], rows: ReadonlyArray<Record<string, unknown>>): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    // Neutralise spreadsheet formula injection (the shared rule of the research exports: only a
    // plain number may start with "-", so "-1+cmd|..." is neutralised) and quote when needed.
    const safe = neutraliseFormula(s, v);
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

/** Assessments that have at least one keyed item, with their answered-response counts. */
export async function listKeyedAssessments(q: Q): Promise<Array<{ id: string; code: string; version: number; title: string; responses: number; scored: number }>> {
  const r = await q.query<{ id: string; code: string; version: number; title: string; responses: string; scored: string }>(
    `SELECT a.id, a.code, a.version, a.title,
            (SELECT count(*) FROM responses r JOIN assessment_items i ON i.id = r.item_id WHERE r.assessment_id = a.id AND i.answer_key IS NOT NULL AND r.status = 'answered') AS responses,
            (SELECT count(*) FROM derived_scores d WHERE d.assessment_id = a.id AND d.metric_name = '${KEY_MATCH_METRIC.name}') AS scored
       FROM assessments a WHERE EXISTS (SELECT 1 FROM assessment_items i WHERE i.assessment_id = a.id AND i.answer_key IS NOT NULL)
      ORDER BY a.code, a.version`,
  );
  return r.rows.map((x) => ({ ...x, responses: Number(x.responses), scored: Number(x.scored) }));
}

/** Finalised (adjudicated) reference maps, newest first, with their assessment. */
export async function listScorableReferences(q: Q): Promise<Array<{ id: string; title: string; version: number; isDemo: boolean; status: string; assessmentId: string; assessmentTitle: string; assessmentVersion: number }>> {
  const r = await q.query<{ id: string; title: string; version: number; is_demo: boolean; status: string; assessment_id: string; a_title: string; a_version: number }>(
    `SELECT r.id, r.title, r.version, r.is_demo, r.status, r.assessment_id, a.title AS a_title, a.version AS a_version
       FROM reference_maps r JOIN assessments a ON a.id = r.assessment_id
      WHERE r.adjudicated_at IS NOT NULL ORDER BY r.adjudicated_at DESC`,
  );
  return r.rows.map((x) => ({ id: x.id, title: x.title, version: x.version, isDemo: x.is_demo, status: x.status, assessmentId: x.assessment_id, assessmentTitle: x.a_title, assessmentVersion: x.a_version }));
}
