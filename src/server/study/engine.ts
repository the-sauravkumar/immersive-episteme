/**
 * Study engine: the participant journey over the study tables (enrolment, consent, the
 * condition-blind pre-allocation steps, allocation, device check, step sequencing, assessment
 * delivery, interruption/resume, withdrawal, completion). Plain SQL over a pg Pool/PoolClient;
 * not `server-only`, so the integration tests run it against a throwaway database. Request
 * handling (cookies, redirects) lives in ./session.ts, ./actions.ts and /study/allocate.
 *
 * Journal. Every transition is written to the append-only `audit_log` (actor = the
 * pseudonymous participant code, or `study-engine` for protocol rules), entity `study_session`
 * or `participant`. The journal is also the source of "which steps are done" (study_sessions has
 * no step column); the database rows it summarises (consent_records, allocations, responses,
 * concept_maps, derived_scores, the learning clock) stay the authoritative research records.
 *
 * Allocation point (study decision D3). With `allocation.point = after_pre_test` (the default)
 * the session is opened at consent WITHOUT a condition (migration 0010/0011); the condition-blind
 * steps (questionnaire_pre, pre_test, pre_reconstruction) are stored on it; when the last of them
 * is done the participant is allocated (stratum from the scored pre-test when configured) and the
 * allocation is attached to the session once. The device check follows allocation.
 */
import { createHash, randomInt } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { KEY_MATCH_METRIC } from "@/features/assessment/responses";
import type { LearningCondition } from "@/lib/permissions/learning";
import type { ConditionInterface } from "@/lib/validation/enums";
import { AssessmentError } from "@/server/assessment/common";
import { scoreFinalMap } from "@/server/assessment/scoring";
import { conditionFromInterface } from "@/server/auth/study-session-port-types";
import { LearningFinishRefusedError, recordLearningEnded } from "@/server/learning/context-data";

import { drawCondition, type AllocatableCondition, type DrawAlgorithm } from "./allocation";
import { isDeliverable, itemConfig, parseAnswer, scoreItem, toResponseRaw, type DeliveredItem, type ParsedAnswer } from "./answers";
import {
  BLIND_STEPS,
  instrumentsFor,
  isQuestionnaireStep,
  parseStudyProtocol,
  StudyConfigError,
  type StudyProtocol,
  type StudyStep,
} from "./config";
import { instrumentBlocker, instrumentConditions } from "./instruments";

export { LearningFinishRefusedError };

type Q = Pick<Pool | PoolClient, "query">;

export type StudyEngineErrorCode =
  | "study_not_found"
  | "study_not_open"
  | "study_misconfigured"
  | "participant_not_found"
  | "consent_already_recorded"
  | "consent_required"
  | "unsupported_design"
  | "not_current_step"
  | "not_allocated"
  | "allocation_refused"
  | "already_submitted"
  | "assessment_not_ready"
  | "invalid_answers"
  | "learning_not_started"
  | "familiarisation_not_finished"
  | "session_closed"
  | "repeat_browser";

export class StudyEngineError extends Error {
  constructor(
    readonly code: StudyEngineErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "StudyEngineError";
  }
}

/** Per-assessment total of the keyed items (the pre-test score of D3 stratification). */
export const KEY_MATCH_TOTAL_METRIC = { name: "assessment.key_match_total", version: "1.0.0", pipeline: KEY_MATCH_METRIC.pipeline } as const;
/** The concept-map metric of D3 stratification (expert-map coverage, directed and labelled). */
export const PRE_MAP_METRIC = "cmap.recall.dl";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

async function withTx<T>(pool: Pool | PoolClient, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  // A PoolClient (no `totalCount`) is used as is: the caller owns its transaction.
  if (typeof (pool as Pool).totalCount !== "number") return fn(pool as PoolClient);
  const client = await (pool as Pool).connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

type Actor = { kind: "participant"; code: string } | { kind: "system" };

async function journal(
  q: Q,
  actor: Actor,
  action: string,
  entity: "study_session" | "participant" | "study",
  entityId: string,
  after: Record<string, unknown> = {},
  reason: string | null = null,
): Promise<void> {
  await q.query(
    "INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, reason) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)",
    [actor.kind, actor.kind === "participant" ? actor.code : "study-engine", action, entity, entityId, JSON.stringify(after), reason],
  );
}

// ---------------------------------------------------------------------------------------------
// Studies and enrolment
// ---------------------------------------------------------------------------------------------

export interface EnrollableStudy {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isDemo: boolean;
  protocolVersion: string;
  design: "between" | "within";
  snapshotId: string | null;
  protocol: StudyProtocol;
  /** Researcher-entered strata offered at enrolment (only when allocation.point = enrolment). */
  strata: string[];
}

interface StudyRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  is_demo: boolean;
  protocol_version: string;
  design: "between" | "within";
  status: string;
  config: unknown;
  snapshot_id: string | null;
}

const STUDY_COLUMNS = "id, slug, title, description, is_demo, protocol_version, design, status, config, snapshot_id";

function toStudy(row: StudyRow): EnrollableStudy {
  let protocol: StudyProtocol;
  try {
    protocol = parseStudyProtocol(row.config);
  } catch (err) {
    if (err instanceof StudyConfigError) throw new StudyEngineError("study_misconfigured", err.message, { issues: err.issues });
    throw err;
  }
  const a = protocol.config.allocation;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    isDemo: row.is_demo,
    protocolVersion: row.protocol_version,
    design: row.design,
    snapshotId: row.snapshot_id,
    protocol,
    strata: a.point === "enrolment" ? a.strata : [],
  };
}

/** Normalises what a participant types as the study code (the study slug). */
export function normaliseStudyCode(input: string): string {
  return input.trim().toLowerCase();
}

/** An active study that a participant can join with `code`, or an error saying why not. */
export async function findEnrollableStudy(q: Q, code: string): Promise<EnrollableStudy> {
  const slug = normaliseStudyCode(code);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) throw new StudyEngineError("study_not_found", "No study has this code.");
  const r = await q.query<StudyRow>(`SELECT ${STUDY_COLUMNS} FROM studies WHERE slug = $1`, [slug]);
  const row = r.rows[0];
  if (!row) throw new StudyEngineError("study_not_found", "No study has this code.");
  if (row.status !== "active") throw new StudyEngineError("study_not_open", "This study is not open for participation.");
  const study = toStudy(row);
  if (!study.protocol.config.consent) {
    throw new StudyEngineError("study_misconfigured", "The study has no consent text configured.", { missing: "consent" });
  }
  if (study.design !== "between") {
    throw new StudyEngineError("unsupported_design", "Within-subjects sessions are not supported by the study engine (D3 rejects that design).");
  }
  return study;
}

export async function loadStudy(q: Q, studyId: string): Promise<EnrollableStudy> {
  const r = await q.query<StudyRow>(`SELECT ${STUDY_COLUMNS} FROM studies WHERE id = $1`, [studyId]);
  if (!r.rows[0]) throw new StudyEngineError("study_not_found", "Study not found.");
  return toStudy(r.rows[0]);
}

