/**
 * Participants and sessions (research console): pseudonymous lists, session integrity,
 * annotations, protocol deviations and exclusion flags.
 *
 * Privacy: participants are identified only by their pseudonymous study code. No query here
 * returns consent records or access-token hashes; identifying linkage is the separate
 * `participants.identify` / `exports.identified` path (exports, principal investigator).
 */
import { z } from "zod";

import { protocolDeviationInputSchema, sessionAnnotationInputSchema } from "@/features/study/contracts";

import { audit, inTransaction, ResearchActionError, type Actor, type Q } from "./db";
import type { Pool, PoolClient } from "pg";

export interface ParticipantRow {
  id: string;
  code: string;
  status: string;
  stratum: string | null;
  enrolledAt: string;
  withdrawn: boolean;
  exclusionFlag: boolean;
  condition: string | null;
  sessions: number;
  completedSessions: number;
}

export async function listParticipants(q: Q, studyId: string): Promise<ParticipantRow[]> {
  const r = await q.query<ParticipantRow>(
    `SELECT p.id, p.code, p.status::text AS status, p.stratum, to_json(p.enrolled_at)#>>'{}' AS "enrolledAt",
            p.status = 'withdrawn' AS withdrawn, p.status = 'excluded' AS "exclusionFlag",
            (SELECT string_agg(DISTINCT sc.code, ', ') FROM allocations a JOIN study_conditions sc ON sc.id = a.condition_id WHERE a.participant_id = p.id) AS condition,
            (SELECT count(*)::int FROM study_sessions ss WHERE ss.participant_id = p.id) AS sessions,
            (SELECT count(*)::int FROM study_sessions ss WHERE ss.participant_id = p.id AND ss.status = 'completed') AS "completedSessions"
       FROM participants p WHERE p.study_id = $1 ORDER BY p.code`,
    [studyId],
  );
  return r.rows;
}

export interface SessionIntegrity {
  id: string;
  studyId: string;
  studySlug: string;
  participantCode: string;
  conditionCode: string;
  conditionInterface: string;
  period: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  learningBudgetSeconds: number | null;
  learningStartedAt: string | null;
  learningEndedAt: string | null;
  interrupted: boolean;
  interruptionCount: number;
  resumes: number;
  device: Record<string, unknown>;
  withdrawn: boolean;
  excluded: boolean;
  exclusionReason: string | null;
  nonExperimental: boolean;
  events: number;
  quarantined: number;
  duplicateEvents: number;
  openGaps: number;
  outOfOrder: number;
  deviations: number;
  majorDeviations: number;
  annotations: number;
  appBuild: string;
}

const SESSION_SELECT = `
  SELECT ss.id, ss.study_id AS "studyId", st.slug AS "studySlug", p.code AS "participantCode", sc.code AS "conditionCode",
         sc.interface::text AS "conditionInterface", ss.period, ss.status::text AS status,
         to_json(ss.started_at)#>>'{}' AS "startedAt", to_json(ss.completed_at)#>>'{}' AS "completedAt",
         to_json(ss.last_activity_at)#>>'{}' AS "lastActivityAt", ss.learning_budget_seconds AS "learningBudgetSeconds",
         to_json(ss.learning_started_at)#>>'{}' AS "learningStartedAt", to_json(ss.learning_ended_at)#>>'{}' AS "learningEndedAt",
         ss.interrupted, ss.interruption_count AS "interruptionCount",
         (SELECT count(*)::int FROM telemetry_events te WHERE te.session_id = ss.id AND te.event_type_code = 'session_resumed') AS resumes,
         ss.device, ss.withdrawn, ss.excluded, ss.exclusion_reason AS "exclusionReason",
         (st.is_demo OR coalesce((st.config->>'nonExperimental')::boolean, false)) AS "nonExperimental",
         (SELECT count(*)::int FROM telemetry_events te WHERE te.session_id = ss.id) AS events,
         (SELECT count(*)::int FROM telemetry_quarantine tq WHERE tq.session_id = ss.id) AS quarantined,
         (SELECT coalesce(sum(tb.duplicate_count), 0)::int FROM telemetry_batches tb WHERE tb.session_id = ss.id)
           + (SELECT count(*)::int FROM sequence_gaps g WHERE g.session_id = ss.id AND g.kind = 'duplicate') AS "duplicateEvents",
         (SELECT count(*)::int FROM sequence_gaps g WHERE g.session_id = ss.id AND g.kind = 'gap' AND g.resolved_at IS NULL) AS "openGaps",
         (SELECT count(*)::int FROM sequence_gaps g WHERE g.session_id = ss.id AND g.kind = 'out_of_order') AS "outOfOrder",
         (SELECT count(*)::int FROM protocol_deviations d WHERE d.session_id = ss.id) AS deviations,
         (SELECT count(*)::int FROM protocol_deviations d WHERE d.session_id = ss.id AND d.severity = 'major') AS "majorDeviations",
         (SELECT count(*)::int FROM session_annotations a WHERE a.session_id = ss.id) AS annotations,
         ss.app_build AS "appBuild"
    FROM study_sessions ss
    JOIN studies st ON st.id = ss.study_id
    JOIN participants p ON p.id = ss.participant_id
    JOIN study_conditions sc ON sc.id = ss.condition_id`;

export async function listSessions(q: Q, studyId: string): Promise<SessionIntegrity[]> {
  const r = await q.query<SessionIntegrity>(`${SESSION_SELECT} WHERE ss.study_id = $1 ORDER BY p.code, ss.period`, [studyId]);
  return r.rows;
}

