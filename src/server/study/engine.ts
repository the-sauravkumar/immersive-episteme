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
 * Order of a session: consent, the condition-blind steps, the device check (no condition is known,
 * so it can imply no door), allocation balanced by pre-test score with the tradition order drawn at
 * the same moment, then the remaining steps from the entrance to the delayed test.
 */
import { createHash, randomInt } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { KEY_MATCH_METRIC } from "@/features/assessment/responses";
import { museumCanRender } from "@/features/study/gpu-acceptance";
import type { LearningCondition } from "@/lib/permissions/learning";
import type { ConditionInterface } from "@/lib/validation/enums";
import { conditionFromInterface } from "@/server/auth/study-session-port-types";
import { LearningFinishRefusedError, recordLearningEnded } from "@/server/learning/context-data";

import { coverageOf, admitStop, inAssignedOrder, requiredStops, type StageCoverage, type StageStop, type StageVisit, type StopAdmission } from "@/features/study/stage-coverage";

import { drawCondition, drawTraditionOrder, type AllocatableCondition, type DrawAlgorithm } from "./allocation";
import { isDeliverable, isKeyedItem, itemConfig, parseAnswer, scoreItem, toResponseRaw, type DeliveredItem, type ParsedAnswer } from "./answers";
import {
  BLIND_STEPS,
  instrumentsFor,
  STEP_ASSESSMENTS,
  isQuestionnaireStep,
  parseStudyProtocol,
  StudyConfigError,
  type StudyProtocol,
  type StudyStep,
} from "./config";
import { instrumentBlocker, instrumentConditions } from "./instruments";
import { loadStageTemplates } from "./stage-templates";

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
  | "learning_incomplete"
  | "stage_refused"
  | "delayed_test_not_open"
  | "delayed_test_closed"
  | "familiarisation_not_finished"
  | "session_closed"
  | "repeat_browser"
  | "study_full"
  | "enrolment_throttled";

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
export const TEST_SCORE_METRIC = { version: "1.0.0", pipeline: KEY_MATCH_METRIC.pipeline } as const;

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
  pool: Pool | PoolClient,
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
    const r = await pool.query<{ id: string }>(
      "SELECT id FROM participants WHERE study_id = $1 AND id = ANY($2::uuid[]) ORDER BY enrolled_at DESC LIMIT 1",
      [study.id, previous],
    );
    repeatOf = r.rows[0]?.id ?? null;
    if (repeatOf && study.protocol.config.enrolment.blockRepeatBrowser) {
      await journal(pool, { kind: "system" }, "study.repeat_enrolment_refused", "study", study.id, { previousParticipantId: repeatOf });
      throw new StudyEngineError("repeat_browser", "This browser has already been used to take part in this study.");
    }
  }
  // The participant row and its journal entries commit together (database-08); the cap on
  // participants is checked under a per-study lock so parallel enrolments cannot overshoot it.
  return withTx(pool, async (c) => {
    const cap = study.protocol.config.enrolment.maxParticipants;
    if (cap !== undefined) {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended('ie-enrolment:' || $1, 0))", [study.id]);
      const n = (await c.query<{ n: number }>("SELECT count(*)::int AS n FROM participants WHERE study_id = $1", [study.id])).rows[0]!.n;
      if (n >= cap) throw new StudyEngineError("study_full", "This study has all the participants it needs.");
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateParticipantCode();
      const r = await c.query<{ id: string }>(
        "INSERT INTO participants (study_id, code, stratum) VALUES ($1, $2, $3) ON CONFLICT (study_id, code) DO NOTHING RETURNING id",
        [study.id, code, stratum],
      );
      const id = r.rows[0]?.id;
      if (!id) continue;
      await journal(c, { kind: "participant", code }, "study.participant_enrolled", "participant", id, { studyId: study.id, stratum });
      if (repeatOf) {
        await journal(c, { kind: "system" }, "study.repeat_enrolment_detected", "participant", id, { studyId: study.id, previousParticipantId: repeatOf });
      }
      return { participantId: id, code, repeatOf };
    }
    throw new Error("could not generate a unique participant code");
  });
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
 * enrolment: a second decision is refused (a later withdrawal goes through `withdraw`). The check
 * and the insert run in one transaction on the locked participant row, so a double submit from
 * two tabs cannot record both "granted" and "declined"; the database refuses a second initial
 * decision as well (migration 0018, final review database-08).
 */