/** Pseudonymous participant code: "P-" + 10 Crockford base32 characters (≈ 50 bits). */
export function generateParticipantCode(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "P-";
  for (let i = 0; i < 10; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

export interface EnrolResult {
  participantId: string;
  code: string;
  repeatOf: string | null;
}

/**
 * Creates a pseudonymous participant (no PII). A researcher-entered stratum is accepted only when
 * the study allocates at enrolment; otherwise the stratum comes from the scored pre-test.
 * `previousParticipantIds` (participation-history cookie) flag or refuse a repeat enrolment.
 */
export async function enrolParticipant(
  q: Q,
  study: EnrollableStudy,
  opts: { stratum?: string | null; previousParticipantIds?: string[] } = {},
): Promise<EnrolResult> {
  const stratum = opts.stratum ?? null;
  const alloc = study.protocol.config.allocation;
  if (alloc.point === "enrolment" && alloc.algorithm === "stratified_block") {
    if (!stratum || !study.strata.includes(stratum)) throw new StudyEngineError("study_misconfigured", "Choose your group.", { missing: "stratum" });
  } else if (stratum !== null && !study.strata.includes(stratum)) {
    throw new StudyEngineError("study_misconfigured", "Unknown group.");
  }
  const previous = opts.previousParticipantIds ?? [];
  let repeatOf: string | null = null;
  if (previous.length > 0) {
    const r = await q.query<{ id: string }>(
      "SELECT id FROM participants WHERE study_id = $1 AND id = ANY($2::uuid[]) ORDER BY enrolled_at DESC LIMIT 1",
      [study.id, previous],
    );
    repeatOf = r.rows[0]?.id ?? null;
    if (repeatOf && study.protocol.config.enrolment.blockRepeatBrowser) {
      await journal(q, { kind: "system" }, "study.repeat_enrolment_refused", "study", study.id, { previousParticipantId: repeatOf });
      throw new StudyEngineError("repeat_browser", "This browser has already been used to take part in this study.");
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateParticipantCode();
    const r = await q.query<{ id: string }>(
      "INSERT INTO participants (study_id, code, stratum) VALUES ($1, $2, $3) ON CONFLICT (study_id, code) DO NOTHING RETURNING id",
      [study.id, code, stratum],
    );
    const id = r.rows[0]?.id;
    if (!id) continue;
    await journal(q, { kind: "participant", code }, "study.participant_enrolled", "participant", id, { studyId: study.id, stratum });
    if (repeatOf) {
      await journal(q, { kind: "system" }, "study.repeat_enrolment_detected", "participant", id, { studyId: study.id, previousParticipantId: repeatOf });
    }
    return { participantId: id, code, repeatOf };
  }
  throw new Error("could not generate a unique participant code");
}

export interface ParticipantSummary {
  id: string;
  code: string;
  studyId: string;
  status: string;
  latestConsent: { decision: string; version: string; recordedAt: Date } | null;
  sessionId: string | null;
}

export async function loadParticipant(q: Q, participantId: string): Promise<ParticipantSummary | null> {
  const r = await q.query<{
    id: string; code: string; study_id: string; status: string; decision: string | null; consent_version: string | null; recorded_at: Date | null; session_id: string | null;
  }>(
    `SELECT p.id, p.code, p.study_id, p.status, c.decision, c.consent_version, c.recorded_at,
            (SELECT ss.id FROM study_sessions ss WHERE ss.participant_id = p.id ORDER BY ss.period DESC LIMIT 1) AS session_id
       FROM participants p
       LEFT JOIN LATERAL (
         SELECT decision, consent_version, recorded_at FROM consent_records
          WHERE participant_id = p.id ORDER BY recorded_at DESC, id DESC LIMIT 1
       ) c ON true
      WHERE p.id = $1`,
    [participantId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    studyId: row.study_id,
    status: row.status,
    latestConsent: row.decision ? { decision: row.decision, version: row.consent_version!, recordedAt: row.recorded_at! } : null,
    sessionId: row.session_id,
  };
}

/** sha256 of the consent text exactly as configured (and shown). */
export function consentTextSha256(text: string): string {
  return sha256(text);
}

/**
 * Records the consent decision for the consent version currently configured. One decision per
 * enrolment: a second decision is refused (a later withdrawal goes through `withdraw`).
 */
export async function recordConsent(
  q: Q,
  input: { participantId: string; study: EnrollableStudy; decision: "granted" | "declined"; shownVersion: string },
): Promise<void> {
  const consent = input.study.protocol.config.consent;
  if (!consent) throw new StudyEngineError("study_misconfigured", "The study has no consent text configured.");
  if (input.shownVersion !== consent.version) throw new StudyEngineError("study_misconfigured", "The consent text changed; please read it again.");
  const p = await loadParticipant(q, input.participantId);
  if (!p || p.studyId !== input.study.id) throw new StudyEngineError("participant_not_found", "Participant not found.");
  if (p.latestConsent) throw new StudyEngineError("consent_already_recorded", "A consent decision is already recorded.");
  await q.query(
    "INSERT INTO consent_records (participant_id, consent_version, consent_text_sha256, decision, method) VALUES ($1, $2, $3, $4, 'on_screen')",
    [p.id, consent.version, consentTextSha256(consent.text), input.decision],
  );
  await journal(q, { kind: "participant", code: p.code }, "study.consent_recorded", "participant", p.id, { decision: input.decision, consentVersion: consent.version });
}

// ---------------------------------------------------------------------------------------------
// Sessions and allocation
// ---------------------------------------------------------------------------------------------

export interface OpenedSession {
  sessionId: string;
  participantId: string;
  /** null while not yet allocated (allocation after the pre-test). */
  condition: LearningCondition | null;
  conditionId: string | null;
  created: boolean;
}

/** Seed recorded on every allocation: the configured one, else a documented derivation. */
export function allocationSeed(study: Pick<EnrollableStudy, "id" | "protocolVersion" | "protocol">): string {
  return study.protocol.config.allocation.seed ?? `study:${study.id}:protocol:${study.protocolVersion}`;
}

/** Leading condition-blind steps of the journey (taken before allocation). */
export function blindPrefix(protocol: StudyProtocol): StudyStep[] {
  if (protocol.config.allocation.point !== "after_pre_test") return [];
  const out: StudyStep[] = [];
  for (const s of protocol.steps) {
    if (!BLIND_STEPS.includes(s)) break;
    out.push(s);
  }
  return out;
}

/**
 * Opens the participant's session after granted consent. At `point = enrolment` the participant
 * is allocated at once; otherwise the session starts without a condition and is allocated after
 * the blind steps (immediately, if the protocol has none).
 */
export async function openSessionAfterConsent(pool: Pool | PoolClient, input: { participantId: string; studyId: string; appBuild: string }): Promise<OpenedSession> {
  const study = await loadStudy(pool, input.studyId);
  if (study.protocol.config.allocation.point === "enrolment") return allocateAndOpenSession(pool, input);
  const opened = await withTx(pool, async (c) => {
    const p = await loadParticipant(c, input.participantId);
    if (!p || p.studyId !== study.id) throw new StudyEngineError("participant_not_found", "Participant not found.");
    if (p.latestConsent?.decision !== "granted") throw new StudyEngineError("consent_required", "Consent is required before the session starts.");
    const existing = await c.query<{ id: string; condition_id: string | null; interface: ConditionInterface | null }>(
      `SELECT ss.id, ss.condition_id, sc.interface FROM study_sessions ss LEFT JOIN study_conditions sc ON sc.id = ss.condition_id
        WHERE ss.participant_id = $1 ORDER BY ss.period DESC LIMIT 1`,
      [p.id],
    );
    if (existing.rows[0]) {
      const e = existing.rows[0];
      return { sessionId: e.id, participantId: p.id, condition: conditionFromInterface(e.interface), conditionId: e.condition_id, created: false };
    }
    const s = await c.query<{ id: string }>(
      `INSERT INTO study_sessions (study_id, participant_id, period, app_build, status, started_at, last_activity_at)
       VALUES ($1, $2, 1, $3, 'in_progress', now(), now()) RETURNING id`,
      [study.id, p.id, input.appBuild],
    );
    await c.query("UPDATE participants SET status = 'active' WHERE id = $1 AND status = 'enrolled'", [p.id]);
    await journal(c, { kind: "participant", code: p.code }, "study.session_opened", "study_session", s.rows[0]!.id, { allocationPoint: "after_pre_test", blindSteps: blindPrefix(study.protocol) });
    return { sessionId: s.rows[0]!.id, participantId: p.id, condition: null, conditionId: null, created: true };
  });
  if (opened.condition === null && blindPrefix(study.protocol).length === 0) {
    const a = await allocateSession(pool, opened.sessionId);
    return { ...opened, condition: a.condition, conditionId: a.conditionId };
  }
  return opened;
}

interface DrawContext {
  study: EnrollableStudy;
  participantId: string;
  stratum: string | null;
  /** How the stratum was obtained (recorded with the allocation). */
  stratumSource: Record<string, unknown> | null;
}

/** Draws and inserts the period-1 allocation (caller holds the per-study lock). */
async function drawAndInsertAllocation(c: PoolClient, ctx: DrawContext): Promise<{ allocationId: string; conditionId: string; conditionCode: string; iface: ConditionInterface; record: Record<string, unknown> }> {
  const { study } = ctx;
  const conds = await c.query<{ id: string; code: string; allocation_weight: number; interface: ConditionInterface }>(
    "SELECT id, code, allocation_weight, interface FROM study_conditions WHERE study_id = $1",
    [study.id],
  );
  const conditions: AllocatableCondition[] = conds.rows.map((r) => ({ id: r.id, code: r.code, weight: r.allocation_weight }));
  const alloc = study.protocol.config.allocation;
  const algorithm = alloc.algorithm;
  if (algorithm !== "block" && algorithm !== "stratified_block" && algorithm !== "simple") {
    throw new StudyEngineError("study_misconfigured", `Allocation algorithm ${algorithm} cannot be drawn automatically.`);
  }
  const seq = await c.query<{ next: number }>("SELECT coalesce(max(sequence_index) + 1, 0)::int AS next FROM allocations WHERE study_id = $1 AND period = 1", [study.id]);
  const sequenceIndex = seq.rows[0]!.next;
  let index = sequenceIndex;
  if (algorithm === "stratified_block") {
    const s = await c.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM allocations WHERE study_id = $1 AND period = 1 AND stratum = $2 AND algorithm = 'stratified_block'",
      [study.id, ctx.stratum],
    );
    index = s.rows[0]!.n;
  }
  const seed = allocationSeed(study);
  const draw = drawCondition({ algorithm: algorithm as DrawAlgorithm, seed, conditions, index, stratum: ctx.stratum, blockSize: alloc.blockSize });
  const a = await c.query<{ id: string; allocated_at: Date }>(
    `INSERT INTO allocations (study_id, participant_id, condition_id, period, algorithm, seed, sequence_index, block_index, stratum, study_protocol_version)
     VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9) RETURNING id, allocated_at`,
    [study.id, ctx.participantId, draw.conditionId, algorithm, seed, sequenceIndex, draw.blockIndex, ctx.stratum, study.protocolVersion],
  );
  return {
    allocationId: a.rows[0]!.id,
    conditionId: draw.conditionId,
    conditionCode: draw.conditionCode,
    iface: conds.rows.find((r) => r.id === draw.conditionId)!.interface,
    record: {
      allocationId: a.rows[0]!.id,
      algorithm,
      seed,
      sequenceIndex,
      stratum: ctx.stratum,
      stratumIndex: algorithm === "stratified_block" ? index : null,
      stratumSource: ctx.stratumSource,
      blockIndex: draw.blockIndex,
      positionInBlock: draw.positionInBlock,
      blockSize: draw.blockIndex === null ? null : (alloc.blockSize ?? null),
      conditionCode: draw.conditionCode,
      allocationPoint: alloc.point,
      studyProtocolVersion: study.protocolVersion,
      allocatedAt: a.rows[0]!.allocated_at.toISOString(),
    },
  };
}

/**
 * Allocation at enrolment (`allocation.point = enrolment`): allocates and opens the session in
 * one step. Idempotent: a participant who already has a session gets it back.
 */
export async function allocateAndOpenSession(pool: Pool | PoolClient, input: { participantId: string; studyId: string; appBuild: string }): Promise<OpenedSession> {
  return withTx(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ie-allocation:' || $1, 0))", [input.studyId]);
    const study = await loadStudy(c, input.studyId);
    if (study.design !== "between") throw new StudyEngineError("unsupported_design", "Within-subjects sessions are not supported by the study engine.");
    const p = await loadParticipant(c, input.participantId);
    if (!p || p.studyId !== study.id) throw new StudyEngineError("participant_not_found", "Participant not found.");
    if (p.latestConsent?.decision !== "granted") throw new StudyEngineError("consent_required", "Consent is required before allocation.");
    const existing = await c.query<{ id: string; condition_id: string | null; interface: ConditionInterface | null }>(
      `SELECT ss.id, ss.condition_id, sc.interface FROM study_sessions ss LEFT JOIN study_conditions sc ON sc.id = ss.condition_id
        WHERE ss.participant_id = $1 ORDER BY ss.period DESC LIMIT 1`,
      [p.id],
    );
    if (existing.rows[0]) {
      const e = existing.rows[0];
      return { sessionId: e.id, participantId: p.id, condition: conditionFromInterface(e.interface), conditionId: e.condition_id, created: false };
    }
    const stratumRow = await c.query<{ stratum: string | null }>("SELECT stratum FROM participants WHERE id = $1", [p.id]);
    const stratum = stratumRow.rows[0]?.stratum ?? null;
    const d = await drawAndInsertAllocation(c, { study, participantId: p.id, stratum, stratumSource: stratum ? { source: "researcher_entered" } : null });
    const s = await c.query<{ id: string }>(
      `INSERT INTO study_sessions (study_id, participant_id, condition_id, allocation_id, period, app_build, status, started_at, last_activity_at)
       VALUES ($1, $2, $3, $4, 1, $5, 'in_progress', now(), now()) RETURNING id`,
      [study.id, p.id, d.conditionId, d.allocationId, input.appBuild],
    );
    await c.query("UPDATE participants SET status = 'active' WHERE id = $1 AND status = 'enrolled'", [p.id]);
    const sessionId = s.rows[0]!.id;
    await journal(c, { kind: "system" }, "study.allocated", "study_session", sessionId, d.record);
    return { sessionId, participantId: p.id, condition: conditionFromInterface(d.iface), conditionId: d.conditionId, created: true };
  });
}

/** Sum of the keyed pre-test items of this session (item.key_match). Null when none is keyed. */
async function preTestScore(q: Q, s: SessionState): Promise<{ score: number; keyedItems: number; assessments: string[] } | null> {
  const pre = await listStepAssessments(q, s, "pre_test");
  if (pre.length === 0) return null;
  const r = await q.query<{ total: number | null; n: number }>(
    `SELECT sum(ds.value)::float8 AS total, count(*)::int AS n FROM derived_scores ds
      WHERE ds.session_id = $1 AND ds.assessment_id = ANY($2::uuid[]) AND ds.metric_name = $3 AND ds.metric_version = $4 AND ds.value IS NOT NULL`,
    [s.sessionId, pre.map((a) => a.id), KEY_MATCH_METRIC.name, KEY_MATCH_METRIC.version],
  );
  const row = r.rows[0]!;
  if (row.n === 0 || row.total === null) return null;
  return { score: row.total, keyedItems: row.n, assessments: pre.map((a) => `${a.code}.v${a.version}`) };
}

/** cmap.recall.dl of the final pre map against the study's locked reference map (assessment services). */
async function preMapRecall(q: Q, s: SessionState): Promise<{ score: number; conceptMapId: string; referenceMapId: string; referenceVersion: number } | { refused: string }> {
  const pre = await listStepAssessments(q, s, "pre_reconstruction");
  if (pre.length !== 1) return { refused: `the pre_reconstruction step must have exactly one reconstruction assessment (found ${pre.length})` };
  const a = pre[0]!;
  const ref = await q.query<{ id: string; version: number }>(
    `SELECT id, version FROM reference_maps WHERE assessment_id = $1 AND status = 'locked' AND (snapshot_id IS NULL OR snapshot_id = $2)
      ORDER BY version DESC LIMIT 1`,
    [a.id, s.study.snapshotId],
  );
  if (!ref.rows[0]) return { refused: `no locked reference map for ${a.code} v${a.version} bound to the study snapshot` };
  const map = await q.query<{ id: string }>("SELECT id FROM concept_maps WHERE session_id = $1 AND assessment_id = $2 AND phase = 'pre' AND is_final", [s.sessionId, a.id]);
  if (!map.rows[0]) return { refused: "no final pre-test concept map" };
  try {
    const scored = await scoreFinalMap(q, map.rows[0].id, ref.rows[0].id);
    const recall = scored.scores.find((x) => x.metricName === PRE_MAP_METRIC);
    if (!recall || recall.value === null) return { refused: `${PRE_MAP_METRIC} is undefined for this map and reference (no expected edges)` };
    return { score: recall.value, conceptMapId: map.rows[0].id, referenceMapId: ref.rows[0].id, referenceVersion: ref.rows[0].version };
  } catch (err) {
    if (err instanceof AssessmentError) return { refused: `the pre map could not be scored: ${err.message}` };
    throw err;
  }
}

/**
 * Allocates an unallocated session once its blind steps are done (allocation after the pre-test,
 * D3), with the stratum from the scored pre-test when `allocation.stratifyBy` is set. Refuses
 * (protocol error, `allocation_refused`) when that score cannot be computed: there is no silent
 * fallback. Idempotent.
 */
export async function allocateSession(pool: Pool | PoolClient, sessionId: string): Promise<{ condition: LearningCondition; conditionId: string; created: boolean }> {
  const result = await withTx(pool, async (c) => {
    const pre = await loadSessionState(c, sessionId);
    if (!pre) throw new StudyEngineError("session_closed", "The session does not exist.");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ie-allocation:' || $1, 0))", [pre.study.id]);
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    const s = (await loadSessionState(c, sessionId))!;
    if (s.condition !== null && s.conditionId !== null) return { condition: s.condition, conditionId: s.conditionId, created: false };
    if (!isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    // Facts recorded elsewhere (a final pre map) complete their blind step first.
    const pos = await syncPosition(c, s);
    if (pos.kind !== "allocation") {
      const missing = blindPrefix(s.study.protocol).filter((x) => !completedSteps(s).has(x));
      throw new StudyEngineError("not_current_step", `Allocation follows ${missing.join(", ") || "the blind steps"}.`);
    }

    let stratum: string | null = null;
    let stratumSource: Record<string, unknown> | null = null;
    const by = s.study.protocol.config.allocation.stratifyBy;
    if (by) {
      let score: number;
      let evidence: Record<string, unknown>;
      if (by.source === "pre_test_score") {
        const r = await preTestScore(c, s);
        if (!r) return { refused: { source: by.source, reason: "the pre-test score cannot be computed (no keyed pre-test items were scored)" }, s };
        score = r.score;
        evidence = { keyedItems: r.keyedItems, assessments: r.assessments, metric: KEY_MATCH_METRIC.name };
      } else {
        const r = await preMapRecall(c, s);
        if ("refused" in r) return { refused: { source: by.source, reason: `the pre-test map recall cannot be computed (${r.refused})` }, s };
        score = r.score;
        evidence = { metric: PRE_MAP_METRIC, conceptMapId: r.conceptMapId, referenceMapId: r.referenceMapId, referenceVersion: r.referenceVersion };
      }
      stratum = score <= by.cutoff ? "low" : "high";
      stratumSource = { source: by.source, score, cutoff: by.cutoff, rule: "low = score ≤ cutoff, else high", ...evidence };
    }
    const d = await drawAndInsertAllocation(c, { study: s.study, participantId: s.participantId, stratum, stratumSource });
    await c.query("UPDATE study_sessions SET condition_id = $2, allocation_id = $3, last_activity_at = now() WHERE id = $1", [sessionId, d.conditionId, d.allocationId]);
    if (stratum) await c.query("UPDATE participants SET stratum = $2 WHERE id = $1 AND stratum IS NULL", [s.participantId, stratum]);
    await journal(c, { kind: "system" }, "study.allocated", "study_session", sessionId, d.record);
    return { condition: conditionFromInterface(d.iface), conditionId: d.conditionId, created: true };
  });
  if ("refused" in result && result.refused) {
    // Recorded outside the (rolled-back) allocation transaction, then refused: never a silent fallback.
    await journal(pool, { kind: "system" }, "study.allocation_refused", "study_session", sessionId, result.refused);
    throw new StudyEngineError("allocation_refused", `Protocol error: ${result.refused.reason}.`, result.refused);
  }
  if (!("conditionId" in result) || result.condition === null) throw new Error("allocation returned no condition");
  return { condition: result.condition, conditionId: result.conditionId, created: result.created };
}

// ---------------------------------------------------------------------------------------------
// Session state and step sequencing
// ---------------------------------------------------------------------------------------------

export interface JournalEntry {
  action: string;
  after: Record<string, unknown>;
  occurredAt: Date;
}

export interface SessionState {
  sessionId: string;
  participantId: string;
  participantCode: string;
  participantStatus: string;
  study: EnrollableStudy;
  /** Null before allocation. */
  conditionId: string | null;
  conditionCode: string | null;
  conditionInterface: ConditionInterface | null;
  condition: LearningCondition | null;
  conditionConfig: Record<string, unknown>;
  period: number;
  status: string;
  withdrawn: boolean;
  excluded: boolean;
  startedAt: Date | null;
  lastActivityAt: Date | null;
  interruptionCount: number;
  device: Record<string, unknown>;
  snapshotLabel: string | null;
  learning: { startedAt: Date | null; endsAt: Date | null; endedAt: Date | null };
  assessmentVersions: Record<string, number>;
  journal: JournalEntry[];
  now: Date;
}

export async function loadSessionState(q: Q, sessionId: string): Promise<SessionState | null> {
  const r = await q.query<{
    id: string; participant_id: string; code: string; p_status: string; study_id: string; condition_id: string | null; c_code: string | null; interface: ConditionInterface | null;
    c_config: Record<string, unknown> | null; period: number; status: string; withdrawn: boolean; excluded: boolean; started_at: Date | null; last_activity_at: Date | null;
    interruption_count: number; device: Record<string, unknown>; version_label: string | null; learning_started_at: Date | null; learning_ends_at: Date | null;
    learning_ended_at: Date | null; assessment_versions: Record<string, number>; now: Date;
  }>(
    `SELECT ss.id, ss.participant_id, p.code, p.status AS p_status, ss.study_id, ss.condition_id, sc.code AS c_code, sc.interface, sc.config AS c_config,
            ss.period, ss.status, ss.withdrawn, ss.excluded, ss.started_at, ss.last_activity_at, ss.interruption_count, ss.device,
            cs.version_label, ss.learning_started_at, ss.learning_ends_at, ss.learning_ended_at, ss.assessment_versions, now() AS now
       FROM study_sessions ss
       JOIN participants p ON p.id = ss.participant_id
       LEFT JOIN study_conditions sc ON sc.id = ss.condition_id
       LEFT JOIN content_snapshots cs ON cs.id = ss.snapshot_id
      WHERE ss.id = $1`,
    [sessionId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const study = await loadStudy(q, row.study_id);
  const j = await q.query<{ action: string; after: Record<string, unknown> | null; occurred_at: Date }>(
    "SELECT action, after, occurred_at FROM audit_log WHERE entity = 'study_session' AND entity_id = $1 ORDER BY occurred_at, id",
    [sessionId],
  );
  return {
    sessionId: row.id,
    participantId: row.participant_id,
    participantCode: row.code,
    participantStatus: row.p_status,
    study,
    conditionId: row.condition_id,
    conditionCode: row.c_code,
    conditionInterface: row.interface,
    condition: conditionFromInterface(row.interface),
    conditionConfig: row.c_config ?? {},
    period: row.period,
    status: row.status,
    withdrawn: row.withdrawn,
    excluded: row.excluded,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    interruptionCount: row.interruption_count,
    device: row.device ?? {},
    snapshotLabel: row.version_label,
    learning: { startedAt: row.learning_started_at, endsAt: row.learning_ends_at, endedAt: row.learning_ended_at },
    assessmentVersions: row.assessment_versions ?? {},
    journal: j.rows.map((x) => ({ action: x.action, after: x.after ?? {}, occurredAt: x.occurred_at })),
    now: row.now,
  };
}

export function isSessionOpen(s: SessionState): boolean {
  return !s.withdrawn && !s.excluded && s.status !== "completed" && s.status !== "abandoned" && (s.participantStatus === "enrolled" || s.participantStatus === "active");
}

export function completedSteps(s: Pick<SessionState, "journal">): Set<StudyStep> {
  const done = new Set<StudyStep>();
  for (const e of s.journal) if (e.action === "study.step_completed" && typeof e.after.step === "string") done.add(e.after.step as StudyStep);
  return done;
}

export function deviceCheckPassed(s: Pick<SessionState, "journal">): boolean {
  return s.journal.some((e) => e.action === "study.device_checked" && e.after.outcome === "passed");
}

export type Position =
  | { kind: "step"; step: StudyStep; index: number }
  | { kind: "allocation" }
  | { kind: "device_check" }
  | { kind: "finish" };

/**
 * Where the participant is. Pure. `blind` = the leading condition-blind steps taken before
 * allocation (empty when allocating at enrolment). Order: blind steps → allocation → device check
 * → the remaining steps → finish.
 */
export function positionOf(input: {
  steps: readonly StudyStep[];
  blind: readonly StudyStep[];
  done: ReadonlySet<StudyStep>;
  allocated: boolean;
  devicePassed: boolean;
}): Position {
  const { steps, blind, done } = input;
  for (const step of blind) if (!done.has(step)) return { kind: "step", step, index: steps.indexOf(step) };
  if (!input.allocated) return { kind: "allocation" };
  if (!input.devicePassed) return { kind: "device_check" };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (!done.has(step)) return { kind: "step", step, index: i };
  }
  return { kind: "finish" };
}

function positionOfState(s: SessionState): Position {
  return positionOf({
    steps: s.study.protocol.steps,
    blind: blindPrefix(s.study.protocol),
    done: completedSteps(s),
    allocated: s.condition !== null,
    devicePassed: deviceCheckPassed(s),
  });
}

async function markStepCompleted(q: Q, s: SessionState, step: StudyStep, details: Record<string, unknown> = {}): Promise<void> {
  if (completedSteps(s).has(step)) return;
  await journal(q, { kind: "participant", code: s.participantCode }, "study.step_completed", "study_session", s.sessionId, { step, ...details });
  s.journal.push({ action: "study.step_completed", after: { step, ...details }, occurredAt: new Date() });
}

export async function touch(q: Q, sessionId: string): Promise<void> {
  await q.query("UPDATE study_sessions SET last_activity_at = now() WHERE id = $1", [sessionId]);
}

/** Which study_assessments rows each non-questionnaire assessment step delivers. */
export const STEP_ASSESSMENTS: Partial<Record<StudyStep, { phase: "pre" | "post"; kind: string }>> = {
  pre_test: { phase: "pre", kind: "pretest" },
  pre_reconstruction: { phase: "pre", kind: "reconstruction" },
  post_test: { phase: "post", kind: "posttest" },
  reconstruction: { phase: "post", kind: "reconstruction" },
  transfer: { phase: "post", kind: "transfer" },
};

export function isAssessmentStep(step: StudyStep): boolean {
  return !!STEP_ASSESSMENTS[step] || isQuestionnaireStep(step);
}

export interface StepAssessment {
  id: string;
  code: string;
  version: number;
  kind: string;
  title: string;
  description: string | null;
  config: Record<string, unknown>;
  required: boolean;
  items: DeliveredItem[];
}

type AssessmentRow = { id: string; code: string; version: number; kind: string; title: string; description: string | null; config: Record<string, unknown>; required: boolean };

async function withItems(q: Q, rows: AssessmentRow[]): Promise<StepAssessment[]> {
  if (rows.length === 0) return [];
  const items = await q.query<{ id: string; assessment_id: string; item_key: string; position: number; kind: string; prompt: string; config: unknown; answer_key: unknown }>(
    "SELECT id, assessment_id, item_key, position, kind, prompt, config, answer_key FROM assessment_items WHERE assessment_id = ANY($1::uuid[]) ORDER BY position",
    [rows.map((x) => x.id)],
  );
  return rows.map((x) => ({
    ...x,
    config: x.config ?? {},
    items: items.rows
      .filter((i) => i.assessment_id === x.id)
      .map((i) => ({ id: i.id, itemKey: i.item_key, position: i.position, kind: i.kind, prompt: i.prompt, config: i.config, answerKey: i.answer_key })),
  }));
}

/**
 * The assessments a step delivers to THIS session. Tests and maps come from the study battery
 * by phase and kind. Questionnaire steps take their instruments from `config.questionnaires`,
 * in config order, resolved against the study battery (an instrument must be in the battery,
 * so the activation lock covers it), filtered by condition (the config's `conditions` and the
 * instrument definition's own limit). Before allocation, condition-limited instruments are left
 * out (only blind steps run then).
 */
export async function listStepAssessments(q: Q, s: Pick<SessionState, "study" | "condition">, step: StudyStep): Promise<StepAssessment[]> {
  const studyId = s.study.id;
  if (isQuestionnaireStep(step)) {
    const refs = instrumentsFor(s.study.protocol, step, s.condition);
    if (refs.length === 0) return [];
    const battery = await q.query<AssessmentRow>(
      `SELECT a.id, a.code, a.version, a.kind, a.title, a.description, a.config, sa.required
         FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id
        WHERE sa.study_id = $1 AND a.kind = 'questionnaire' AND a.code = ANY($2::text[])`,
      [studyId, refs.map((r) => r.code)],
    );
    const out: AssessmentRow[] = [];
    for (const ref of refs) {
      const candidates = battery.rows.filter((a) => a.code === ref.code && (ref.version === undefined || a.version === ref.version)).sort((x, y) => y.version - x.version);
      const a = candidates[0];
      if (!a) {
        throw new StudyEngineError("assessment_not_ready", `instrument ${ref.code}${ref.version ? ` v${ref.version}` : ""} of ${step} is not in the study battery`);
      }
      const only = instrumentConditions(a.config ?? {});
      if (only && (s.condition === null || !only.includes(s.condition))) continue;
      if (!out.some((x) => x.id === a.id)) out.push(a);
    }
    return withItems(q, out);
  }
  const spec = STEP_ASSESSMENTS[step];
  if (!spec) return [];
  const a = await q.query<AssessmentRow>(
    `SELECT a.id, a.code, a.version, a.kind, a.title, a.description, a.config, sa.required
       FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id
      WHERE sa.study_id = $1 AND sa.phase = $2 AND a.kind = $3
      ORDER BY sa.position`,
    [studyId, spec.phase, spec.kind],
  );
  return withItems(q, a.rows);
}

/** Can the engine render this assessment? Researcher-facing reason when not. */
export function assessmentReadiness(a: StepAssessment): { ready: true } | { ready: false; reason: string } {
  const blocker = instrumentBlocker(a);
  if (blocker) return { ready: false, reason: `${a.code} v${a.version}: ${blocker}` };
  if (a.items.length === 0) return { ready: false, reason: `${a.code} v${a.version}: no items` };
  const bad = a.items.filter((i) => !itemConfig(i));
  if (bad.length > 0) return { ready: false, reason: `${a.code} v${a.version}: items not deliverable here: ${bad.map((i) => i.itemKey).join(", ")}` };
  return { ready: true };
}

/** A step starts only when ALL its assessments are showable (instruments with verified wording). */
export function stepReadiness(assessments: StepAssessment[]): { ready: true } | { ready: false; reasons: string[] } {
  const reasons = assessments.map(assessmentReadiness).flatMap((r) => (r.ready ? [] : [r.reason]));
  return reasons.length === 0 ? { ready: true } : { ready: false, reasons };
}

/**
 * Assessment ids already submitted in this session, in one step. Per step, because an
 * instrument may be administered twice (D8: SSQ before and after learning); the second
 * administration is stored as attempt 2.
 */
export function submittedAssessments(s: Pick<SessionState, "journal">, step: StudyStep): Set<string> {
  const out = new Set<string>();
  for (const e of s.journal) {
    if (e.action === "study.assessment_submitted" && typeof e.after.assessmentId === "string" && e.after.step === step) out.add(e.after.assessmentId);
  }
  return out;
}

/** May the learning phase end now? Budget over, or the study allows finishing (self-paced / early finish). */
export function learningMayEnd(s: Pick<SessionState, "learning" | "now" | "study">): boolean {
  if (!s.learning.startedAt) return false;
  if (s.learning.endsAt) return s.now >= s.learning.endsAt || s.study.protocol.config.exposure.allowEarlyFinish;
  return true; // self-paced
}

/**
 * Brings the journal up to date with facts recorded elsewhere, then returns the position:
 *  - learning: a fixed budget that ran out on the server clock is ended now (same rule in both
 *    conditions); with `arrivedAtHub` (the learning phase handed the participant back to
 *    /study/session) the end is recorded whenever the study allows it;
 *  - reconstruction: the step completes when every concept-map item of the phase has a FINAL map
 *    (written by the assessment module's page);
 *  - an assessment step with nothing to deliver for this session is completed as `empty`.
 */
export async function syncPosition(q: Q, s: SessionState, opts: { arrivedAtHub?: boolean } = {}): Promise<Position> {
  for (;;) {
    const pos = positionOfState(s);
    if (pos.kind !== "step") return pos;
    const step = pos.step;
    if (step === "learning") {
      const budgetOver = !!s.learning.endsAt && s.now >= s.learning.endsAt;
      if (!s.learning.endedAt && s.learning.startedAt && (budgetOver || (opts.arrivedAtHub && learningMayEnd(s)))) {
        const clock = await recordLearningEnded(q, s.sessionId);
        s.learning.endedAt = clock.endedAt ? new Date(clock.endedAt) : null;
      }
      if (!s.learning.endedAt) return pos;
      await markStepCompleted(q, s, "learning", { endedAt: s.learning.endedAt.toISOString(), reason: s.learning.endsAt && s.learning.endedAt >= s.learning.endsAt ? "budget_ended" : "finished" });
      continue;
    }
    if (!isAssessmentStep(step)) return pos;
    const assessments = await listStepAssessments(q, s, step);
    if (assessments.length === 0) {
      await markStepCompleted(q, s, step, { empty: true });
      continue;
    }
    if (step === "pre_reconstruction" || step === "reconstruction") {
      const phase = step === "pre_reconstruction" ? "pre" : "post";
      const itemIds = assessments.flatMap((a) => a.items.filter((i) => i.kind === "concept_map").map((i) => i.id));
      if (itemIds.length > 0) {
        const r = await q.query<{ n: number }>(
          "SELECT count(DISTINCT item_id)::int AS n FROM concept_maps WHERE session_id = $1 AND phase = $2 AND is_final AND item_id = ANY($3::uuid[])",
          [s.sessionId, phase, itemIds],
        );
        if (r.rows[0]!.n >= itemIds.length) {
          await markStepCompleted(q, s, step, { finalMaps: itemIds.length });
          continue;
        }
      }
    }
    return pos;
  }
}

// ---------------------------------------------------------------------------------------------
// Device check and the WebGL-failure policy
// ---------------------------------------------------------------------------------------------

export interface DeviceReport {
  viewport: { width: number; height: number };
  devicePixelRatio?: number;
  webglVersion: 1 | 2 | null;
  inputDevices: ("mouse" | "keyboard" | "touch" | "gamepad" | "xr")[];
  reducedMotion?: boolean;
  highContrast?: boolean;
  /** The High contrast accommodation the participant chose in Display Settings before learning (DR-019). */
  contrastAccommodation?: boolean;
  browserFamily?: string;
}

export type DeviceOutcome =
  | { kind: "passed" }
  | { kind: "retry"; reason: "viewport_too_small" | "webgl_unavailable"; minViewport?: { width: number; height: number } }
  | { kind: "excluded" }
  | { kind: "reassigned"; sessionId: string; condition: LearningCondition };

/** Pure: what the check means for this session under the study's policy. */
export function evaluateDevice(
  report: DeviceReport,
  ctx: { condition: LearningCondition; policy: "exclude" | "retry" | "reassign"; minViewport?: { width: number; height: number } },
): "passed" | "viewport_too_small" | "webgl_retry" | "webgl_exclude" | "webgl_reassign" {
  const min = ctx.minViewport;
  if (min && (report.viewport.width < min.width || report.viewport.height < min.height)) return "viewport_too_small";
  if (ctx.condition === "immersive" && report.webglVersion === null) {
    return ctx.policy === "exclude" ? "webgl_exclude" : ctx.policy === "reassign" ? "webgl_reassign" : "webgl_retry";
  }
  return "passed";
}

/**
 * Records the device check in `study_sessions.device` (coarse covariates only, no fingerprint)
 * and applies the WebGL-failure policy (config `webglFailurePolicy`, Q-R10). It runs after
 * allocation (D3/D8), identically for both conditions; only a missing WebGL in the immersive
 * condition triggers the policy.
 */
export async function recordDeviceCheck(pool: Pool | PoolClient, sessionId: string, report: DeviceReport, opts: { appBuild: string }): Promise<DeviceOutcome> {
  return withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    if (deviceCheckPassed(s)) return { kind: "passed" };
    if (s.condition === null) throw new StudyEngineError("not_allocated", "The device check follows allocation.");
    const minViewport = s.study.protocol.config.device.minViewport;
    const policy = s.study.protocol.config.webglFailurePolicy;
    const verdict = evaluateDevice(report, { condition: s.condition, policy, minViewport });
    const attempt = s.journal.filter((e) => e.action === "study.device_checked").length + 1;
    const device = {
      viewport: report.viewport,
      devicePixelRatio: report.devicePixelRatio,
      inputDevices: report.inputDevices,
      webglVersion: report.webglVersion,
      reducedMotion: report.reducedMotion,
      highContrast: report.highContrast,
      contrastAccommodation: report.contrastAccommodation,
      browserFamily: report.browserFamily,
      check: { attempt, verdict, checkedAt: s.now.toISOString(), minViewport: minViewport ?? null, webglFailurePolicy: policy },
    };
    await c.query("UPDATE study_sessions SET device = $2::jsonb, last_activity_at = now() WHERE id = $1", [sessionId, JSON.stringify(device)]);
    const actor: Actor = { kind: "participant", code: s.participantCode };
    const outcome = verdict === "passed" ? "passed" : verdict === "viewport_too_small" || verdict === "webgl_retry" ? "retry" : verdict === "webgl_exclude" ? "excluded" : "reassigned";
    await journal(c, actor, "study.device_checked", "study_session", sessionId, { outcome, verdict, attempt, webglVersion: report.webglVersion, viewport: report.viewport });

    switch (verdict) {
      case "passed":
        return { kind: "passed" };
      case "viewport_too_small":
        return { kind: "retry", reason: "viewport_too_small", minViewport };
      case "webgl_retry":
        return { kind: "retry", reason: "webgl_unavailable" };
      case "webgl_exclude": {
        const reason = "webgl_unavailable: excluded by webglFailurePolicy=exclude";
        await c.query("UPDATE study_sessions SET excluded = true, exclusion_reason = $2, excluded_at = now(), status = 'abandoned' WHERE id = $1", [sessionId, reason]);
        await c.query("UPDATE participants SET status = 'excluded', exclusion_reason = $2 WHERE id = $1", [s.participantId, reason]);
        await journal(c, { kind: "system" }, "study.participant_excluded", "study_session", sessionId, { rule: "webglFailurePolicy", policy }, reason);
        return { kind: "excluded" };
      }
      case "webgl_reassign":
        return reassignToConventional(c, s, device, opts.appBuild);
    }
  });
}

/**
 * Reassignment under `webglFailurePolicy = reassign`: allocations and session identities are
 * immutable, so the immersive session is closed (abandoned) and a NEW allocation (period 2,
 * algorithm `manual`, recorded reason) and session for the 2D condition are created. The blind
 * steps already done (their data stay on the first session) are carried over in the journal.
 */
async function reassignToConventional(c: PoolClient, s: SessionState, device: Record<string, unknown>, appBuild: string): Promise<DeviceOutcome> {
  const target = await c.query<{ id: string; code: string }>(
    "SELECT id, code FROM study_conditions WHERE study_id = $1 AND interface = 'conventional_2d' ORDER BY position, code LIMIT 1",
    [s.study.id],
  );
  if (!target.rows[0]) throw new StudyEngineError("study_misconfigured", "No conventional condition to reassign to.");
  const orig = await c.query<{ sequence_index: number; seed: string; stratum: string | null }>(
    "SELECT a.sequence_index, a.seed, a.stratum FROM allocations a JOIN study_sessions ss ON ss.allocation_id = a.id WHERE ss.id = $1",
    [s.sessionId],
  );
  const reason = `webgl_unavailable: reassigned from ${s.conditionCode} under webglFailurePolicy=reassign`;
  await c.query("UPDATE study_sessions SET status = 'abandoned', last_activity_at = now() WHERE id = $1", [s.sessionId]);
  const a = await c.query<{ id: string }>(
    `INSERT INTO allocations (study_id, participant_id, condition_id, period, algorithm, seed, sequence_index, stratum, study_protocol_version, override_reason)
     VALUES ($1, $2, $3, $4, 'manual', $5, $6, $7, $8, $9) RETURNING id`,
    [s.study.id, s.participantId, target.rows[0].id, s.period + 1, orig.rows[0]!.seed, orig.rows[0]!.sequence_index, orig.rows[0]!.stratum, s.study.protocolVersion, reason],
  );
  const n = await c.query<{ id: string }>(
    `INSERT INTO study_sessions (study_id, participant_id, condition_id, allocation_id, period, app_build, status, started_at, last_activity_at, device)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', now(), now(), $7::jsonb) RETURNING id`,
    [s.study.id, s.participantId, target.rows[0].id, a.rows[0]!.id, s.period + 1, appBuild, JSON.stringify(device)],
  );
  const newId = n.rows[0]!.id;
  await journal(c, { kind: "system" }, "study.session_reassigned", "study_session", s.sessionId, { toSessionId: newId, toCondition: target.rows[0].code }, reason);
  await journal(c, { kind: "system" }, "study.allocated", "study_session", newId, {
    allocationId: a.rows[0]!.id, algorithm: "manual", overrideReason: reason, fromSessionId: s.sessionId, conditionCode: target.rows[0].code, studyProtocolVersion: s.study.protocolVersion,
  });
  for (const step of completedSteps(s)) {
    await journal(c, { kind: "system" }, "study.step_completed", "study_session", newId, { step, carriedFrom: s.sessionId });
  }
  await journal(c, { kind: "system" }, "study.device_checked", "study_session", newId, { outcome: "passed", verdict: "passed", carriedFrom: s.sessionId });
  return { kind: "reassigned", sessionId: newId, condition: "2d" };
}

// ---------------------------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------------------------

/** Records that an assessment was presented (server time) and the version shown. Idempotent. */
export async function startAssessment(q: Q, s: SessionState, assessment: StepAssessment, step: StudyStep): Promise<{ presentedAt: Date }> {
  const prior = s.journal.find((e) => e.action === "study.assessment_started" && e.after.assessmentId === assessment.id && e.after.step === step);
  if (prior) return { presentedAt: prior.occurredAt };
  await q.query(
    "UPDATE study_sessions SET assessment_versions = assessment_versions || jsonb_build_object($2::text, $3::int), last_activity_at = now() WHERE id = $1",
    [s.sessionId, assessment.id, assessment.version],
  );
  const r = await q.query<{ occurred_at: Date }>(
    `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after)
     VALUES ('participant', $1, 'study.assessment_started', 'study_session', $2, $3::jsonb) RETURNING occurred_at`,
    [s.participantCode, s.sessionId, JSON.stringify({ assessmentId: assessment.id, code: assessment.code, version: assessment.version, step })],
  );
  const presentedAt = r.rows[0]!.occurred_at;
  s.journal.push({ action: "study.assessment_started", after: { assessmentId: assessment.id, step }, occurredAt: presentedAt });
  return { presentedAt };
}

export interface SubmitResult {
  answered: number;
  skipped: number;
  scored: number;
  correct: number;
  stepCompleted: boolean;
}

/**
 * Stores the raw answers (one `responses` row per item: answered, in the shared format of
 * src/features/assessment/responses.ts, or skipped; server presentation and answer times and the
 * client timestamp), scores keyed items with the shared rule into `derived_scores`
 * (`item.key_match`, plus the per-assessment total; never free text or ratings) and, when every
 * assessment of the step is submitted, completes the step. One submission per assessment.
 */
export async function submitAssessment(
  pool: Pool | PoolClient,
  input: { sessionId: string; step: StudyStep; assessmentId: string; values: Record<string, string[]>; clientTs?: string | null },
): Promise<SubmitResult> {
  return withTx(pool, async (c) => {
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [input.sessionId]);
    const s = await loadSessionState(c, input.sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== input.step) throw new StudyEngineError("not_current_step", "This part of the study is not the current step.");
    const assessments = await listStepAssessments(c, s, input.step);
    const a = assessments.find((x) => x.id === input.assessmentId);
    if (!a) throw new StudyEngineError("not_current_step", "This assessment is not part of the current step.");
    if (submittedAssessments(s, input.step).has(a.id)) throw new StudyEngineError("already_submitted", "These answers were already submitted.");
    // A repeated administration (another step) is a new attempt; raw rows are never overwritten.
    const attempt = s.journal.filter((e) => e.action === "study.assessment_submitted" && e.after.assessmentId === a.id).length + 1;
    const ready = stepReadiness(assessments);
    if (!ready.ready) throw new StudyEngineError("assessment_not_ready", ready.reasons.join("; "));

    const parsed = new Map<string, ParsedAnswer>();
    const errors: Record<string, string> = {};
    for (const item of a.items) {
      const p = parseAnswer(item, input.values[item.id] ?? []);
      if (p.status === "invalid") errors[item.id] = p.message;
      parsed.set(item.id, p);
    }
    if (Object.keys(errors).length > 0) throw new StudyEngineError("invalid_answers", "Some answers need attention.", { errors });

    const { presentedAt } = await startAssessment(c, s, a, input.step);
    const clientTs = input.clientTs && !Number.isNaN(Date.parse(input.clientTs)) ? input.clientTs : null;
    let answered = 0;
    let skipped = 0;
    let scored = 0;
    let correct = 0;
    const perItem: { itemKey: string; value: number }[] = [];
    for (const item of a.items) {
      const p = parsed.get(item.id)!;
      const isAnswered = p.status === "answered";
      const r = await c.query<{ id: string }>(
        `INSERT INTO responses (session_id, participant_id, assessment_id, item_id, attempt, status, raw, presented_at, answered_at, client_ts, duration_ms)
         VALUES ($1, $2, $3, $4, $10, $5, $6::jsonb, $7, CASE WHEN $8 THEN now() END, $9,
                 CASE WHEN $8 THEN greatest(0, floor(extract(epoch FROM now() - $7::timestamptz) * 1000))::int END)
         RETURNING id`,
        [
          s.sessionId, s.participantId, a.id, item.id, isAnswered ? "answered" : "skipped",
          isAnswered ? JSON.stringify(toResponseRaw(item, p.value, a.version)) : null,
          presentedAt, isAnswered, clientTs, attempt,
        ],
      );
      if (isAnswered) answered++;
      else skipped++;
      const score = scoreItem(item, p, a.version);
      if (score !== null) {
        scored++;
        correct += score;
        perItem.push({ itemKey: item.itemKey, value: score });
        await c.query(
          `INSERT INTO derived_scores (session_id, participant_id, assessment_id, response_id, metric_name, metric_version, value, details, pipeline_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) ON CONFLICT ON CONSTRAINT derived_scores_uq DO NOTHING`,
          [s.sessionId, s.participantId, a.id, r.rows[0]!.id, KEY_MATCH_METRIC.name, KEY_MATCH_METRIC.version, score, JSON.stringify({ parameters: { rule: "exact_match", answerKey: item.answerKey }, itemKey: item.itemKey }), KEY_MATCH_METRIC.pipeline],
        );
      }
    }
    if (scored > 0) {
      await c.query(
        `INSERT INTO derived_scores (session_id, participant_id, assessment_id, metric_name, metric_version, value, details, pipeline_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) ON CONFLICT ON CONSTRAINT derived_scores_uq DO NOTHING`,
        [s.sessionId, s.participantId, a.id, KEY_MATCH_TOTAL_METRIC.name, KEY_MATCH_TOTAL_METRIC.version, correct, JSON.stringify({ keyedItems: scored, items: a.items.length, assessmentVersion: a.version, perItem }), KEY_MATCH_TOTAL_METRIC.pipeline],
      );
    }
    await journal(c, { kind: "participant", code: s.participantCode }, "study.assessment_submitted", "study_session", s.sessionId, {
      assessmentId: a.id, code: a.code, version: a.version, step: input.step, attempt, answered, skipped,
    });
    s.journal.push({ action: "study.assessment_submitted", after: { assessmentId: a.id, step: input.step }, occurredAt: new Date() });
    await touch(c, s.sessionId);
    const allDone = assessments.every((x) => submittedAssessments(s, input.step).has(x.id));
    if (allDone) await markStepCompleted(c, s, input.step);
    return { answered, skipped, scored, correct, stepCompleted: allDone };
  });
}

// ---------------------------------------------------------------------------------------------
// Familiarisation, onboarding and learning
// ---------------------------------------------------------------------------------------------

/** The practice page opened (server time); idempotent. For the /learn/<condition>/practice pages. */
export async function startFamiliarisation(pool: Pool | PoolClient, sessionId: string): Promise<{ startedAt: Date; minutes: number }> {
  return withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== "familiarisation") throw new StudyEngineError("not_current_step", "Familiarisation is not the current step.");
    const minutes = s.study.protocol.config.familiarisation?.minutes;
    if (!minutes) throw new StudyEngineError("study_misconfigured", "familiarisation.minutes is not set.");
    const prior = s.journal.find((e) => e.action === "study.familiarisation_started");
    if (prior) return { startedAt: prior.occurredAt, minutes };
    await journal(c, { kind: "participant", code: s.participantCode }, "study.familiarisation_started", "study_session", sessionId, { minutes });
    await touch(c, sessionId);
    return { startedAt: s.now, minutes };
  });
}

