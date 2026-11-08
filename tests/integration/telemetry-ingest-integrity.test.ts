import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { refreshRollups } from "../../src/server/research/dashboard-rollups";
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

describe.skipIf(!TEST_URL)("telemetry ingest integrity", () => {
  let t: TestDb;
  let studyId: string;
  let c2d: string;
  let snapshotId: string;
  let n = 0;
  const label = "v-integrity";

  beforeAll(async () => {
    t = await createTestDatabase("ingint");
    const curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "ii", acceptBy: curator });
    snapshotId = await createSnapshot(t.pool, { label, createdBy: curator });
    await addSnapshotItem(t.pool, snapshotId, "concept", g.conceptIds[0]);
    await publishSnapshot(t.pool, snapshotId, curator);
    const manifestId = await createPublishedManifest(t.pool, snapshotId, { by: curator });
    const real = await createStudy(t.pool, { slug: "integrity-study", snapshotId, manifestId });
    await t.pool.query("UPDATE studies SET status = 'active', config = $2::jsonb WHERE id = $1", [real.studyId, JSON.stringify({ traditionSlugs: ["ii-tradition"] })]);
    studyId = real.studyId;
    c2d = real.conditionIds.c2d;
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  const fresh = () => createSession(t.pool, studyId, c2d, `P-II${String(++n).padStart(3, "0")}`, n);
  const who = (s: Session): TelemetryPrincipal => ({ kind: "participant", participantId: s.participantId, sessionId: s.sessionId });
  const ev = (s: Session, seq: number, extra: Record<string, unknown> = {}) => ({
    eventId: randomUUID(),
    schemaVersion: 1,
    sessionId: s.sessionId,
    seq,
    type: "page_entered",
    clientTs: new Date(Date.now() - 60_000).toISOString(),
    clientMonoMs: 1000 + seq,
    metadata: {},
    ...extra,
  });
  const range = (s: Session, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ev(s, from + i));
  const batch = (s: Session, events: unknown[], key = `b:${s.sessionId}:${randomUUID().slice(0, 8)}`) => ({
    idempotencyKey: key,
    sessionId: s.sessionId,
    schemaVersion: 1,
    appBuild: "test-build",
    contentVersion: label,
    clientSentAt: new Date().toISOString(),
    events,
  });
  const openGaps = async (s: Session) =>
    (await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM sequence_gaps WHERE session_id = $1 AND kind = 'gap' AND resolved_at IS NULL", [s.sessionId])).n;

  it("leaves no open gap when two disjoint batches of one session are ingested concurrently", async () => {
    const sessions = await Promise.all(Array.from({ length: 6 }, () => fresh()));
    for (const s of sessions) {
      const [hi, lo] = await Promise.all([ingestTelemetryBatch(t.pool, who(s), batch(s, range(s, 50, 99))), ingestTelemetryBatch(t.pool, who(s), batch(s, range(s, 0, 49)))]);
      expect(hi.status === 200 && hi.body.accepted).toBe(50);
      expect(lo.status === 200 && lo.body.accepted).toBe(50);
    }
    const open = await Promise.all(sessions.map(openGaps));
    expect(open).toEqual(sessions.map(() => 0));
  });

  it("does not report a quarantined seq again as an open sequence gap", async () => {
    const s = await fresh();
    const r = await ingestTelemetryBatch(t.pool, who(s), batch(s, [ev(s, 0), ev(s, 1, { type: "concept_encountered", conceptId: randomUUID(), metadata: { mode: "seen" } }), ev(s, 2)]));
    expect(r.status === 200 && r.body).toMatchObject({ accepted: 2, quarantined: 1, gaps: [] });
    expect(await openGaps(s)).toBe(0);
    const later = await ingestTelemetryBatch(t.pool, who(s), batch(s, [ev(s, 5)]));
    expect(later.status === 200 && later.body.gaps).toEqual([{ fromSeq: 3, toSeq: 4 }]);
  });

  it("invalidates the dashboard rollup of an ended session when a late, lower seq arrives", async () => {
    const s = await fresh();
    const early = new Date(Date.now() - 120_000).toISOString();
    await ingestTelemetryBatch(t.pool, who(s), batch(s, [ev(s, 0, { clientTs: early }), ev(s, 1, { clientTs: early }), ev(s, 3, { clientTs: early })]));
    await t.pool.query("UPDATE study_sessions SET status = 'completed', completed_at = now(), last_activity_at = now() WHERE id = $1", [s.sessionId]);
    const sessions = async () => (await t.pool.query<{ id: string; status: string }>("SELECT id, status::text AS status FROM study_sessions WHERE study_id = $1 AND condition_id IS NOT NULL", [studyId])).rows;
    await refreshRollups(t.pool, studyId, await sessions());
    const before = await one<{ event_count: number }>(t.pool, "SELECT event_count FROM session_telemetry_rollups WHERE session_id = $1", [s.sessionId]);
    expect(before.event_count).toBe(3);

    const late = await ingestTelemetryBatch(t.pool, who(s), batch(s, [ev(s, 2, { clientTs: early })]));
    expect(late.status === 200 && late.body.accepted).toBe(1);
    const r = await refreshRollups(t.pool, studyId, await sessions());
    expect(r.bySession.get(s.sessionId)!.eventCount).toBe(4);
  });

  it("does not acknowledge different events under a stored idempotency key as a replay", async () => {
    const s = await fresh();
    await ingestTelemetryBatch(t.pool, who(s), batch(s, [ev(s, 0)], `b:${s.sessionId}:0-0`));
    const tab1 = ev(s, 1);
    const tab2 = ev(s, 1);
    const a = await ingestTelemetryBatch(t.pool, who(s), batch(s, [tab1], `b:${s.sessionId}:1-1`));
    expect(a.status === 200 && a.body).toMatchObject({ accepted: 1, replayed: false });
    const retry = await ingestTelemetryBatch(t.pool, who(s), batch(s, [tab1], `b:${s.sessionId}:1-1`));
    expect(retry.status === 200 && retry.body).toMatchObject({ replayed: true, accepted: 1 });
    const b = await ingestTelemetryBatch(t.pool, who(s), batch(s, [tab2], `b:${s.sessionId}:1-1`));
    expect(b.status === 200 && b.body).toMatchObject({ replayed: false, quarantined: 1 });
    const q = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM telemetry_quarantine WHERE event_id = $1 AND reason LIKE 'seq_conflict%'", [tab2.eventId]);
    expect(q.n).toBe(1);
    const bRetry = await ingestTelemetryBatch(t.pool, who(s), batch(s, [tab2], `b:${s.sessionId}:1-1`));
    expect(bRetry.status === 200 && bRetry.body.replayed).toBe(true);
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM telemetry_quarantine WHERE event_id = $1", [tab2.eventId])).n).toBe(1);
  });
});