export async function recordConsent(
  pool: Pool | PoolClient,
  input: { participantId: string; study: EnrollableStudy; decision: "granted" | "declined"; shownVersion: string },
): Promise<void> {
  const consent = input.study.protocol.config.consent;
  if (!consent) throw new StudyEngineError("study_misconfigured", "The study has no consent text configured.");
  if (input.shownVersion !== consent.version) throw new StudyEngineError("study_misconfigured", "The consent text changed; please read it again.");
  try {
    await withTx(pool, async (c) => {
      await c.query("SELECT 1 FROM participants WHERE id = $1 FOR UPDATE", [input.participantId]);
      const p = await loadParticipant(c, input.participantId);
      if (!p || p.studyId !== input.study.id) throw new StudyEngineError("participant_not_found", "Participant not found.");
      if (p.latestConsent) throw new StudyEngineError("consent_already_recorded", "A consent decision is already recorded.");
      await c.query(
        "INSERT INTO consent_records (participant_id, consent_version, consent_text_sha256, decision, method) VALUES ($1, $2, $3, $4, 'on_screen')",
        [p.id, consent.version, consentTextSha256(consent.text), input.decision],
      );
      await journal(c, { kind: "participant", code: p.code }, "study.consent_recorded", "participant", p.id, { decision: input.decision, consentVersion: consent.version });
    });
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: string }).code === "23505") {
      throw new StudyEngineError("consent_already_recorded", "A consent decision is already recorded.");
    }
    throw err;
  }
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

/**
 * Seed recorded on every allocation: the configured one, else a documented derivation. Studies
 * activated through the console always have a configured, secret seed (activateStudy generates
 * one, final review study-07); the derivation only serves studies activated outside it (demo
 * fixtures, legacy rows), and is predictable from the study id, so it gives no concealment.
 */
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
async function drawAndInsertAllocation(c: PoolClient, ctx: DrawContext): Promise<{ allocationId: string; conditionId: string; conditionCode: string; iface: ConditionInterface; traditionOrder: string[]; record: Record<string, unknown> }> {
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
  const orderIndex = await c.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM allocations WHERE study_id = $1 AND period = 1 AND condition_id = $2 AND stratum IS NOT DISTINCT FROM $3",
    [study.id, draw.conditionId, ctx.stratum],
  );
  const traditionOrder = drawTraditionOrder({ seed, traditions: study.protocol.config.traditionSlugs, conditionCode: draw.conditionCode, stratum: ctx.stratum, index: orderIndex.rows[0]!.n });
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
    traditionOrder,
    record: {
      allocationId: a.rows[0]!.id,
      algorithm,
      // The journal is readable by more roles than the allocations table: only a fingerprint.
      seedSha256Prefix: sha256(seed).slice(0, 12),
      seedSource: study.protocol.config.allocation.seed ? "configured" : "derived",
      sequenceIndex,
      stratum: ctx.stratum,
      stratumIndex: algorithm === "stratified_block" ? index : null,
      stratumSource: ctx.stratumSource,
      blockIndex: draw.blockIndex,
      positionInBlock: draw.positionInBlock,
      blockSize: draw.blockIndex === null ? null : (alloc.blockSize ?? null),
      conditionCode: draw.conditionCode,
      traditionOrder,
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
      `INSERT INTO study_sessions (study_id, participant_id, condition_id, allocation_id, period, app_build, status, started_at, last_activity_at, tradition_order)
       VALUES ($1, $2, $3, $4, 1, $5, 'in_progress', now(), now(), $6::jsonb) RETURNING id`,
      [study.id, p.id, d.conditionId, d.allocationId, input.appBuild, JSON.stringify(d.traditionOrder)],
    );
    await c.query("UPDATE participants SET status = 'active' WHERE id = $1 AND status = 'enrolled'", [p.id]);
    const sessionId = s.rows[0]!.id;
    await journal(c, { kind: "system" }, "study.allocated", "study_session", sessionId, d.record);
    return { sessionId, participantId: p.id, condition: conditionFromInterface(d.iface), conditionId: d.conditionId, created: true };
  });
}

/**
 * Sum of the keyed pre-test items of this session (item.key_match). The keyed items are the ones
 * the study DELIVERED with an answer key, so a skipped keyed item counts 0, exactly as it already
 * does when only some are skipped (final review study-04: a participant who left every keyed item
 * blank used to get no score and could never be allocated, which loses exactly the low-prior-
 * knowledge participants the stratum is about). Null only when the pre-test has no keyed item at
 * all: that is a configuration fault, refused at allocation.
 */
