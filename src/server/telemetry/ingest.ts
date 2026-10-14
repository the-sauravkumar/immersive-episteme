/**
 * Telemetry batch ingestion (POST /api/telemetry/batch). The route handler
 * (src/app/api/telemetry/batch/route.ts) resolves WHO is calling from the cookies and passes a
 * `TelemetryPrincipal`; everything else happens here. Not `server-only`, so the integration
 * tests drive it against throwaway databases.
 *
 * Rules
 *  - Identity comes from the authenticated principal, never from the body. The client sends no
 *    participant, study or condition; they are read from the `study_sessions` row.
 *  - Cross-session writes are refused: the batch `sessionId` must be the principal's session
 *    (403 session_mismatch); an event whose own `sessionId` differs is quarantined.
 *  - Idempotency: `telemetry_batches.idempotency_key` (a replay returns the stored outcome with
 *    `replayed: true`) and `telemetry_events.event_id` (an event already stored, e.g. sent
 *    earlier by a page-exit beacon under another key, counts as a duplicate).
 *  - Every event is validated with `telemetryEventSchema`; invalid events, seq conflicts and
 *    database rule violations (scope/condition mismatch, concept not in the snapshot, events
 *    after the session ended, ...) go to `telemetry_quarantine` with the reason. Nothing is
 *    dropped silently.
 *  - Server receipt time: one `receivedAt` per request, stored as `telemetry_batches.received_at`
 *    and `telemetry_events.server_ts`.
 *  - Sequence gaps: after the batch, missing seq ranges of the session (seq starts at 0) are
 *    upserted into `sequence_gaps` (kind `gap`; filled gaps get `resolved_at`), and an arrival
 *    below the session's previous maximum is recorded as `out_of_order`.
 *  - Demo and staff preview have no study session: the batch is validated and acknowledged
 *    (`persisted: false`, `nonExperimental: true`) but nothing is written.
 */
import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import {
  telemetryBatchEnvelopeSchema,
  telemetryEventSchema,
  type TelemetryEvent,
  type TelemetryIngestError,
  type TelemetryIngestResponse,
} from "@/features/telemetry/contracts";
import { canonicalJson } from "@/features/knowledge/graph/canonical-json";
import { studyConfigSchema } from "@/features/study/contracts";

export type TelemetryPrincipal =
  | { kind: "participant"; participantId: string; sessionId: string }
  | { kind: "demo"; demoId: string }
  | { kind: "preview"; userId: string };

export type IngestOutcome =
  | { status: 200; body: TelemetryIngestResponse }
  | { status: 400 | 401 | 403 | 410 | 413 | 429 | 500; body: { error: TelemetryIngestError; message: string; issues?: unknown } };

const fail = (status: Exclude<IngestOutcome["status"], 200>, error: TelemetryIngestError, message: string, issues?: unknown): IngestOutcome => ({
  status,
  body: issues === undefined ? { error, message } : { error, message, issues },
});

