/**
 * Integration: POST /api/telemetry/batch logic (src/server/telemetry/ingest.ts) and the study
 * mode of the learning context, against a throwaway database with an active study.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { telemetryIngestResponseSchema } from "../../src/features/telemetry/contracts";
import { pgLearningContextData, resolveLearningContext } from "../../src/server/learning/context-data";
import { ingestTelemetryBatch, type TelemetryPrincipal } from "../../src/server/telemetry/ingest";
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
  type TestDb,
} from "./schema-harness";

type Session = Awaited<ReturnType<typeof createSession>>;

describe.skipIf(!TEST_URL)("telemetry ingestion", () => {
  let t: TestDb;
  let s2d: Session;
  let s3d: Session;
  let sDemo: Session;
  let conceptId: string;
  let snapshotId: string;
  let manifestId: string;
  const label = "v-ingest";

  beforeAll(async () => {
    t = await createTestDatabase("ingest");
    const curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "ing", acceptBy: curator });
    conceptId = g.conceptIds[0];
    snapshotId = await createSnapshot(t.pool, { label, createdBy: curator });
    await addSnapshotItem(t.pool, snapshotId, "concept", conceptId);
    await publishSnapshot(t.pool, snapshotId, curator);
    manifestId = await createPublishedManifest(t.pool, snapshotId, { by: curator });

    const real = await createStudy(t.pool, { slug: "ingest-study", snapshotId, manifestId });
    await t.pool.query("UPDATE studies SET status = 'active', config = $2::jsonb WHERE id = $1", [real.studyId, JSON.stringify({ traditionSlugs: ["ing-tradition"], searchEnabled: false })]);
    s2d = await createSession(t.pool, real.studyId, real.conditionIds.c2d, "P-ING01", 0);
    s3d = await createSession(t.pool, real.studyId, real.conditionIds.c3d, "P-ING02", 1);

    // A demo study may run on a real published snapshot; its sessions are never experimental.
    const demo = await createStudy(t.pool, { slug: "demo-ingest", snapshotId, manifestId, isDemo: true });
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [demo.studyId]);
    sDemo = await createSession(t.pool, demo.studyId, demo.conditionIds.c2d, "D-ING01", 0);
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  const who = (s: Session): TelemetryPrincipal => ({ kind: "participant", participantId: s.participantId, sessionId: s.sessionId });
  const ev = (s: Session, seq: number, type = "page_entered", extra: Record<string, unknown> = {}) => ({
    eventId: randomUUID(),
    schemaVersion: 1,
    sessionId: s.sessionId,
    seq,
    type,
    clientTs: new Date().toISOString(),
    clientMonoMs: 1000 + seq,
    metadata: {},
    ...extra,
  });
  const batch = (s: Session, events: unknown[], key = `b:${s.sessionId}:${randomUUID().slice(0, 8)}`) => ({
    idempotencyKey: key,
    sessionId: s.sessionId,
    schemaVersion: 1,
    appBuild: "test-build",
    contentVersion: label,
    clientSentAt: new Date().toISOString(),
    events,
  });
  const ingest = (p: TelemetryPrincipal, body: unknown) => ingestTelemetryBatch(t.pool, p, body);
  const count = async (sql: string, params: unknown[]) => (await one<{ n: number }>(t.pool, sql, params)).n;

  it("stores a valid batch, binds identity from the session and records server receipt time", async () => {
    const receivedAt = new Date("2026-10-14T10:00:00.000Z");
    const r = await ingestTelemetryBatch(t.pool, who(s2d), batch(s2d, [ev(s2d, 0), ev(s2d, 1, "concept_encountered", { conceptId, metadata: { mode: "seen" } })]), { receivedAt });
    expect(r.status).toBe(200);
    if (r.status !== 200) return;
    expect(telemetryIngestResponseSchema.parse(r.body)).toMatchObject({ status: "accepted", accepted: 2, duplicates: 0, quarantined: 0, persisted: true, nonExperimental: false, gaps: [] });
    const row = await one<{ participant_id: string; condition_id: string; server_ts: Date; snapshot_id: string }>(
      t.pool,
      "SELECT participant_id, condition_id, server_ts, snapshot_id FROM telemetry_events WHERE session_id = $1 AND seq = 1",
      [s2d.sessionId],
    );
    expect(row.participant_id).toBe(s2d.participantId);
    expect(row.server_ts.toISOString()).toBe(receivedAt.toISOString());
    expect(row.snapshot_id).toBe(snapshotId);
  });

  it("is idempotent on the batch key and on event ids", async () => {
    const events = [ev(s2d, 2), ev(s2d, 3)];
    const body = batch(s2d, events, `b:${s2d.sessionId}:2-3`);
    const a = await ingest(who(s2d), body);
    const b = await ingest(who(s2d), body);
    expect(a.status === 200 && a.body.accepted).toBe(2);
    expect(b.status === 200 && b.body).toMatchObject({ replayed: true, accepted: 2, batchId: a.status === 200 ? a.body.batchId : "" });
    // Same events under a new key (e.g. resent after a page-exit beacon): duplicates, not new rows.
    const c = await ingest(who(s2d), batch(s2d, events));
    expect(c.status === 200 && c.body).toMatchObject({ replayed: false, accepted: 0, duplicates: 2 });
    expect(await count("SELECT count(*)::int AS n FROM telemetry_events WHERE session_id = $1 AND seq IN (2, 3)", [s2d.sessionId])).toBe(2);
  });

  it("detects sequence gaps, out-of-order arrivals and resolves filled gaps", async () => {
    const r = await ingest(who(s2d), batch(s2d, [ev(s2d, 7), ev(s2d, 8)]));
    expect(r.status === 200 && r.body.gaps).toEqual([{ fromSeq: 4, toSeq: 6 }]);
    expect(await count("SELECT count(*)::int AS n FROM sequence_gaps WHERE session_id = $1 AND kind = 'gap' AND resolved_at IS NULL", [s2d.sessionId])).toBe(1);
    const fill = await ingest(who(s2d), batch(s2d, [ev(s2d, 4), ev(s2d, 5), ev(s2d, 6)]));
    expect(fill.status === 200 && fill.body.gaps).toEqual([]);
    expect(await count("SELECT count(*)::int AS n FROM sequence_gaps WHERE session_id = $1 AND kind = 'gap' AND resolved_at IS NOT NULL", [s2d.sessionId])).toBe(1);
    expect(await count("SELECT count(*)::int AS n FROM sequence_gaps WHERE session_id = $1 AND kind = 'out_of_order'", [s2d.sessionId])).toBe(1);
  });

  it("quarantines invalid events instead of dropping them", async () => {
    const bad = [
      ev(s2d, 9, "page_entered", { metadata: { email: "x@example.org" } }), // not in the metadata allowlist
      ev(s2d, 10, "room_entered"), // 3D-only event in a 2D session (database rule)
      ev(s2d, 0), // seq already used by another event
      { ...ev(s2d, 11), sessionId: s3d.sessionId }, // event of another session
      ev(s2d, 12, "concept_encountered", { conceptId: randomUUID(), metadata: { mode: "seen" } }), // concept not in the snapshot
      ev(s2d, 13),
    ];
    const r = await ingest(who(s2d), batch(s2d, bad));
    expect(r.status === 200 && r.body).toMatchObject({ status: "partial", accepted: 1, quarantined: 5 });
    const reasons = (await t.pool.query<{ reason: string }>("SELECT reason FROM telemetry_quarantine WHERE session_id = $1 ORDER BY received_at, id", [s2d.sessionId])).rows.map((x) => x.reason);
    expect(reasons.some((x) => x.startsWith("schema:"))).toBe(true);
    expect(reasons.some((x) => /cannot occur in a conventional_2d condition/.test(x))).toBe(true);
    expect(reasons.some((x) => x.startsWith("seq_conflict"))).toBe(true);
    expect(reasons.some((x) => x.startsWith("session_mismatch"))).toBe(true);
    expect(reasons.some((x) => /not part of the session snapshot/.test(x))).toBe(true);
    const b = await one<{ event_count: number; accepted_count: number; quarantined_count: number }>(
      t.pool,
      "SELECT event_count, accepted_count, quarantined_count FROM telemetry_batches WHERE id = $1",
      [r.status === 200 ? r.body.batchId : null],
    );
    expect(b).toEqual({ event_count: 6, accepted_count: 1, quarantined_count: 5 });
  });

  it("rejects cross-session writes and never trusts client identity", async () => {
    const cross = await ingest(who(s3d), batch(s2d, [ev(s2d, 50)]));
    expect(cross).toMatchObject({ status: 403, body: { error: "session_mismatch" } });
    // A forged principal whose participant does not own the session.
    const forged = await ingest({ kind: "participant", participantId: s3d.participantId, sessionId: s2d.sessionId }, batch(s2d, [ev(s2d, 51)]));
    expect(forged).toMatchObject({ status: 401, body: { error: "unauthenticated" } });
    // Re-using another session's idempotency key.
    const key = `b:${s2d.sessionId}:stolen`;
    await ingest(who(s2d), batch(s2d, [ev(s2d, 60)], key));
    const stolen = await ingest(who(s3d), batch(s3d, [ev(s3d, 0, "room_entered")], key));
    expect(stolen).toMatchObject({ status: 403, body: { error: "session_mismatch" } });
    expect(await count("SELECT count(*)::int AS n FROM telemetry_events WHERE session_id = $1", [s3d.sessionId])).toBe(0);
  });

  it("refuses an invalid envelope with 400", async () => {
    const r = await ingest(who(s2d), { ...batch(s2d, [ev(s2d, 70)]), schemaVersion: 2 });
    expect(r).toMatchObject({ status: 400, body: { error: "invalid_batch" } });
  });

  it("flags demo-study sessions as non-experimental and stores them", async () => {
    const r = await ingest(who(sDemo), batch(sDemo, [ev(sDemo, 0)]));
    expect(r.status === 200 && r.body).toMatchObject({ persisted: true, nonExperimental: true, accepted: 1 });
  });

  it("acknowledges public-demo and staff-preview uploads without writing anything", async () => {
    const demoSession = randomUUID();
    const fake = { sessionId: demoSession, participantId: randomUUID(), allocationId: "" } as Session;
    const before = await count("SELECT count(*)::int AS n FROM telemetry_batches", []);
    for (const p of [{ kind: "demo", demoId: "d".repeat(32) }, { kind: "preview", userId: "staff-1" }] as TelemetryPrincipal[]) {
      const r = await ingest(p, batch(fake, [ev(fake, 0), ev(fake, 1, "page_entered", { metadata: { nope: 1 } })]));
      expect(r.status === 200 && r.body).toMatchObject({ persisted: false, nonExperimental: true, batchId: null, accepted: 1, quarantined: 1 });
    }
    expect(await count("SELECT count(*)::int AS n FROM telemetry_batches", [])).toBe(before);
  });

  it("refuses telemetry for a withdrawn session", async () => {
    await t.pool.query("UPDATE study_sessions SET withdrawn = true, withdrawn_at = now() WHERE id = $1", [s3d.sessionId]);
    const r = await ingest(who(s3d), batch(s3d, [ev(s3d, 1, "room_entered")]));
    expect(r).toMatchObject({ status: 410, body: { error: "session_closed" } });
  });

  it("resolves the study-mode learning context from the session's pinned snapshot and manifest", async () => {
    const ctx = await resolveLearningContext(
      { kind: "participant", experimental: true, condition: "2d", participantId: s2d.participantId, sessionId: s2d.sessionId },
      { data: pgLearningContextData(t.pool), appBuild: "test" },
    );
    expect(ctx).toMatchObject({
      mode: "study",
      snapshotId,
      contentVersion: label,
      manifestId,
      sessionId: s2d.sessionId,
      participantPseudonym: "P-ING01",
      nonExperimental: false,
      unverifiedContent: false,
      features: { search: false },
      telemetrySessionId: s2d.sessionId,
    });
    const demoCtx = await resolveLearningContext(
      { kind: "participant", experimental: true, condition: "2d", participantId: sDemo.participantId, sessionId: sDemo.sessionId },
      { data: pgLearningContextData(t.pool), appBuild: "test" },
    );
    expect(demoCtx.nonExperimental).toBe(true);
  });
});
