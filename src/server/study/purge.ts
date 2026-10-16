/**
 * Participant data removal (final review database-04 / study-08; decision record DR-030).
 *
 * The participant information and the withdrawal page promise that a participant's data can be
 * removed on request and are kept no longer than the study's retention period
 * (`config.retentionDays`). Withdrawal never deletes (study-engine.md S16); removal is this
 * separate, reasoned purge, run by the research team (permission `participants.purge`, principal
 * investigator), either on request or for every participant whose retention period has passed.
 *
 * One transaction per participant, under both purge settings the database guards require
 * (app.research_purge_reason, app.telemetry_purge_reason), deleting in foreign-key order every
 * row that holds what the participant did: telemetry (events, batches, quarantine, gaps, rollups),
 * derived metrics and scores, concept maps (edges, revisions), responses, protocol deviations,
 * annotations, and the session rows themselves.
 *
 * Kept by design, and said so on the withdrawal page: the pseudonymous participant row (code,
 * status, dates), the consent records, the allocation and the journal (audit_log). They are
 * append-only, carry no answers and no name, and are the record that consent was obtained and
 * the randomisation was followed. The purge itself is journalled (`research.participant_data_purged`:
 * who, why, when, and how many rows of each table), never the data removed.
 *
 * Not `server-only`: the integration tests and scripts/db/purge-participant.ts run it.
 */
import type { Pool, PoolClient } from "pg";

type Q = Pick<Pool | PoolClient, "query">;

export class PurgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurgeError";
  }
}

export type PurgeTrigger = "request" | "retention";

export interface PurgeResult {
  participantId: string;
  participantCode: string;
  sessions: number;
  /** Rows deleted per table. */
  rows: Record<string, number>;
}

/** Deleted in this order (children first); each statement selects the participant's rows. */
const PURGE_STEPS: { table: string; where: string }[] = [
  { table: "telemetry_events", where: "session_id = ANY($1::uuid[])" },
  { table: "telemetry_quarantine", where: "session_id = ANY($1::uuid[])" },
  { table: "telemetry_batches", where: "session_id = ANY($1::uuid[])" },
  { table: "sequence_gaps", where: "session_id = ANY($1::uuid[])" },
  { table: "session_telemetry_rollups", where: "session_id = ANY($1::uuid[])" },
  { table: "derived_metrics", where: "session_id = ANY($1::uuid[])" },
  { table: "derived_scores", where: "session_id = ANY($1::uuid[]) OR participant_id = $2" },
  { table: "concept_map_revisions", where: "concept_map_id IN (SELECT id FROM concept_maps WHERE participant_id = $2)" },
  { table: "concept_map_edges", where: "concept_map_id IN (SELECT id FROM concept_maps WHERE participant_id = $2)" },
  { table: "concept_maps", where: "participant_id = $2" },
  { table: "responses", where: "participant_id = $2" },
  { table: "protocol_deviations", where: "session_id = ANY($1::uuid[]) OR participant_id = $2" },
  { table: "session_annotations", where: "session_id = ANY($1::uuid[])" },
  { table: "study_sessions", where: "id = ANY($1::uuid[])" },
];