export async function getSession(q: Q, sessionId: string): Promise<SessionIntegrity | null> {
  const r = await q.query<SessionIntegrity>(`${SESSION_SELECT} WHERE ss.id = $1`, [sessionId]);
  return r.rows[0] ?? null;
}

/** Data-quality flags for a session, worded for the console. */
export function integrityFlags(s: SessionIntegrity): { level: "error" | "warning" | "info"; text: string }[] {
  const out: { level: "error" | "warning" | "info"; text: string }[] = [];
  if (s.nonExperimental) out.push({ level: "info", text: "Non-experimental (demo or pilot study): exclude from analysis." });
  if (s.withdrawn) out.push({ level: "error", text: "Participant withdrew from this session." });
  if (s.excluded) out.push({ level: "error", text: `Excluded: ${s.exclusionReason ?? "no reason recorded"}` });
  if (s.openGaps > 0) out.push({ level: "warning", text: `${s.openGaps} unresolved telemetry sequence gap(s).` });
  if (s.quarantined > 0) out.push({ level: "warning", text: `${s.quarantined} quarantined event(s).` });
  if (s.duplicateEvents > 0) out.push({ level: "info", text: `${s.duplicateEvents} duplicate upload(s) detected and not double-counted.` });
  if (s.interrupted) out.push({ level: "warning", text: `Interrupted ${s.interruptionCount} time(s).` });
  if (s.majorDeviations > 0) out.push({ level: "error", text: `${s.majorDeviations} major protocol deviation(s).` });
  else if (s.deviations > 0) out.push({ level: "warning", text: `${s.deviations} minor protocol deviation(s).` });
  if (s.status === "completed" && s.events === 0) out.push({ level: "error", text: "Completed without any telemetry." });
  if (s.status === "abandoned") out.push({ level: "warning", text: "Session abandoned." });
  return out;
}

export interface AnnotationRow {
  id: string;
  kind: string;
  body: string;
  authorId: string;
  createdAt: string;
}

export async function listAnnotations(q: Q, sessionId: string): Promise<AnnotationRow[]> {
  const r = await q.query<AnnotationRow>(
    `SELECT id, kind, body, author_id AS "authorId", to_json(created_at)#>>'{}' AS "createdAt"
       FROM session_annotations WHERE session_id = $1 ORDER BY created_at DESC`,
    [sessionId],
  );
  return r.rows;
}

export async function listDeviations(q: Q, opts: { sessionId?: string; studyId?: string }) {
  const r = await q.query<{ id: string; category: string; severity: string; description: string; resolution: string | null; reportedAt: string; sessionId: string | null }>(
    `SELECT id, category, severity::text AS severity, description, resolution, to_json(reported_at)#>>'{}' AS "reportedAt", session_id AS "sessionId"
       FROM protocol_deviations WHERE ($1::uuid IS NULL OR session_id = $1) AND ($2::uuid IS NULL OR study_id = $2) ORDER BY reported_at DESC`,
    [opts.sessionId ?? null, opts.studyId ?? null],
  );
  return r.rows;
}

export async function addAnnotation(q: Q, actor: Actor, input: z.input<typeof sessionAnnotationInputSchema>): Promise<void> {
  const a = sessionAnnotationInputSchema.parse(input);
  await q.query("INSERT INTO session_annotations (session_id, author_id, kind, body) VALUES ($1, $2, $3, $4)", [a.sessionId, actor.userId, a.kind, a.body]);
}

export async function addDeviation(q: Q, actor: Actor, input: z.input<typeof protocolDeviationInputSchema>): Promise<void> {
  const d = protocolDeviationInputSchema.parse(input);
  if (d.sessionId) {
    const s = await q.query<{ study_id: string; participant_id: string }>("SELECT study_id, participant_id FROM study_sessions WHERE id = $1", [d.sessionId]);
    if (s.rows[0]?.study_id !== d.studyId) throw new ResearchActionError("The session does not belong to this study.");
    d.participantId ??= s.rows[0]!.participant_id;
  }
  await q.query(
    `INSERT INTO protocol_deviations (study_id, session_id, participant_id, category, severity, description, resolution, reported_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [d.studyId, d.sessionId ?? null, d.participantId ?? null, d.category, d.severity, d.description, d.resolution ?? null, actor.userId],
  );
}

/** Structured exclusion reasons; the free-text detail is appended. */
export const EXCLUSION_CATEGORIES = [
  "technical_failure",
  "protocol_deviation",
  "incomplete_data",
  "eligibility",
  "consent_withdrawn",
  "other",
] as const;

export const exclusionSchema = z.object({
  sessionId: z.uuid(),
  category: z.enum(EXCLUSION_CATEGORIES),
  detail: z.string().trim().min(3).max(2000),
});

/** Flags a session as excluded from analysis (raw data is kept; exports carry the flag). */
export async function excludeSession(pool: Pool | PoolClient, actor: Actor, input: z.input<typeof exclusionSchema>): Promise<void> {
  const e = exclusionSchema.parse(input);
  await inTransaction(pool, async (c) => {
    const r = await c.query<{ excluded: boolean }>("SELECT excluded FROM study_sessions WHERE id = $1 FOR UPDATE", [e.sessionId]);
    if (!r.rows[0]) throw new ResearchActionError("Session not found");
    if (r.rows[0].excluded) throw new ResearchActionError("The session is already excluded.");
    const reason = `${e.category}: ${e.detail}`;
    await c.query("UPDATE study_sessions SET excluded = true, exclusion_reason = $2, excluded_by = $3, excluded_at = now() WHERE id = $1", [e.sessionId, reason, actor.userId]);
    await audit(c, actor, "session.exclude", "study_session", e.sessionId, { after: { excluded: true, category: e.category }, reason });
  });
}