async function preTestScore(
  q: Q,
  s: SessionState,
): Promise<{ score: number; keyedItems: number; answeredKeyedItems: number; skippedKeyedItems: number; assessments: string[] } | null> {
  const pre = await listStepAssessments(q, s, "pre_test");
  const keyed = pre.flatMap((a) => a.items.filter(isKeyedItem));
  if (keyed.length === 0) return null;
  const r = await q.query<{ total: number | null; n: number }>(
    `SELECT sum(ds.value)::float8 AS total, count(*)::int AS n FROM derived_scores ds JOIN responses r ON r.id = ds.response_id
      WHERE ds.session_id = $1 AND ds.assessment_id = ANY($2::uuid[]) AND r.item_id = ANY($5::uuid[])
        AND ds.metric_name = $3 AND ds.metric_version = $4 AND ds.value IS NOT NULL`,
    [s.sessionId, pre.map((a) => a.id), KEY_MATCH_METRIC.name, KEY_MATCH_METRIC.version, keyed.map((i) => i.id)],
  );
  const row = r.rows[0]!;
  return {
    score: row.total ?? 0,
    keyedItems: keyed.length,
    answeredKeyedItems: row.n,
    skippedKeyedItems: keyed.length - row.n,
    assessments: pre.map((a) => `${a.code}.v${a.version}`),
  };
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
      const r = await preTestScore(c, s);
      if (!r) return { refused: { source: by.source, reason: "the pre-test score cannot be computed (the pre-test has no keyed items)" }, s };
      const { score } = r;
      const evidence = { keyedItems: r.keyedItems, answeredKeyedItems: r.answeredKeyedItems, skippedKeyedItems: r.skippedKeyedItems, assessments: r.assessments, metric: KEY_MATCH_METRIC.name };
      stratum = score <= by.cutoff ? "low" : "high";
      stratumSource = { source: by.source, score, cutoff: by.cutoff, rule: "low = score ≤ cutoff, else high", ...evidence };
    }
    const d = await drawAndInsertAllocation(c, { study: s.study, participantId: s.participantId, stratum, stratumSource });
    await c.query("UPDATE study_sessions SET condition_id = $2, allocation_id = $3, tradition_order = $4::jsonb, last_activity_at = now() WHERE id = $1", [sessionId, d.conditionId, d.allocationId, JSON.stringify(d.traditionOrder)]);
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
  traditionOrder: string[];
  assessmentVersions: Record<string, number>;
  journal: JournalEntry[];
  now: Date;
}

