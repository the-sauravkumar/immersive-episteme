/**
 * Research-dashboard benchmark (docs/research/design-process/modules/research-dashboard.md).
 *
 *   npx tsx scripts/research/bench-dashboard.ts [--sessions 100] [--events 3000] [--active 5] [--runs 5] [--out file.json] [--keep]
 *
 * Creates a throwaway database on TEST_DATABASE_URL (tests/integration/schema-harness.ts), builds
 * the load fixture (./dashboard-fixture.ts) and measures, with the dashboard code as it is:
 *  - loadDashboard: first (cold) run, then the median of `runs` warm runs; statements, rows
 *    transferred and the slowest statements;
 *  - cold-after-append: 50 events appended to each of 3 active sessions, then one load;
 *  - dashboardFingerprint: median of `runs`;
 *  - EXPLAIN (ANALYZE, BUFFERS) of the slowest dashboard statements and of the fingerprint;
 *  - the database time of one 100-event ingest INSERT (row and statement triggers included);
 *  - push path: NOTIFY delivery time (commit → listener callback), a coalesced refresh with no
 *    change (memo hit) and 10 concurrent viewers after a change (computations started).
 * Prints a JSON summary; `--out` also writes the full plans. The database is dropped unless --keep.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { Pool, QueryResult } from "pg";

import { dashboardFingerprint, loadDashboard } from "../../src/server/research/dashboard";
import { DashboardCoalescer } from "../../src/server/research/dashboard-cache";
import { DashboardNotifier } from "../../src/server/research/dashboard-live";
import { createTestDatabase, TEST_URL } from "../../tests/integration/schema-harness";
import { appendEvents, buildDashboardFixture, generateEvents, type Fixture } from "./dashboard-fixture";

interface Stmt {
  text: string;
  params: unknown[];
  ms: number;
  rows: number;
}

/** A Q that records every statement (text, params, wall time, rows returned). */
export function recordingQ(pool: Pool) {
  const log: Stmt[] = [];
  const q = {
    async query(text: string, params?: unknown[]): Promise<QueryResult> {
      const t0 = performance.now();
      const r = await pool.query(text, params as unknown[]);
      log.push({ text, params: params ?? [], ms: performance.now() - t0, rows: r.rowCount ?? r.rows.length });
      return r;
    },
    connect: () => pool.connect(),
  };
  return { q: q as unknown as Pool, log, reset: () => log.splice(0) };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * EXPLAIN (ANALYZE, BUFFERS). `noSeqScan` plans with enable_seqscan = off (inside a rolled-back
 * transaction): on a small fixture the planner rightly seq-scans tables of a few pages, so this
 * shows which index path it takes once the tables are large.
 */
async function explain(pool: Pool, s: Pick<Stmt, "text" | "params">, noSeqScan = false) {
  const c = await pool.connect();
  let r!: QueryResult;
  try {
    await c.query("BEGIN");
    if (noSeqScan) await c.query("SET LOCAL enable_seqscan = off");
    r = await c.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${s.text}`, s.params);
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
  const plan = (r.rows[0] as { "QUERY PLAN": [{ Plan: Record<string, unknown>; "Execution Time": number }] })["QUERY PLAN"][0];
  const nodes: string[] = [];
  const walk = (n: Record<string, unknown>) => {
    nodes.push(`${n["Node Type"]}${n["Index Name"] ? ` (${n["Index Name"]})` : n["Relation Name"] ? ` (${n["Relation Name"]})` : ""}`);
    for (const c of (n.Plans as Record<string, unknown>[] | undefined) ?? []) walk(c);
  };
  walk(plan.Plan);
  return {
    executionMs: r1(plan["Execution Time"]),
    sharedHit: plan.Plan["Shared Hit Blocks"],
    sharedRead: plan.Plan["Shared Read Blocks"],
    seqScans: nodes.filter((n) => n.startsWith("Seq Scan")),
    nodes: [...new Set(nodes)],
    plan,
  };
}

export async function bench(pool: Pool, f: Fixture, runs: number) {
  const { q, log, reset } = recordingQ(pool);
  // Cold (first) load.
  reset();
  let t0 = performance.now();
  await loadDashboard(q, f.studyId);
  const cold = performance.now() - t0;
  const coldStmts = log.length;
  // Warm runs.
  const warm: number[] = [];
  let warmLog: Stmt[] = [];
  for (let i = 0; i < runs; i++) {
    reset();
    t0 = performance.now();
    await loadDashboard(q, f.studyId);
    warm.push(performance.now() - t0);
    warmLog = [...log];
  }
  const rows = warmLog.reduce((n, s) => n + s.rows, 0);
  const slowest = [...warmLog].sort((a, b) => b.ms - a.ms).slice(0, 4);
  // Fingerprint.
  const fp: number[] = [];
  for (let i = 0; i < runs; i++) {
    reset();
    t0 = performance.now();
    await dashboardFingerprint(q, f.studyId);
    fp.push(performance.now() - t0);
  }
  const fpStmts = [...log];
  // Cold after append: 50 events to each of 3 active sessions, then one load.
  for (let i = 0; i < Math.min(3, f.active.length); i++) await appendEvents(pool, f, i, 50);
  reset();
  t0 = performance.now();
  await loadDashboard(q, f.studyId);
  const afterAppend = performance.now() - t0;
  const afterAppendRows = log.reduce((n, s) => n + s.rows, 0);
  // One 100-event ingest INSERT (database time, triggers included).
  const a = f.active[0];
  let ingest: unknown = null;
  if (a) {
    const ev = generateEvents(99, 100, f.concepts, f.sourceId, a.nextSeq, a.clientMs);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, seq, event_type_code, concept_id, metadata, app_build, content_version)
         SELECT gen_random_uuid(), 1, $1, $2, $3, $4, now(), seq, type, concept, meta, 'bench', $5
           FROM unnest($6::int[], $7::text[], $8::uuid[], $9::jsonb[]) AS u(seq, type, concept, meta)`,
        [f.studyId, a.participantId, a.sessionId, a.conditionId, f.snapshotLabel, ev.map((e) => e.seq), ev.map((e) => e.type), ev.map((e) => e.conceptId), ev.map((e) => JSON.stringify(e.metadata))],
      );
      const plan = (r.rows[0] as { "QUERY PLAN": [{ "Execution Time": number; Triggers?: { "Trigger Name": string; Time: number; Calls: number }[] }] })["QUERY PLAN"][0];
      ingest = { executionMs: r1(plan["Execution Time"]), triggers: (plan.Triggers ?? []).map((t) => ({ name: t["Trigger Name"], ms: r1(t.Time), calls: t.Calls })) };
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
  const plans = {
    dashboard: await Promise.all(slowest.map(async (s) => ({ text: s.text.replace(/\s+/g, " ").slice(0, 160), ms: r1(s.ms), rows: s.rows, explain: await explain(pool, s) }))),
    fingerprint: await Promise.all(fpStmts.map(async (s) => ({ text: s.text.replace(/\s+/g, " ").slice(0, 160), explain: await explain(pool, s), indexed: await explain(pool, s, true) }))),
  };
  const summary = {
    loadDashboard: { coldMs: r1(cold), warmMedianMs: r1(median(warm)), warmRunsMs: warm.map(r1), statements: warmLog.length, coldStatements: coldStmts, rowsTransferred: rows },
    coldAfterAppend: { ms: r1(afterAppend), rowsTransferred: afterAppendRows, appended: "3 sessions × 50 events" },
    fingerprint: { medianMs: r1(median(fp)), statements: fpStmts.length },
    slowestStatements: plans.dashboard.map((p) => ({ text: p.text, ms: p.ms, rows: p.rows, execMs: p.explain.executionMs, seqScans: p.explain.seqScans, nodes: p.explain.nodes })),
    fingerprintPlans: plans.fingerprint.map((p) => ({
      execMs: p.explain.executionMs,
      seqScans: p.explain.seqScans,
      nodes: p.explain.nodes,
      withoutSeqScan: { execMs: p.indexed.executionMs, seqScans: p.indexed.seqScans, nodes: p.indexed.nodes },
    })),
    ingestInsert100: ingest,
  };
  return { summary, plans };
}

/** Push path and request coalescing (needs the database's own URL for LISTEN). */
export async function benchLive(pool: Pool, f: Fixture, url: string, runs: number) {
  const notifier = new DashboardNotifier(url, { error: () => {}, warn: () => {} });
  try {
    if (!(await notifier.ready())) return { error: "LISTEN connection failed" };
    const coalescer = new DashboardCoalescer({
      fingerprint: (id) => dashboardFingerprint(pool, id),
      load: (id, fp) => loadDashboard(pool, id, { fingerprint: fp }),
      version: (id) => notifier.version(id),
    });
    // NOTIFY delivery: commit of a 20-event append → callback.
    const delivery: number[] = [];
    for (let i = 0; i < runs; i++) {
      let t0 = 0;
      const got = new Promise<number>((resolve) => {
        const off = notifier.subscribe(f.studyId, () => {
          off();
          resolve(performance.now() - t0);
        });
      });
      const a = f.active[0]!;
      const ev = generateEvents(5000 + i, 20, f.concepts, f.sourceId, a.nextSeq, a.clientMs);
      t0 = performance.now();
      await pool.query(
        `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, seq, event_type_code, concept_id, metadata, app_build, content_version)
         SELECT gen_random_uuid(), 1, $1, $2, $3, $4, now(), seq, type, concept, meta, 'bench', $5
           FROM unnest($6::int[], $7::text[], $8::uuid[], $9::jsonb[]) AS u(seq, type, concept, meta)`,
        [f.studyId, a.participantId, a.sessionId, a.conditionId, f.snapshotLabel, ev.map((e) => e.seq), ev.map((e) => e.type), ev.map((e) => e.conceptId), ev.map((e) => JSON.stringify(e.metadata))],
      );
      a.nextSeq += 20;
      a.clientMs = ev[ev.length - 1]!.clientMs + 1000;
      delivery.push(await got);
    }
    await new Promise((r) => setTimeout(r, 100));
    await coalescer.get(f.studyId); // computed (after the appends)
    const hits: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      const s = await coalescer.get(f.studyId);
      if (s.source === "memo") hits.push(performance.now() - t0);
    }
    // 10 concurrent viewers right after a change.
    await appendEvents(pool, f, 1, 50);
    await new Promise((r) => setTimeout(r, 100));
    const before = coalescer.computations;
    const t0 = performance.now();
    const served = await Promise.all(Array.from({ length: 10 }, () => coalescer.get(f.studyId)));
    const concurrentMs = performance.now() - t0;
    return {
      notifyDeliveryMedianMs: r1(median(delivery)),
      memoHitMedianMs: hits.length ? r1(median(hits)) : null,
      memoHits: `${hits.length}/${runs}`,
      tenViewersAfterChange: { wallMs: r1(concurrentMs), computations: coalescer.computations - before, sources: served.map((x) => x.source).sort().join(",") },
    };
  } finally {
    await notifier.close();
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      sessions: { type: "string", default: "100" },
      events: { type: "string", default: "3000" },
      active: { type: "string", default: "5" },
      runs: { type: "string", default: "5" },
      out: { type: "string" },
      keep: { type: "boolean", default: false },
    },
  });
  const t = await createTestDatabase("bench");
  try {
    const t0 = performance.now();
    const f = await buildDashboardFixture(t.pool, { sessions: Number(values.sessions), eventsPerSession: Number(values.events), activeSessions: Number(values.active) });
    const fixtureMs = performance.now() - t0;
    const { summary, plans } = await bench(t.pool, f, Number(values.runs));
    const u = new URL(TEST_URL!);
    u.pathname = `/${t.name}`;
    const live = await benchLive(t.pool, f, u.toString(), Number(values.runs));
    const out = { fixture: { sessions: Number(values.sessions), eventsPerSession: Number(values.events), activeSessions: Number(values.active), events: f.events, buildSeconds: r1(fixtureMs / 1000) }, ...summary, live };
    console.log(JSON.stringify(out, null, 2));
    if (values.out) writeFileSync(values.out, JSON.stringify({ ...out, plans }, null, 2));
  } finally {
    if (values.keep) console.error(`kept database ${t.name}`);
    else await t.drop();
  }
}

if (process.argv[1] && /bench-dashboard\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