/** Ends familiarisation once its configured minutes have passed (server clock). Not learning time. */
export async function completeFamiliarisation(pool: Pool | PoolClient, sessionId: string): Promise<void> {
  await withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== "familiarisation") return;
    const started = s.journal.find((e) => e.action === "study.familiarisation_started");
    const minutes = s.study.protocol.config.familiarisation?.minutes ?? 0;
    if (!started || s.now.getTime() - started.occurredAt.getTime() < minutes * 60_000) {
      throw new StudyEngineError("familiarisation_not_finished", "The practice time has not ended yet.");
    }
    await markStepCompleted(c, s, "familiarisation", { minutes });
    await touch(c, sessionId);
  });
}

export async function completeOnboarding(pool: Pool | PoolClient, sessionId: string): Promise<void> {
  await withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind === "step" && pos.step === "onboarding") {
      await markStepCompleted(c, s, "onboarding");
      // The learning clock starts when the participant starts the task, the same moment in both
      // conditions (the learning context would otherwise stamp it on the first page render).
      // Set-once: a later stamp by the learning context is a no-op.
      await c.query("UPDATE study_sessions SET learning_started_at = now() WHERE id = $1 AND learning_started_at IS NULL", [sessionId]);
      await touch(c, sessionId);
    } else if (!completedSteps(s).has("onboarding")) {
      throw new StudyEngineError("not_current_step", "The introduction is not the current step.");
    }
  });
}