async function withTx<T>(pool: Pool | PoolClient, fn: (c: PoolClient) => Promise<T>): Promise<T> {
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

/**
 * Removes one participant's data (see the module header). `participant` is the pseudonymous code
 * the participant gave the facilitator, or the participant id. Refused while the participant is
 * still taking part (they withdraw first, from the withdrawal page), and when nothing is left to
 * remove. `actorId` is the staff user (Better Auth users.id) who runs it; the caller checks the
 * permission.
 */
export async function purgeParticipantData(
  pool: Pool | PoolClient,
  input: { studyId: string; participant: string; reason: string; actorId: string; trigger: PurgeTrigger },
): Promise<PurgeResult> {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new PurgeError("Give the reason for the removal (at least 5 characters).");
  return withTx(pool, async (c) => {
    const p = await c.query<{ id: string; code: string; status: string }>(
      "SELECT id, code, status::text AS status FROM participants WHERE study_id = $1 AND (upper(code) = upper($2) OR id::text = lower($2)) FOR UPDATE",
      [input.studyId, input.participant.trim()],
    );
    const participant = p.rows[0];
    if (!participant) throw new PurgeError("No participant of this study has this code.");
    const sessions = await c.query<{ id: string; live: boolean }>(
      "SELECT id, (status = 'in_progress' AND NOT withdrawn AND NOT excluded) AS live FROM study_sessions WHERE participant_id = $1 FOR UPDATE",
      [participant.id],
    );
    if (sessions.rows.some((s) => s.live) && participant.status !== "withdrawn") {
      throw new PurgeError("The participant is still taking part. They withdraw first (the withdrawal page of their session); then their data can be removed.");
    }
    const sessionIds = sessions.rows.map((s) => s.id);
    // Both guards' reasons, local to this transaction (migrations 0003, 0005, 0018).
    await c.query("SELECT set_config('app.research_purge_reason', $1, true), set_config('app.telemetry_purge_reason', $1, true)", [`${input.trigger}: ${reason}`]);
    const rows: Record<string, number> = {};
    for (const step of PURGE_STEPS) {
      // Bind only the parameters the statement uses ($1 = session ids, $2 = participant id).
      const params = step.where.includes("$1") ? (step.where.includes("$2") ? [sessionIds, participant.id] : [sessionIds]) : [participant.id];
      const where = step.where.includes("$1") ? step.where : step.where.replaceAll("$2", "$1");
      const r = await c.query(`DELETE FROM ${step.table} WHERE ${where}`, params);
      rows[step.table] = r.rowCount ?? 0;
    }
    if (Object.values(rows).every((x) => x === 0)) throw new PurgeError("There is no data left to remove for this participant.");
    await c.query(
      `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, reason)
       VALUES ('user', $1, 'research.participant_data_purged', 'participant', $2, $3::jsonb, $4)`,
      [input.actorId, participant.id, JSON.stringify({ studyId: input.studyId, participantCode: participant.code, trigger: input.trigger, sessions: sessionIds.length, rows }), reason],
    );
    return { participantId: participant.id, participantCode: participant.code, sessions: sessionIds.length, rows };
  });
}

export interface RetentionDue {
  participantId: string;
  participantCode: string;
  /** When the participant's last session ended (completed, withdrawn, excluded or abandoned). */
  endedAt: string;
  /** endedAt + retentionDays. */
  dueAt: string;
}

/**
 * Participants whose retention period has passed: `config.retentionDays` after the end of their
 * participation (the latest end of their sessions: completion, withdrawal, exclusion, or the last
 * activity of an abandoned session) and who still have data. A participant with a session still
 * running is never due. Studies without `retentionDays` have nothing due.
 */
export async function listRetentionDue(q: Q, studyId: string, now: Date = new Date()): Promise<{ retentionDays: number | null; due: RetentionDue[] }> {
  const s = await q.query<{ days: string | null }>("SELECT config->>'retentionDays' AS days FROM studies WHERE id = $1", [studyId]);
  const days = s.rows[0]?.days ? Number(s.rows[0].days) : null;
  if (!days || !Number.isFinite(days) || days <= 0) return { retentionDays: null, due: [] };
  const r = await q.query<{ participant_id: string; code: string; ended_at: Date; due_at: Date }>(
    `WITH ends AS (
       SELECT ss.participant_id,
              bool_or(ss.status = 'in_progress' AND NOT ss.withdrawn AND NOT ss.excluded) AS live,
              max(coalesce(ss.withdrawn_at, ss.excluded_at, ss.completed_at, ss.last_activity_at, ss.started_at)) AS ended_at
         FROM study_sessions ss WHERE ss.study_id = $1 GROUP BY ss.participant_id
     )
     SELECT p.id AS participant_id, p.code, e.ended_at, e.ended_at + make_interval(days => $2) AS due_at
       FROM ends e JOIN participants p ON p.id = e.participant_id
      WHERE NOT e.live AND e.ended_at IS NOT NULL AND e.ended_at + make_interval(days => $2) <= $3::timestamptz
      ORDER BY e.ended_at, p.code`,
    [studyId, days, now.toISOString()],
  );
  return {
    retentionDays: days,
    due: r.rows.map((x) => ({ participantId: x.participant_id, participantCode: x.code, endedAt: x.ended_at.toISOString(), dueAt: x.due_at.toISOString() })),
  };
}

/** Purges every participant listed by `listRetentionDue`, one transaction each. */
export async function purgeRetentionDue(pool: Pool, input: { studyId: string; actorId: string; now?: Date }): Promise<PurgeResult[]> {
  const { retentionDays, due } = await listRetentionDue(pool, input.studyId, input.now);
  const out: PurgeResult[] = [];
  for (const d of due) {
    out.push(
      await purgeParticipantData(pool, {
        studyId: input.studyId,
        participant: d.participantId,
        reason: `retention period of ${retentionDays} days ended (participation ended ${d.endedAt.slice(0, 10)})`,
        actorId: input.actorId,
        trigger: "retention",
      }),
    );
  }
  return out;
}