export async function loadSessionState(q: Q, sessionId: string): Promise<SessionState | null> {
  const r = await q.query<{
    id: string; participant_id: string; code: string; p_status: string; study_id: string; condition_id: string | null; c_code: string | null; interface: ConditionInterface | null;
    c_config: Record<string, unknown> | null; period: number; status: string; withdrawn: boolean; excluded: boolean; started_at: Date | null; last_activity_at: Date | null;
    interruption_count: number; device: Record<string, unknown>; version_label: string | null; learning_started_at: Date | null; learning_ends_at: Date | null;
    learning_ended_at: Date | null; tradition_order: string[] | null; assessment_versions: Record<string, number>; now: Date;
  }>(
    `SELECT ss.id, ss.participant_id, p.code, p.status AS p_status, ss.study_id, ss.condition_id, sc.code AS c_code, sc.interface, sc.config AS c_config,
            ss.period, ss.status, ss.withdrawn, ss.excluded, ss.started_at, ss.last_activity_at, ss.interruption_count, ss.device,
            cs.version_label, ss.learning_started_at, ss.learning_ends_at, ss.learning_ended_at, ss.tradition_order, ss.assessment_versions, now() AS now
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
    traditionOrder: row.tradition_order ?? [],
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

/**
 * The LATEST device check passed. (A check is not repeated after it passes; only a WebGL failure
 * reported by the museum afterwards, under the retry policy, records a later failed check that
 * sends the participant back to the device check.)
 */
export function deviceCheckPassed(s: Pick<SessionState, "journal">): boolean {
  const checks = s.journal.filter((e) => e.action === "study.device_checked");
  return checks.length > 0 && checks[checks.length - 1]!.after.outcome === "passed";
}

export type Position =
  | { kind: "step"; step: StudyStep; index: number }
  | { kind: "allocation" }
  | { kind: "device_check" }
  | { kind: "finish" };

/** Where the participant is. Pure. Order: blind steps, device check, allocation, the remaining steps, finish. */
export function positionOf(input: {
  steps: readonly StudyStep[];
  blind: readonly StudyStep[];
  done: ReadonlySet<StudyStep>;
  allocated: boolean;
  devicePassed: boolean;
}): Position {
  const { steps, blind, done } = input;
  for (const step of blind) if (!done.has(step)) return { kind: "step", step, index: steps.indexOf(step) };
  if (!input.devicePassed) return { kind: "device_check" };
  if (!input.allocated) return { kind: "allocation" };
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

/** Which study_assessments rows each non-questionnaire assessment step delivers (./config.ts). */
export { STEP_ASSESSMENTS };

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

export function learningMayEnd(s: Pick<SessionState, "learning" | "now" | "study">, everyStageVisited = true): boolean {
  if (!s.learning.startedAt) return false;
  if (s.learning.endsAt && s.now >= s.learning.endsAt) return true;
  const { allowEarlyFinish, requireEveryStage } = s.study.protocol.config.exposure;
  if (requireEveryStage && !everyStageVisited) return false;
  return s.learning.endsAt ? allowEarlyFinish : true;
}

export async function assignedStops(s: Pick<SessionState, "traditionOrder">): Promise<StageStop[]> {
  return requiredStops(inAssignedOrder(await loadStageTemplates(), s.traditionOrder));
}

async function stageVisitsOf(q: Q, sessionId: string): Promise<StageVisit[]> {
  const r = await q.query<{ tradition_key: string; stage_key: string }>("SELECT tradition_key, stage_key FROM stage_visits WHERE session_id = $1 ORDER BY visit_index", [sessionId]);
  return r.rows.map((row) => ({ traditionKey: row.tradition_key, stageKey: row.stage_key }));
}

export async function stageCoverage(q: Q, s: SessionState): Promise<StageCoverage | null> {
  if (!s.study.protocol.config.exposure.requireEveryStage) return null;
  return coverageOf(await assignedStops(s), await stageVisitsOf(q, s.sessionId));
}

async function openLearningSession(c: PoolClient, sessionId: string): Promise<SessionState> {
  await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
  const s = await loadSessionState(c, sessionId);
  if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
  const pos = await syncPosition(c, s);
  if (pos.kind !== "step" || pos.step !== "learning") throw new StudyEngineError("not_current_step", "Learning is not the current step.");
  if (!s.learning.startedAt) throw new StudyEngineError("learning_not_started", "Open the learning task first.");
  return s;
}

export interface StageEntryResult {
  visitIndex: number;
  visitCount: number;
  backStep: boolean;
  coverage: StageCoverage;
  endsAt: Date | null;
}

export async function recordStageEntered(pool: Pool | PoolClient, sessionId: string, target: StageVisit): Promise<StageEntryResult> {
  const result = await withTx(pool, async (c): Promise<StageEntryResult | { refused: Extract<StopAdmission, { admitted: false }> }> => {
    const s = await openLearningSession(c, sessionId);
    const required = await assignedStops(s);
    const visits = await stageVisitsOf(c, sessionId);
    const admission = admitStop(required, visits, target);
    if (!admission.admitted) {
      await journal(c, { kind: "participant", code: s.participantCode }, "study.stage_refused", "study_session", sessionId, { ...target, reason: admission.reason, expected: admission.expected });
      return { refused: admission };
    }
    const last = visits[visits.length - 1];
    const lastStop = last ? required.find((stop) => stop.traditionKey === last.traditionKey && stop.stageKey === last.stageKey) : undefined;
    const backStep = !!lastStop && lastStop.traditionKey === target.traditionKey && admission.stop.stageNumber < lastStop.stageNumber;
    await c.query("UPDATE stage_visits SET left_at = now() WHERE session_id = $1 AND left_at IS NULL", [sessionId]);
    await c.query(
      "INSERT INTO stage_visits (session_id, tradition_key, stage_key, stage_number, visit_index) VALUES ($1, $2, $3, $4, $5)",
      [sessionId, target.traditionKey, target.stageKey, admission.stop.stageNumber, visits.length],
    );
    await touch(c, sessionId);
    const after = [...visits, target];
    const visitCount = after.filter((v) => v.traditionKey === target.traditionKey && v.stageKey === target.stageKey).length;
    return { visitIndex: visits.length, visitCount, backStep, coverage: coverageOf(required, after), endsAt: s.learning.endsAt };
  });
  if ("refused" in result) throw new StudyEngineError("stage_refused", "This stage cannot be entered yet.", { reason: result.refused.reason, expected: result.refused.expected });
  return result;
}

export async function recordStageLeft(pool: Pool | PoolClient, sessionId: string, target: StageVisit & { activeMs: number }): Promise<void> {
  await pool.query(
    `UPDATE stage_visits SET left_at = coalesce(left_at, now()), active_ms = $4
      WHERE id = (SELECT id FROM stage_visits WHERE session_id = $1 AND tradition_key = $2 AND stage_key = $3 ORDER BY visit_index DESC LIMIT 1)`,
    [sessionId, target.traditionKey, target.stageKey, target.activeMs],
  );
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
      const coverage = s.learning.startedAt && (budgetOver || opts.arrivedAtHub || s.learning.endedAt) ? await stageCoverage(q, s) : null;
      if (!s.learning.endedAt && s.learning.startedAt && (budgetOver || (opts.arrivedAtHub && learningMayEnd(s, coverage?.complete ?? true)))) {
        const clock = await recordLearningEnded(q, s.sessionId);
        s.learning.endedAt = clock.endedAt ? new Date(clock.endedAt) : null;
      }
      if (!s.learning.endedAt) return pos;
      await markStepCompleted(q, s, "learning", {
        endedAt: s.learning.endedAt.toISOString(),
        reason: s.learning.endsAt && s.learning.endedAt >= s.learning.endsAt ? "cap_reached" : "finished",
        ...(coverage ? { stagesRequired: coverage.required, stagesVisited: coverage.visited, unvisited: coverage.unvisited } : {}),
      });
      continue;
    }
    if (!isAssessmentStep(step)) return pos;
    const assessments = await listStepAssessments(q, s, step);
    if (assessments.length === 0) {
      await markStepCompleted(q, s, step, { empty: true });
      continue;
    }
    if (step === "delayed_test") {
      const schedule = await ensureDelayedSchedule(q, s);
      if (s.now > schedule.closesAt && !schedule.completedAt) {
        await q.query("UPDATE delayed_test_schedule SET missed_at = coalesce(missed_at, now()) WHERE session_id = $1", [s.sessionId]);
        await markStepCompleted(q, s, "delayed_test", { missed: true });
        continue;
      }
      return pos;
    }
    if (step === "reconstruction") {
      const phase = "post";
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

export interface DelayedSchedule {
  scheduledAt: Date;
  opensAt: Date;
  dueAt: Date;
  closesAt: Date;
  returnedAt: Date | null;
  completedAt: Date | null;
  missedAt: Date | null;
}

const DAY_MS = 86_400_000;

async function readDelayedSchedule(q: Q, sessionId: string): Promise<DelayedSchedule | null> {
  const r = await q.query<{ scheduled_at: Date; opens_at: Date; due_at: Date; closes_at: Date; returned_at: Date | null; completed_at: Date | null; missed_at: Date | null }>(
    "SELECT scheduled_at, opens_at, due_at, closes_at, returned_at, completed_at, missed_at FROM delayed_test_schedule WHERE session_id = $1",
    [sessionId],
  );
  const row = r.rows[0];
  return row ? { scheduledAt: row.scheduled_at, opensAt: row.opens_at, dueAt: row.due_at, closesAt: row.closes_at, returnedAt: row.returned_at, completedAt: row.completed_at, missedAt: row.missed_at } : null;
}

export async function ensureDelayedSchedule(q: Q, s: Pick<SessionState, "sessionId" | "participantId" | "participantCode" | "study" | "now">): Promise<DelayedSchedule> {
  const existing = await readDelayedSchedule(q, s.sessionId);
  if (existing) return existing;
  const window = s.study.protocol.config.delayedTest;
  const at = (days: number) => new Date(s.now.getTime() + days * DAY_MS);
  await q.query(
    `INSERT INTO delayed_test_schedule (session_id, study_id, participant_id, opens_at, due_at, closes_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (session_id) DO NOTHING`,
    [s.sessionId, s.study.id, s.participantId, at(window.opensAfterDays), at(window.dueAfterDays), at(window.closesAfterDays)],
  );
  await journal(q, { kind: "system" }, "study.delayed_test_scheduled", "study_session", s.sessionId, { dueAt: at(window.dueAfterDays).toISOString() });
  return (await readDelayedSchedule(q, s.sessionId))!;
}

export type DelayedAvailability = "early" | "open" | "closed";

export function delayedAvailability(schedule: Pick<DelayedSchedule, "opensAt" | "closesAt">, now: Date): DelayedAvailability {
  if (now < schedule.opensAt) return "early";
  return now > schedule.closesAt ? "closed" : "open";
}

export async function delayedTestStatus(q: Q, s: SessionState): Promise<{ schedule: DelayedSchedule; availability: DelayedAvailability }> {
  const schedule = await ensureDelayedSchedule(q, s);
  return { schedule, availability: delayedAvailability(schedule, s.now) };
}

export interface DelayedReturn {
  participantId: string;
  sessionId: string;
  condition: LearningCondition | null;
  availability: DelayedAvailability;
}

export async function returnForDelayedTest(pool: Pool | PoolClient, input: { studyCode: string; participantCode: string }): Promise<DelayedReturn> {
  return withTx(pool, async (c) => {
    const r = await c.query<{ session_id: string }>(
      `SELECT d.session_id FROM delayed_test_schedule d
         JOIN studies st ON st.id = d.study_id JOIN participants p ON p.id = d.participant_id
        WHERE st.slug = $1 AND upper(p.code) = upper($2)`,
      [normaliseStudyCode(input.studyCode), input.participantCode.trim()],
    );
    const sessionId = r.rows[0]?.session_id;
    if (!sessionId) throw new StudyEngineError("participant_not_found", "No delayed test is scheduled for this code.");
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    const s = (await loadSessionState(c, sessionId))!;
    if (!isSessionOpen(s)) throw new StudyEngineError("session_closed", "This session is closed.");
    const { schedule, availability } = await delayedTestStatus(c, s);
    if (availability === "open" && !schedule.returnedAt) await c.query("UPDATE delayed_test_schedule SET returned_at = now() WHERE session_id = $1", [sessionId]);
    await journal(c, { kind: "participant", code: s.participantCode }, "study.delayed_test_returned", "study_session", sessionId, { availability });
    await touch(c, sessionId);
    return { participantId: s.participantId, sessionId, condition: s.condition, availability };
  });
}

export async function completeEntrance(pool: Pool | PoolClient, sessionId: string): Promise<void> {
  await withTx(pool, async (c) => {
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== "entrance") return;
    await markStepCompleted(c, s, "entrance", { door: s.condition });
    await touch(c, sessionId);
  });
}

export async function currentReconstructionPhase(q: Q, sessionId: string): Promise<"pre" | "post" | null> {
  const s = await loadSessionState(q, sessionId);
  if (!s || !isSessionOpen(s)) return null;
  const pos = await syncPosition(q, s);
  if (pos.kind !== "step") return null;
  return pos.step === "reconstruction" ? "post" : null;
}

/**
 * Server gate of the learning pages (/learn/<condition>): is the learning step the participant's
 * current step? The learning context checks it before it renders any content or starts the
 * learning clock, so content is never served before the practice and introduction, before the
 * pre-test (allocation at enrolment), or after learning ended (final review study-02,
 * security-06). A budget that ran out is ended here, by syncPosition, as on the hub.
 */
export async function learningStepIsCurrent(pool: Pool | PoolClient, sessionId: string): Promise<boolean> {
  return withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) return false;
    const pos = await syncPosition(c, s);
    return pos.kind === "step" && pos.step === "learning";
  });
}

// ---------------------------------------------------------------------------------------------
// Device check and the WebGL-failure policy
// ---------------------------------------------------------------------------------------------

export interface DeviceReport {
  viewport: { width: number; height: number };
  devicePixelRatio?: number;
  webglVersion: 1 | 2 | null;
  /** WebGL runs on a software rasteriser (a boolean only: no renderer string is stored). */
  softwareRenderer?: boolean;
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

export function evaluateDevice(
  report: DeviceReport,
  ctx: { policy: "exclude" | "retry" | "reassign"; minViewport?: { width: number; height: number } },
): "passed" | "viewport_too_small" | "webgl_retry" | "webgl_exclude" {
  const min = ctx.minViewport;
  if (min && (report.viewport.width < min.width || report.viewport.height < min.height)) return "viewport_too_small";
  if (!museumCanRender(report)) return ctx.policy === "exclude" ? "webgl_exclude" : "webgl_retry";
  return "passed";
}

export async function recordDeviceCheck(pool: Pool | PoolClient, sessionId: string, report: DeviceReport): Promise<DeviceOutcome> {
  return withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    if (deviceCheckPassed(s)) return { kind: "passed" };
    const minViewport = s.study.protocol.config.device.minViewport;
    const policy = s.study.protocol.config.webglFailurePolicy;
    const verdict = evaluateDevice(report, { policy, minViewport });
    const attempt = s.journal.filter((e) => e.action === "study.device_checked").length + 1;
    const device = {
      viewport: report.viewport,
      devicePixelRatio: report.devicePixelRatio,
      inputDevices: report.inputDevices,
      webglVersion: report.webglVersion,
      softwareRenderer: report.softwareRenderer,
      reducedMotion: report.reducedMotion,
      highContrast: report.highContrast,
      contrastAccommodation: report.contrastAccommodation,
      browserFamily: report.browserFamily,
      check: { attempt, verdict, checkedAt: s.now.toISOString(), minViewport: minViewport ?? null, webglFailurePolicy: policy },
    };
    await c.query("UPDATE study_sessions SET device = $2::jsonb, last_activity_at = now() WHERE id = $1", [sessionId, JSON.stringify(device)]);
    const actor: Actor = { kind: "participant", code: s.participantCode };
    const outcome = verdict === "passed" ? "passed" : verdict === "webgl_exclude" ? "excluded" : "retry";
    await journal(c, actor, "study.device_checked", "study_session", sessionId, { outcome, verdict, attempt, webglVersion: report.webglVersion, softwareRenderer: report.softwareRenderer ?? null, viewport: report.viewport });

    switch (verdict) {
      case "passed":
        return { kind: "passed" };
      case "viewport_too_small":
        return { kind: "retry", reason: "viewport_too_small", minViewport };
      case "webgl_retry":
        return { kind: "retry", reason: "webgl_unavailable" };
      case "webgl_exclude":
        return excludeForWebgl(c, s, policy);
    }
  });
}

async function excludeForWebgl(c: PoolClient, s: SessionState, policy: string): Promise<DeviceOutcome> {
  const reason = "webgl_unavailable: excluded by webglFailurePolicy=exclude";
  await c.query("UPDATE study_sessions SET excluded = true, exclusion_reason = $2, excluded_at = now(), status = 'abandoned' WHERE id = $1", [s.sessionId, reason]);
  await c.query("UPDATE participants SET status = 'excluded', exclusion_reason = $2 WHERE id = $1", [s.participantId, reason]);
  await journal(c, { kind: "system" }, "study.participant_excluded", "study_session", s.sessionId, { rule: "webglFailurePolicy", policy }, reason);
  return { kind: "excluded" };
}

export type MuseumFailureOutcome = DeviceOutcome | { kind: "ignored" };

/**
 * Backstop for a GPU that fails AFTER the device check passed (driver crash, blocklisting, another
 * browser): the museum's fallback screen reports it here in study mode (final review study-01).
 * Recorded as `study.webgl_failed` and handled by the same policy as the device check:
 *  - exclude: the session is excluded, as at the check;
 *  - reassign: a 2D session is opened; only the condition-blind steps are carried over, so the
 *    participant takes the 2D practice and introduction before learning in 2D;
 *  - retry: a failed device check is recorded, so the participant is sent back to the check (the
 *    journal entry flags the session's learning time, which may already be running).
 * Ignored outside the immersive practice and learning steps, and for a 2D session.
 */
export async function recordMuseumWebglFailure(
  pool: Pool | PoolClient,
  sessionId: string,
  gpu: { webglVersion: 1 | 2 | null; softwareRenderer: boolean },
  opts: { appBuild: string },
): Promise<MuseumFailureOutcome> {
  return withTx(pool, async (c) => {
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [sessionId]);
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    if (s.condition !== "immersive") return { kind: "ignored" };
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || (pos.step !== "familiarisation" && pos.step !== "learning")) return { kind: "ignored" };
    const policy = s.study.protocol.config.webglFailurePolicy;
    const learningStarted = !!s.learning.startedAt;
    await journal(c, { kind: "participant", code: s.participantCode }, "study.webgl_failed", "study_session", sessionId, {
      step: pos.step,
      webglVersion: gpu.webglVersion,
      softwareRenderer: gpu.softwareRenderer,
      policy,
      learningStarted,
    });
    if (policy === "exclude") return excludeForWebgl(c, s, policy);
    if (policy === "reassign") return reassignToConventional(c, s, { ...s.device, runtimeWebglFailure: { step: pos.step, ...gpu } }, opts.appBuild);
    const attempt = s.journal.filter((e) => e.action === "study.device_checked").length + 1;
    await journal(c, { kind: "participant", code: s.participantCode }, "study.device_checked", "study_session", sessionId, {
      outcome: "retry",
      verdict: "webgl_runtime_failure",
      attempt,
      webglVersion: gpu.webglVersion,
      softwareRenderer: gpu.softwareRenderer,
    });
    await touch(c, sessionId);
    return { kind: "retry", reason: "webgl_unavailable" };
  });
}

/**
 * Reassignment under `webglFailurePolicy = reassign`: allocations and session identities are
 * immutable, so the immersive session is closed (abandoned) and a NEW allocation (period 2,
 * algorithm `manual`, recorded reason) and session for the 2D condition are created. The blind
 * steps already done (their data stay on the first session) are carried over in the journal.
 */
async function reassignToConventional(
  c: PoolClient,
  s: SessionState,
  device: Record<string, unknown>,
  appBuild: string,
): Promise<DeviceOutcome> {
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
    `INSERT INTO study_sessions (study_id, participant_id, condition_id, allocation_id, period, app_build, status, started_at, last_activity_at, device, tradition_order)
     VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', now(), now(), $7::jsonb, $8::jsonb) RETURNING id`,
    [s.study.id, s.participantId, target.rows[0].id, a.rows[0]!.id, s.period + 1, appBuild, JSON.stringify(device), JSON.stringify(s.traditionOrder)],
  );
  const newId = n.rows[0]!.id;
  await journal(c, { kind: "system" }, "study.session_reassigned", "study_session", s.sessionId, { toSessionId: newId, toCondition: target.rows[0].code }, reason);
  await journal(c, { kind: "system" }, "study.allocated", "study_session", newId, {
    allocationId: a.rows[0]!.id, algorithm: "manual", overrideReason: reason, fromSessionId: s.sessionId, conditionCode: target.rows[0].code, studyProtocolVersion: s.study.protocolVersion,
  });
  for (const step of completedSteps(s)) {
    if (!BLIND_STEPS.includes(step)) continue;
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

/**
 * The presentation stamp of the participant's CURRENT step (the assessment form calls it once it
 * is on screen). Refused (`not_current_step`) for any other step and on a closed session, under
 * the same session lock as a submission: `startAssessment` keeps the first stamp, so a stamp
 * forged for a later step would otherwise become its presented_at (final review study-09).
 */
export async function markAssessmentPresented(pool: Pool | PoolClient, input: { sessionId: string; step: StudyStep; assessmentId: string }): Promise<{ presentedAt: Date }> {
  return withTx(pool, async (c) => {
    await c.query("SELECT 1 FROM study_sessions WHERE id = $1 FOR UPDATE", [input.sessionId]);
    const s = await loadSessionState(c, input.sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== input.step) throw new StudyEngineError("not_current_step", "This part of the study is not the current step.");
    const a = (await listStepAssessments(c, s, input.step)).find((x) => x.id === input.assessmentId);
    if (!a) throw new StudyEngineError("not_current_step", "This assessment is not part of the current step.");
    return startAssessment(c, s, a, input.step);
  });
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
    if (input.step === "delayed_test") {
      const { availability } = await delayedTestStatus(c, s);
      if (availability === "early") throw new StudyEngineError("delayed_test_not_open", "The delayed test is not open yet.");
    }
    const assessments = await listStepAssessments(c, s, input.step);
    const a = assessments.find((x) => x.id === input.assessmentId);
    if (!a) throw new StudyEngineError("not_current_step", "This assessment is not part of the current step.");
    if (submittedAssessments(s, input.step).has(a.id)) throw new StudyEngineError("already_submitted", "These answers were already submitted.");
    // A repeated administration (another step) is a new attempt; raw rows are never overwritten.
    // Numbered per PARTICIPANT, not per session: after a reassignment (webglFailurePolicy =
    // reassign) the second session's post-learning SSQ is attempt 2, not a second "attempt 1"
    // (final review study-03). The journal entry also records the step.
    const attempt = (
      await c.query<{ next: number }>("SELECT coalesce(max(attempt), 0)::int + 1 AS next FROM responses WHERE participant_id = $1 AND assessment_id = $2", [s.participantId, a.id])
    ).rows[0]!.next;
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
    const keyedItems = a.items.filter(isKeyedItem).length;
    const testType = typeof a.config.testType === "string" ? a.config.testType : null;
    if (testType && keyedItems > 0) {
      await c.query(
        `INSERT INTO derived_scores (session_id, participant_id, assessment_id, metric_name, metric_version, value, details, pipeline_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) ON CONFLICT ON CONSTRAINT derived_scores_uq DO NOTHING`,
        [s.sessionId, s.participantId, a.id, `test.${testType}`, TEST_SCORE_METRIC.version, correct / keyedItems, JSON.stringify({ keyedItems, answered, skipped, assessmentVersion: a.version, step: input.step }), TEST_SCORE_METRIC.pipeline],
      );
    }
    await journal(c, { kind: "participant", code: s.participantCode }, "study.assessment_submitted", "study_session", s.sessionId, {
      assessmentId: a.id, code: a.code, version: a.version, step: input.step, attempt, answered, skipped,
    });
    s.journal.push({ action: "study.assessment_submitted", after: { assessmentId: a.id, step: input.step }, occurredAt: new Date() });
    await touch(c, s.sessionId);
    const allDone = assessments.every((x) => submittedAssessments(s, input.step).has(x.id));
    if (allDone) await markStepCompleted(c, s, input.step);
    if (allDone && input.step === "delayed_test") await c.query("UPDATE delayed_test_schedule SET completed_at = now() WHERE session_id = $1", [s.sessionId]);
    return { answered, skipped, scored, correct, stepCompleted: allDone };
  });
}

// ---------------------------------------------------------------------------------------------
// Familiarisation, onboarding and learning
// ---------------------------------------------------------------------------------------------

export async function startFamiliarisation(pool: Pool | PoolClient, sessionId: string): Promise<{ startedAt: Date }> {
  return withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== "familiarisation") throw new StudyEngineError("not_current_step", "Familiarisation is not the current step.");
    const prior = s.journal.find((e) => e.action === "study.familiarisation_started");
    if (prior) return { startedAt: prior.occurredAt };
    await journal(c, { kind: "participant", code: s.participantCode }, "study.familiarisation_started", "study_session", sessionId, {});
    await touch(c, sessionId);
    return { startedAt: s.now };
  });
}