/**
 * Ends the learning phase (server time). Refused before the budget runs out unless the study
 * allows an early finish (LearningFinishRefusedError), and before the task was started.
 */
export async function finishLearning(pool: Pool | PoolClient, sessionId: string): Promise<void> {
  await withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== "learning") return; // already finished: idempotent
    if (!s.learning.startedAt) throw new StudyEngineError("learning_not_started", "Open the learning task first.");
    const clock = await recordLearningEnded(c, sessionId);
    s.learning.endedAt = clock.endedAt ? new Date(clock.endedAt) : null;
    await syncPosition(c, s);
    await touch(c, sessionId);
  });
}

// ---------------------------------------------------------------------------------------------
// Interruption and resume
// ---------------------------------------------------------------------------------------------

export type ResumeResult = { kind: "resumed"; gapSeconds: number; interruptionCount: number } | { kind: "refused"; reason: "resume_not_allowed" | "too_many_interruptions" | "gap_too_long" };

/** Pure: does the protocol allow resuming after this interruption? */
export function resumeDecision(
  rules: { allowed: boolean; maxInterruptions?: number; maxGapMinutes?: number },
  input: { interruptionCount: number; gapSeconds: number },
): { ok: true } | { ok: false; reason: "resume_not_allowed" | "too_many_interruptions" | "gap_too_long" } {
  if (!rules.allowed) return { ok: false, reason: "resume_not_allowed" };
  if (rules.maxInterruptions !== undefined && input.interruptionCount + 1 > rules.maxInterruptions) return { ok: false, reason: "too_many_interruptions" };
  if (rules.maxGapMinutes !== undefined && input.gapSeconds > rules.maxGapMinutes * 60) return { ok: false, reason: "gap_too_long" };
  return { ok: true };
}

