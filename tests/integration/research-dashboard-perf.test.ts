/**
 * Integration: the research dashboard's fast, real-time data path on a reduced load fixture
 * (scripts/research/dashboard-fixture.ts; the full-size run is scripts/research/bench-dashboard.ts).
 *  - per-session rollups give exactly the numbers of the full recompute, also after events are
 *    appended, a late lower seq arrives, a session ends, and after a metrics-version change;
 *  - only changed sessions are recomputed; ended sessions never are;
 *  - statement-level NOTIFY: one notification per statement per study, at commit only;
 *  - the fingerprint moves on every change and reads telemetry_events through an index;
 *  - the bench runs (reduced size) and reports its measurements.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appendEvents, buildDashboardFixture, generateEvents, insertEvents, type Fixture } from "../../scripts/research/dashboard-fixture";
import { bench } from "../../scripts/research/bench-dashboard";
import { dashboardFingerprint, loadDashboard, type DashboardData } from "../../src/server/research/dashboard";
import { fullTelemetry, refreshRollups, ROLLUP_VERSION } from "../../src/server/research/dashboard-rollups";
import { DashboardNotifier } from "../../src/server/research/dashboard-live";
import { loadSnapshotFacts } from "../../src/server/research/metrics/pipeline";
import { TEST_URL, createTestDatabase, type TestDb } from "./schema-harness";

describe.skipIf(!TEST_URL)("research dashboard: rollups, notifications, fingerprint", () => {
  let t: TestDb;
  let f: Fixture;
  let url: string;

  const telemetryOf = (d: DashboardData) => ({ sessions: d.telemetry.sessions, summary: d.telemetry.summary, quality: d.quality });
  const expectSame = async () => {
    const [a, b] = [await loadDashboard(t.pool, f.studyId), await loadDashboard(t.pool, f.studyId, { telemetry: "full" })];
    expect(telemetryOf(a!)).toEqual(telemetryOf(b!));
    return a!;
  };
  const sessionsOf = async () => (await t.pool.query<{ id: string; status: string }>("SELECT id, status::text AS status FROM study_sessions WHERE study_id = $1 AND condition_id IS NOT NULL", [f.studyId])).rows;
  const scope = async () => (await loadSnapshotFacts(t.pool, (await t.pool.query("SELECT snapshot_id FROM studies WHERE id = $1", [f.studyId])).rows[0].snapshot_id)).concepts;

  beforeAll(async () => {
    t = await createTestDatabase("dashperf");
    const u = new URL(TEST_URL!);
    u.pathname = `/${t.name}`;
    url = u.toString();
    f = await buildDashboardFixture(t.pool, { sessions: 12, eventsPerSession: 400, activeSessions: 3, concepts: 10 });
  }, 180_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("rollups equal the full recompute, and only changed sessions are recomputed", async () => {
    const first = await expectSame();
    expect(first.telemetry.sessions).toHaveLength(12);
    expect(first.telemetry.sessions.reduce((n, s) => n + s.events, 0)).toBe(f.events);
    const sessions = await sessionsOf();
    expect((await refreshRollups(t.pool, f.studyId, sessions, await scope())).recomputed).toBe(0);

    await appendEvents(t.pool, f, 0, 37);
    const again = await refreshRollups(t.pool, f.studyId, sessions, await scope());
    expect(again.recomputed).toBe(1);
    expect(again.bySession.get(f.active[0]!.sessionId)!.eventCount).toBe(437);
    await expectSame();
  });

  it("catches a late, lower seq in an open session (count check) and a session that ends", async () => {
    const a = f.active[1]!;
    // Leave a hole at the end, then fill it after a later event arrived.
    const ev = generateEvents(777, 4, f.concepts, f.sourceId, a.nextSeq, a.clientMs);
    const s = { studyId: f.studyId, participantId: a.participantId, sessionId: a.sessionId, conditionId: a.conditionId };
    await insertEvents(t.pool, s, [ev[0]!, ev[1]!, ev[3]!], f.snapshotLabel);
    await expectSame();
    await insertEvents(t.pool, s, [ev[2]!], f.snapshotLabel);
    const sessions = await sessionsOf();
    expect((await refreshRollups(t.pool, f.studyId, sessions, await scope())).recomputed).toBe(1);
    a.nextSeq += 4;
    a.clientMs = ev[3]!.clientMs + 1000;
    await t.pool.query("UPDATE study_sessions SET status = 'completed', completed_at = now(), last_activity_at = now() WHERE id = $1", [a.sessionId]);
    await expectSame();
    expect((await refreshRollups(t.pool, f.studyId, await sessionsOf(), await scope())).recomputed).toBe(0);
  });

  it("recomputes everything when the metrics version changes", async () => {
    await t.pool.query("UPDATE session_telemetry_rollups SET metrics_version = 'timing-0/rollup-0' WHERE study_id = $1", [f.studyId]);
    const r = await refreshRollups(t.pool, f.studyId, await sessionsOf(), await scope());
    expect(r.recomputed).toBe(12);
    const v = await t.pool.query("SELECT DISTINCT metrics_version FROM session_telemetry_rollups WHERE study_id = $1", [f.studyId]);
    expect(v.rows).toEqual([{ metrics_version: ROLLUP_VERSION }]);
    const full = await fullTelemetry(t.pool, await sessionsOf(), await scope());
    expect([...r.bySession.entries()].sort()).toEqual([...full.entries()].sort());
  });

  it("notifies once per statement and study, at commit only", async () => {
    const n = new DashboardNotifier(url, { error: () => {}, warn: () => {} });
    const got: string[] = [];
    n.subscribe(f.studyId, (id) => got.push(id));
    expect(await n.ready()).toBe(true);
    // Connecting wakes every subscribed study once (changes may have been missed before LISTEN).
    expect(got).toEqual([f.studyId]);
    got.length = 0;
    const v0 = n.version(f.studyId);
    try {
      await appendEvents(t.pool, f, 2, 100); // one batch row + one 100-row INSERT, autocommit each
      await new Promise((r) => setTimeout(r, 300));
      expect(got).toEqual([f.studyId, f.studyId]);
      expect(n.version(f.studyId)).not.toBe(v0);
      // A rolled-back change sends nothing.
      const c = await t.pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("UPDATE participants SET stratum = 'x' WHERE study_id = $1", [f.studyId]);
        await c.query("ROLLBACK");
      } finally {
        c.release();
      }
      await new Promise((r) => setTimeout(r, 300));
      expect(got).toHaveLength(2);
      // Session-keyed tables resolve the study through study_sessions.
      await t.pool.query("INSERT INTO telemetry_quarantine (session_id, reason, raw) VALUES ($1, 'schema: test', '{}')", [f.active[2]!.sessionId]);
      await new Promise((r) => setTimeout(r, 300));
      expect(got).toHaveLength(3);
    } finally {
      await n.close();
    }
  });

  it("moves the fingerprint on every change and reads the latest event through an index", async () => {
    const a = await dashboardFingerprint(t.pool, f.studyId);
    await appendEvents(t.pool, f, 2, 5);
    const b = await dashboardFingerprint(t.pool, f.studyId);
    expect(b.fingerprint).not.toBe(a.fingerprint);
    await t.pool.query("UPDATE study_sessions SET interrupted = true, interruption_count = 1 WHERE id = $1", [f.active[2]!.sessionId]);
    const c = await dashboardFingerprint(t.pool, f.studyId);
    expect(c.fingerprint).not.toBe(b.fingerprint);
    const plan = await t.pool.query("EXPLAIN (FORMAT JSON) SELECT max(server_ts) FROM telemetry_events WHERE study_id = $1", [f.studyId]);
    const text = JSON.stringify(plan.rows[0]);
    expect(text).not.toMatch(/"Node Type":"Seq Scan","Parallel Aware":(true|false),"Async Capable":(true|false),"Relation Name":"telemetry_events"/);
    expect(text).toMatch(/Index (Only )?Scan/);
  });

  it("the bench runs on the reduced fixture", async () => {
    const { summary } = await bench(t.pool, f, 2);
    expect(summary.loadDashboard.warmMedianMs).toBeGreaterThan(0);
    expect(summary.coldAfterAppend.rowsTransferred).toBeGreaterThan(0);
    expect(summary.fingerprint.statements).toBe(1);
  }, 120_000);
});