export async function completeFamiliarisation(pool: Pool | PoolClient, sessionId: string): Promise<void> {
  await withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== "familiarisation") return;
    const started = s.journal.find((e) => e.action === "study.familiarisation_started");
    if (!started) throw new StudyEngineError("familiarisation_not_finished", "Open the practice first.");
    await markStepCompleted(c, s, "familiarisation", { elapsedMs: s.now.getTime() - started.occurredAt.getTime() });
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

export async function finishLearning(pool: Pool | PoolClient, sessionId: string): Promise<void> {
  const refused = await withTx(pool, async (c) => {
    const s = await loadSessionState(c, sessionId);
    if (!s || !isSessionOpen(s)) throw new StudyEngineError("session_closed", "The session is not open.");
    const pos = await syncPosition(c, s);
    if (pos.kind !== "step" || pos.step !== "learning") return null;
    if (!s.learning.startedAt) throw new StudyEngineError("learning_not_started", "Open the learning task first.");
    const coverage = await stageCoverage(c, s);
    if (coverage && !coverage.complete && !learningMayEnd(s, false)) return coverage.unvisited;
    const clock = await recordLearningEnded(c, sessionId);
    s.learning.endedAt = clock.endedAt ? new Date(clock.endedAt) : null;
    await syncPosition(c, s);
    await touch(c, sessionId);
    return null;
  });
  if (refused) throw new StudyEngineError("learning_incomplete", "Every stage must be visited before learning can finish.", { unvisited: refused });
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
/**
 * `telemetryPending`: client-reported count of telemetry events not delivered when the
 * participant finished (null when unknown); kept in the `study.session_completed` journal entry.
 */
export async function completeSession(pool: Pool | PoolClient, sessionId: string, opts: { telemetryPending?: number | null } = {}): Promise<void> {
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
    await journal(c, { kind: "participant", code: s.participantCode }, "study.session_completed", "study_session", sessionId, {
      steps: s.study.protocol.steps,
      ...(opts.telemetryPending != null ? { telemetryPending: opts.telemetryPending } : {}),
    });
  });
}

export { isDeliverable };