/**
 * The participant came back through the entry page with a live session. Records the interruption
 * and applies `config.resume`; a refused resume ends the session as `abandoned` (data kept).
 */
export async function resumeSession(pool: Pool | PoolClient, sessionId: string): Promise<ResumeResult> {
  return withTx(pool, async (c) => {
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const last = s.lastActivityAt ?? s.startedAt ?? s.now;
    const gapSeconds = Math.max(0, Math.round((s.now.getTime() - last.getTime()) / 1000));
    const decision = resumeDecision(s.study.protocol.config.resume, { interruptionCount: s.interruptionCount, gapSeconds });
    const actor: Actor = { kind: "participant", code: s.participantCode };
    if (!decision.ok) {
      await c.query("UPDATE study_sessions SET interrupted = true, interruption_count = interruption_count + 1, status = 'abandoned' WHERE id = $1", [sessionId]);
      await journal(c, actor, "study.session_resume_refused", "study_session", sessionId, { gapSeconds, interruptionCount: s.interruptionCount + 1, reason: decision.reason });
      return { kind: "refused", reason: decision.reason };
    }
    await c.query("UPDATE study_sessions SET interrupted = true, interruption_count = interruption_count + 1, last_activity_at = now() WHERE id = $1", [sessionId]);
    await journal(c, actor, "study.session_resumed", "study_session", sessionId, { gapSeconds, interruptionCount: s.interruptionCount + 1 });
    return { kind: "resumed", gapSeconds, interruptionCount: s.interruptionCount + 1 };
  });
}

