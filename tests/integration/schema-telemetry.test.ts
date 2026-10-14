/**
 * Integration: telemetry ingestion is idempotent and raw events are append-only.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  TEST_URL,
  addSnapshotItem,
  createPublishedManifest,
  createRealGraph,
  createSession,
  createSnapshot,
  createStudy,
  createTestDatabase,
  createUser,
  one,
  publishSnapshot,
  withSettings,
  type TestDb,
} from "./schema-harness";

describe.skipIf(!TEST_URL)("schema: telemetry", () => {
  let t: TestDb;
  let studyId: string;
  let conditions: { c2d: string; c3d: string };
  let s2d: Awaited<ReturnType<typeof createSession>>;
  let s3d: Awaited<ReturnType<typeof createSession>>;

  beforeAll(async () => {
    t = await createTestDatabase("telemetry");
    const curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "tel", acceptBy: curator });
    const snap = await createSnapshot(t.pool, { label: "v-tel", createdBy: curator });
    await addSnapshotItem(t.pool, snap, "concept", g.conceptIds[0]);
    await publishSnapshot(t.pool, snap, curator);
    const manifest = await createPublishedManifest(t.pool, snap, { by: curator });
    const study = await createStudy(t.pool, { slug: "tel-study", snapshotId: snap, manifestId: manifest });
    studyId = study.studyId;
    conditions = study.conditionIds;
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
    s2d = await createSession(t.pool, studyId, conditions.c2d, "P-2D01", 0);
    s3d = await createSession(t.pool, studyId, conditions.c3d, "P-3D01", 1);
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  const batch = (key: string, sessionId: string) =>
    t.pool.query(
      `INSERT INTO telemetry_batches (idempotency_key, session_id, schema_version, app_build, event_count, accepted_count, status)
       VALUES ($1, $2, 1, 'test-build', 1, 1, 'accepted') RETURNING id`,
      [key, sessionId],
    );

  const event = (
    s: { sessionId: string; participantId: string },
    conditionId: string,
    seq: number,
    type: string,
    eventId: string = randomUUID(),
  ) =>
    t.pool.query(
      `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id,
         client_ts, seq, event_type_code, app_build, content_version)
       VALUES ($1, 1, $2, $3, $4, $5, now(), $6, $7, 'test-build', 'v-tel') RETURNING id, snapshot_id`,
      [eventId, studyId, s.participantId, s.sessionId, conditionId, seq, type],
    );

  it("rejects a second batch with the same idempotency key", async () => {
    await batch("batch-key-0001", s2d.sessionId);
    await expect(batch("batch-key-0001", s2d.sessionId)).rejects.toThrow(/telemetry_batches_idempotency_key_unique|duplicate key/);
    // ON CONFLICT DO NOTHING is how the ingest service recognises a replay.
    const replay = await t.pool.query(
      `INSERT INTO telemetry_batches (idempotency_key, session_id, schema_version, app_build, event_count, accepted_count, status)
       VALUES ('batch-key-0001', $1, 1, 'b', 1, 1, 'accepted') ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [s2d.sessionId],
    );
    expect(replay.rowCount).toBe(0);
  });

  it("rejects batches whose counts do not add up", async () => {
    await expect(
      t.pool.query(
        `INSERT INTO telemetry_batches (idempotency_key, session_id, schema_version, app_build, event_count, accepted_count, status)
         VALUES ('batch-key-0002', $1, 1, 'b', 3, 1, 'partial')`,
        [s2d.sessionId],
      ),
    ).rejects.toThrow(/telemetry_batches_counts_ck/);
  });

  it("deduplicates events by event_id and by (session, seq)", async () => {
    const id = randomUUID();
    const first = await event(s2d, conditions.c2d, 1, "page_entered", id);
    expect(first.rows[0].snapshot_id).toBeTruthy(); // inherited from the session
    await expect(event(s2d, conditions.c2d, 2, "page_entered", id)).rejects.toThrow(/telemetry_events_event_id_unique|duplicate key/);
    await expect(event(s2d, conditions.c2d, 1, "page_exited")).rejects.toThrow(/telemetry_events_session_seq_uq/);
  });

  it("pins study, participant and condition to the session", async () => {
    await expect(event(s2d, conditions.c3d, 10, "information_layer_opened")).rejects.toThrow(/telemetry_events_session_fk/);
    await expect(event({ sessionId: s2d.sessionId, participantId: s3d.participantId }, conditions.c2d, 11, "information_layer_opened")).rejects.toThrow(
      /telemetry_events_session_fk/,
    );
  });

  it("rejects raw event types that do not belong to the condition's interface", async () => {
    await expect(event(s2d, conditions.c2d, 20, "room_entered")).rejects.toThrow(/cannot occur in a conventional_2d condition/);
    await expect(event(s3d, conditions.c3d, 20, "page_entered")).rejects.toThrow(/cannot occur in a immersive_3d condition/);
    await expect(event(s3d, conditions.c3d, 21, "room_entered")).resolves.toBeDefined();
    await expect(event(s3d, conditions.c3d, 22, "no_such_event")).rejects.toThrow(/foreign key/);
  });

  it("never updates raw events and deletes them only in a reasoned purge", async () => {
    const e = await event(s3d, conditions.c3d, 30, "exhibit_selected");
    const id = e.rows[0].id as string;
    await expect(t.pool.query("UPDATE telemetry_events SET target = 'x' WHERE id = $1", [id])).rejects.toThrow(/immutable/);
    await expect(t.pool.query("DELETE FROM telemetry_events WHERE id = $1", [id])).rejects.toThrow(/app.telemetry_purge_reason/);
    await expect(t.pool.query("TRUNCATE telemetry_events CASCADE")).rejects.toThrow(/cannot be truncated/);
    await withSettings(t.pool, { "app.telemetry_purge_reason": "participant withdrew (test)" }, (c) =>
      c.query("DELETE FROM telemetry_events WHERE id = $1", [id]),
    );
    const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM telemetry_events WHERE id = $1", [id]);
    expect(n.n).toBe(0);
  });
});