interface SessionRow {
  study_id: string;
  participant_id: string;
  condition_id: string;
  status: string;
  withdrawn: boolean;
  participant_status: string;
  study_is_demo: boolean;
  study_config: unknown;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Validates and stores one batch for `principal`. `body` is the parsed JSON request body. */
export async function ingestTelemetryBatch(
  pool: Pool,
  principal: TelemetryPrincipal,
  body: unknown,
  opts: { receivedAt?: Date } = {},
): Promise<IngestOutcome> {
  const receivedAt = opts.receivedAt ?? new Date();
  const env = telemetryBatchEnvelopeSchema.safeParse(body);
  if (!env.success) {
    return fail(400, "invalid_batch", "The batch envelope is invalid", env.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const batch = env.data;

  if (principal.kind !== "participant") {
    // Demo / preview: validate, acknowledge, store nothing.
    let valid = 0;
    let invalid = 0;
    for (const raw of batch.events) {
      const r = telemetryEventSchema.safeParse(raw);
      if (r.success && r.data.sessionId === batch.sessionId) valid++;
      else invalid++;
    }
    return {
      status: 200,
      body: {
        batchId: null,
        status: invalid === 0 ? "accepted" : valid === 0 ? "rejected" : "partial",
        replayed: false,
        accepted: valid,
        duplicates: 0,
        quarantined: invalid,
        persisted: false,
        nonExperimental: true,
        gaps: [],
        serverReceivedAt: receivedAt.toISOString(),
      },
    };
  }

  if (batch.sessionId !== principal.sessionId) {
    return fail(403, "session_mismatch", "The batch belongs to another session than the signed-in participant session");
  }

  const client = await pool.connect();
  try {
    const s = await client.query<SessionRow>(
      `SELECT ss.study_id, ss.participant_id, ss.condition_id, ss.status, ss.withdrawn, p.status AS participant_status,
              st.is_demo AS study_is_demo, st.config AS study_config
         FROM study_sessions ss JOIN participants p ON p.id = ss.participant_id JOIN studies st ON st.id = ss.study_id
        WHERE ss.id = $1`,
      [principal.sessionId],
    );
    const session = s.rows[0];
    if (!session || session.participant_id !== principal.participantId) {
      return fail(401, "unauthenticated", "The participant session does not exist");
    }
    if (session.withdrawn || session.participant_status === "withdrawn" || session.participant_status === "excluded") {
      return fail(410, "session_closed", "Telemetry is not accepted for a withdrawn or excluded participant");
    }
    const cfg = studyConfigSchema.safeParse(session.study_config);
    const nonExperimental = session.study_is_demo || (cfg.success && cfg.data.nonExperimental);

    await client.query("BEGIN");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO telemetry_batches (idempotency_key, session_id, schema_version, app_build, client_sent_at, received_at,
                                      event_count, accepted_count, duplicate_count, quarantined_count, status, payload_sha256)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0, 'accepted', $7)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [batch.idempotencyKey, principal.sessionId, batch.schemaVersion, batch.appBuild, batch.clientSentAt, receivedAt, sha256(canonicalJson(body))],
    );
    if (!ins.rows[0]) {
      await client.query("ROLLBACK");
      const prev = await client.query<{ id: string; session_id: string; status: "accepted" | "partial" | "rejected"; accepted_count: number; duplicate_count: number; quarantined_count: number }>(
        "SELECT id, session_id, status, accepted_count, duplicate_count, quarantined_count FROM telemetry_batches WHERE idempotency_key = $1",
        [batch.idempotencyKey],
      );
      const p = prev.rows[0]!;
      if (p.session_id !== principal.sessionId) {
        return fail(403, "session_mismatch", "This idempotency key belongs to another session");
      }
      return {
        status: 200,
        body: {
          batchId: p.id,
          status: p.status,
          replayed: true,
          accepted: p.accepted_count,
          duplicates: p.duplicate_count,
          quarantined: p.quarantined_count,
          persisted: true,
          nonExperimental,
          gaps: await currentGaps(client, principal.sessionId),
          serverReceivedAt: receivedAt.toISOString(),
        },
      };
    }
    const batchId = ins.rows[0].id;

    const before = await client.query<{ max: number | null }>("SELECT max(seq) AS max FROM telemetry_events WHERE session_id = $1", [principal.sessionId]);
    const previousMax = before.rows[0]?.max ?? null;

    let accepted = 0;
    let duplicates = 0;
    let quarantined = 0;
    const acceptedSeqs: number[] = [];
    const seenIds = new Set<string>();

    const quarantine = async (raw: unknown, reason: string, eventId: string | null) => {
      quarantined++;
      await client.query(
        "INSERT INTO telemetry_quarantine (batch_id, session_id, event_id, reason, raw, received_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
        [batchId, principal.sessionId, eventId, reason.slice(0, 1000), JSON.stringify(raw ?? null), receivedAt],
      );
    };

    for (const raw of batch.events) {
      const parsed = telemetryEventSchema.safeParse(raw);
      const rawId = typeof (raw as { eventId?: unknown })?.eventId === "string" && /^[0-9a-f-]{36}$/i.test((raw as { eventId: string }).eventId) ? (raw as { eventId: string }).eventId : null;
      if (!parsed.success) {
        await quarantine(raw, `schema: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`, rawId);
        continue;
      }
      const e: TelemetryEvent = parsed.data;
      if (e.sessionId !== principal.sessionId) {
        await quarantine(raw, "session_mismatch: event sessionId differs from the authenticated session", e.eventId);
        continue;
      }
      if (seenIds.has(e.eventId)) {
        duplicates++;
        continue;
      }
      seenIds.add(e.eventId);

      await client.query("SAVEPOINT ev");
      try {
        const r = await client.query(
          `INSERT INTO telemetry_events (event_id, batch_id, schema_version, study_id, participant_id, session_id, condition_id,
              client_ts, client_mono_ms, server_ts, seq, event_type_code, concept_id, category_code, tradition_id,
              room_or_page_id, target, metadata, app_build, content_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20)
           ON CONFLICT DO NOTHING`,
          [
            e.eventId, batchId, e.schemaVersion, session.study_id, session.participant_id, principal.sessionId, session.condition_id,
            e.clientTs, e.clientMonoMs ?? null, receivedAt, e.seq, e.type, e.conceptId ?? null, e.category ?? null, e.traditionId ?? null,
            e.roomOrPageId ?? null, e.target ?? null, JSON.stringify(e.metadata), batch.appBuild, batch.contentVersion,
          ],
        );
        await client.query("RELEASE SAVEPOINT ev");
        if (r.rowCount === 1) {
          accepted++;
          acceptedSeqs.push(e.seq);
          continue;
        }
        // Conflict: the same event already stored (duplicate) or another event holds this seq.
        const existing = await client.query<{ event_id: string }>("SELECT event_id FROM telemetry_events WHERE event_id = $1", [e.eventId]);
        if (existing.rows[0]) {
          duplicates++;
        } else {
          await quarantine(raw, `seq_conflict: seq ${e.seq} is already used by another event of this session`, e.eventId);
          await client.query(
            `INSERT INTO sequence_gaps (session_id, kind, from_seq, to_seq, details) VALUES ($1, 'duplicate', $2, $2, $3::jsonb)
             ON CONFLICT (session_id, kind, from_seq) DO UPDATE SET details = EXCLUDED.details, detected_at = now()`,
            [principal.sessionId, e.seq, JSON.stringify({ eventId: e.eventId, batchId })],
          );
        }
      } catch (err) {
        await client.query("ROLLBACK TO SAVEPOINT ev");
        const msg = err instanceof Error ? err.message : String(err);
        await quarantine(raw, `rejected: ${msg}`, e.eventId);
      }
    }

    // Out-of-order arrival: this batch carried seqs below what the session had already stored.
    if (previousMax !== null && acceptedSeqs.some((q) => q < previousMax)) {
      const lowest = Math.min(...acceptedSeqs);
      await client.query(
        `INSERT INTO sequence_gaps (session_id, kind, from_seq, to_seq, details) VALUES ($1, 'out_of_order', $2, $3, $4::jsonb)
         ON CONFLICT (session_id, kind, from_seq) DO UPDATE SET to_seq = greatest(sequence_gaps.to_seq, EXCLUDED.to_seq), detected_at = now()`,
        [principal.sessionId, lowest, previousMax, JSON.stringify({ batchId, previousMax })],
      );
    }
    const gaps = await currentGaps(client, principal.sessionId);
    await recordGaps(client, principal.sessionId, gaps);

    const eventCount = batch.events.length;
    const status = quarantined === 0 ? "accepted" : accepted + duplicates === 0 ? "rejected" : "partial";
    await client.query(
      "UPDATE telemetry_batches SET event_count = $2, accepted_count = $3, duplicate_count = $4, quarantined_count = $5, status = $6 WHERE id = $1",
      [batchId, eventCount, accepted, duplicates, quarantined, status],
    );
    await client.query("UPDATE study_sessions SET last_activity_at = greatest(coalesce(last_activity_at, $2), $2) WHERE id = $1 AND status = 'in_progress'", [
      principal.sessionId,
      receivedAt,
    ]);
    await client.query("COMMIT");
    return {
      status: 200,
      body: {
        batchId,
        status,
        replayed: false,
        accepted,
        duplicates,
        quarantined,
        persisted: true,
        nonExperimental,
        gaps,
        serverReceivedAt: receivedAt.toISOString(),
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Missing seq ranges of a session's stored events (seq numbering starts at 0). */
export async function currentGaps(q: Pick<PoolClient, "query">, sessionId: string): Promise<{ fromSeq: number; toSeq: number }[]> {
  const r = await q.query<{ from_seq: number; to_seq: number }>(
    `WITH s AS (SELECT seq, lag(seq) OVER (ORDER BY seq) AS prev FROM telemetry_events WHERE session_id = $1)
     SELECT 0 AS from_seq, min(seq) - 1 AS to_seq FROM s HAVING min(seq) > 0
     UNION ALL
     SELECT prev + 1, seq - 1 FROM s WHERE prev IS NOT NULL AND seq > prev + 1
     ORDER BY 1`,
    [sessionId],
  );
  return r.rows.map((x) => ({ fromSeq: Number(x.from_seq), toSeq: Number(x.to_seq) }));
}

async function recordGaps(q: Pick<PoolClient, "query">, sessionId: string, gaps: { fromSeq: number; toSeq: number }[]): Promise<void> {
  await q.query(
    `INSERT INTO sequence_gaps (session_id, kind, from_seq, to_seq)
     SELECT $1, 'gap', from_seq, to_seq FROM jsonb_to_recordset($2::jsonb) AS x(from_seq integer, to_seq integer)
     ON CONFLICT (session_id, kind, from_seq) DO UPDATE SET to_seq = EXCLUDED.to_seq, resolved_at = NULL
       WHERE sequence_gaps.to_seq IS DISTINCT FROM EXCLUDED.to_seq OR sequence_gaps.resolved_at IS NOT NULL`,
    [sessionId, JSON.stringify(gaps.map((g) => ({ from_seq: g.fromSeq, to_seq: g.toSeq })))],
  );
  await q.query(
    `UPDATE sequence_gaps SET resolved_at = now()
      WHERE session_id = $1 AND kind = 'gap' AND resolved_at IS NULL AND NOT (from_seq = ANY($2::int[]))`,
    [sessionId, gaps.map((g) => g.fromSeq)],
  );
}