// ---------------------------------------------------------------------------------------------
// Withdrawal and completion
// ---------------------------------------------------------------------------------------------

export const WITHDRAWAL_REASONS = ["not_stated", "no_longer_wish_to_take_part", "no_time", "technical_problem", "felt_unwell"] as const;
export type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number];

/**
 * Withdraws the participant at any point: a `withdrawn` consent record, the participant marked
 * withdrawn, and the open session (if any) flagged withdrawn. Nothing is deleted: the data
 * already collected is kept under the study's retention policy (config.retentionDays); removing
 * it is a separate, reasoned purge by the research team (app.research_purge_reason).
 */
export async function withdraw(pool: Pool | PoolClient, input: { participantId: string; sessionId?: string | null; reason: WithdrawalReason }): Promise<{ retentionDays: number | null }> {
  return withTx(pool, async (c) => {
    const p = await loadParticipant(c, input.participantId);
    if (!p) throw new StudyEngineError("participant_not_found", "Participant not found.");
    const study = await loadStudy(c, p.studyId);
    if (p.status !== "withdrawn") {
      const consent = await c.query<{ consent_version: string; consent_text_sha256: string }>(
        "SELECT consent_version, consent_text_sha256 FROM consent_records WHERE participant_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 1",
        [p.id],
      );
      const cur = study.protocol.config.consent;
      const version = consent.rows[0]?.consent_version ?? cur?.version ?? "none";
      const sha = consent.rows[0]?.consent_text_sha256 ?? (cur ? consentTextSha256(cur.text) : sha256(""));
      await c.query(
        "INSERT INTO consent_records (participant_id, consent_version, consent_text_sha256, decision, method) VALUES ($1, $2, $3, 'withdrawn', 'on_screen')",
        [p.id, version, sha],
      );
      await c.query("UPDATE participants SET status = 'withdrawn', withdrawn_at = now(), withdrawal_reason = $2 WHERE id = $1", [p.id, input.reason]);
    }
    const sessionId = input.sessionId ?? p.sessionId;
    const retentionDays = study.protocol.config.retentionDays ?? null;
    const after = { reason: input.reason, retentionDays, dataKept: true };
    if (sessionId) {
      await c.query("UPDATE study_sessions SET withdrawn = true, withdrawn_at = coalesce(withdrawn_at, now()) WHERE id = $1 AND participant_id = $2", [sessionId, p.id]);
      await journal(c, { kind: "participant", code: p.code }, "study.participant_withdrawn", "study_session", sessionId, after);
    } else {
      await journal(c, { kind: "participant", code: p.code }, "study.participant_withdrawn", "participant", p.id, after);
    }
    return { retentionDays };
  });
}

/** Ends the session as completed once every step is done. */
export async function completeSession(pool: Pool | PoolClient, sessionId: string): Promise<void> {
  await withTx(pool, async (c) => {
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    const s = await loadSessionState(c, sessionId);
    if (!s) throw new StudyEngineError("session_closed", "The session is not open.");
    if (s.status === "completed") return;
    if (!isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "finish") throw new StudyEngineError("not_current_step", "Some steps are not finished yet.");
    await c.query("UPDATE study_sessions SET status = 'completed', completed_at = now(), last_activity_at = now() WHERE id = $1", [sessionId]);
    await c.query("UPDATE participants SET status = 'completed' WHERE id = $1 AND status IN ('enrolled', 'active')", [s.participantId]);
    await journal(c, { kind: "participant", code: s.participantCode }, "study.session_completed", "study_session", sessionId, { steps: s.study.protocol.steps });
  });
}

export { isDeliverable };
