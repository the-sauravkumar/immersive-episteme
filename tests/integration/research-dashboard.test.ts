/**
 * Integration: the research dashboard (/research/dashboard) against a throwaway database.
 * Seeds sessions in both conditions with concept-map scores, a knowledge test, questionnaire
 * answers, telemetry and data-quality anomalies, then checks the dashboard numbers against
 * hand-computed values, the CSV content, live change detection, and the permission checks of
 * the CSV and live-probe route handlers (real authorizeRequest; only the session lookup is
 * stubbed).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as CsvRoute from "../../src/app/(research)/research/dashboard/csv/route";
import type * as ProbeRoute from "../../src/app/api/research/dashboard/route";
import { canAny } from "../../src/lib/permissions/can";
import { consoleRoute } from "../../src/lib/permissions/console-routes";
import type { StaffRole } from "../../src/lib/permissions/roles";
import { outcomeDistributions } from "../../src/server/research/analytics";
import { dashboardFingerprint, loadDashboard, type DashboardData, type MeasureRow } from "../../src/server/research/dashboard";
import { parseCsv } from "../../src/server/research/exports/csv";
import { excludeSession } from "../../src/server/research/sessions";
import { TEST_URL, addSnapshotItem, createPublishedManifest, createRealGraph, createSession, createSnapshot, createStudy, createTestDatabase, createUser, one, publishSnapshot, type TestDb } from "./schema-harness";

const auth = vi.hoisted(() => ({ roles: [] as string[], pool: null as unknown }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/server/auth/index", () => ({
  getAuth: () => ({ api: { getSession: async () => (auth.roles.length ? { user: { id: "u-test", email: "t@example.test", name: "T", disabledAt: null }, session: { id: "s-test" } } : null) } }),
}));
vi.mock("@/server/auth/roles-repository", () => ({ loadUserRoles: async () => auth.roles }));
vi.mock("@/server/db/client", () => ({ getPool: () => auth.pool, getDb: () => null }));

describe.skipIf(!TEST_URL)("research dashboard", () => {
  let t: TestDb;
  let studyId: string;
  let emptyStudyId: string;
  let c2d: string;
  let c3d: string;
  let concepts: [string, string];
  const s: Record<string, { participantId: string; sessionId: string }> = {};
  let data: DashboardData;

  const event = (who: string, cond: string, seq: number, type: string, metadata: Record<string, unknown> = {}, conceptId: string | null = null) =>
    t.pool.query(
      `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, seq, event_type_code, concept_id, metadata, app_build, content_version)
       VALUES ($1, 1, $2, $3, $4, $5, now(), $6, $7, $8, $9, 'test-build', 'dash-1')`,
      [randomUUID(), studyId, s[who]!.participantId, s[who]!.sessionId, cond, seq, type, conceptId, JSON.stringify(metadata)],
    );

  beforeAll(async () => {
    t = await createTestDatabase("dashboard");
    auth.pool = t.pool;
    const curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "dash", acceptBy: curator });
    concepts = g.conceptIds;
    const snap = await createSnapshot(t.pool, { label: "dash-1", createdBy: curator });
    for (const c of concepts) await addSnapshotItem(t.pool, snap, "concept", c);
    await publishSnapshot(t.pool, snap, curator);
    const manifestId = await createPublishedManifest(t.pool, snap, { by: curator });
    const st = await createStudy(t.pool, { slug: "dash-study", snapshotId: snap, manifestId });
    studyId = st.studyId;
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
    ({ c2d, c3d } = st.conditionIds);
    emptyStudyId = (await createStudy(t.pool, { slug: "demo-dash-empty", isDemo: true })).studyId;
    s.P01 = await createSession(t.pool, studyId, c2d, "P01", 0);
    s.P02 = await createSession(t.pool, studyId, c2d, "P02", 1);
    s.P03 = await createSession(t.pool, studyId, c3d, "P03", 2);
    s.P04 = await createSession(t.pool, studyId, c3d, "P04", 3);
    await t.pool.query("UPDATE participants SET stratum = 'low' WHERE code IN ('P01', 'P03') AND study_id = $1", [studyId]);

    // Concept maps (pre, post) with stored cmap.recall.dl scores.
    const map = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ('dash-map', 1, 'reconstruction', 'Map') RETURNING id");
    const item = await one<{ id: string }>(
      t.pool,
      "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, 'map', 0, 'concept_map', 'Connect', $2) RETURNING id",
      [map.id, JSON.stringify({ kind: "concept_map", conceptKeys: [], allowFreeNodes: false, relationshipTypes: [], directed: true })],
    );
    const scores: [string, "pre" | "post", number, number][] = [
      ["P01", "pre", 0.2, 0],
      ["P01", "post", 0.6, 2],
      ["P02", "pre", 0.4, 0],
      ["P02", "post", 0.5, 0],
      ["P03", "pre", 0.1, 0],
      ["P03", "post", 0.7, 0],
      ["P04", "pre", 0, 0],
      ["P04", "post", 1, 0],
    ];
    for (const [who, phase, value, edges] of scores) {
      const m = await one<{ id: string }>(
        t.pool,
        "INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, started_at) VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id",
        [s[who]!.sessionId, s[who]!.participantId, map.id, item.id, phase, JSON.stringify([{ key: "n1", conceptId: concepts[0], label: "A", x: 0, y: 0 }, { key: "n2", conceptId: concepts[1], label: "B", x: 1, y: 0 }])],
      );
      for (let e = 0; e < edges; e++) {
        await t.pool.query(
          "INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key, source_concept_id, target_concept_id, relationship_type_code, directed) VALUES ($1, $2, 'n1', 'n2', $3, $4, 'PRECEDES', true)",
          [m.id, `e${e}`, concepts[0], concepts[1]],
        );
      }
      await t.pool.query("UPDATE concept_maps SET is_final = true, submitted_at = now(), revision = 2 WHERE id = $1", [m.id]);
      await t.pool.query(
        "INSERT INTO derived_scores (session_id, participant_id, assessment_id, concept_map_id, metric_name, metric_version, value, pipeline_version) VALUES ($1, $2, $3, $4, 'cmap.recall.dl', '1.0.0', $5, 'test')",
        [s[who]!.sessionId, s[who]!.participantId, map.id, m.id, value],
      );
    }

    // Knowledge pre-test totals.
    const kt = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ('dash-kt', 1, 'pretest', 'Pre-test') RETURNING id");
    for (const [who, v] of [["P01", 3], ["P02", 5]] as const) {
      await t.pool.query(
        "INSERT INTO derived_scores (session_id, participant_id, assessment_id, metric_name, metric_version, value, pipeline_version) VALUES ($1, $2, $3, 'assessment.key_match_total', '1.0.0', $4, 'test')",
        [s[who]!.sessionId, s[who]!.participantId, kt.id, v],
      );
    }

    // Questionnaires: SUS (P01 all 3 → 50; P03 5/1 alternating → 100) and SSQ pre/post for P01
    // (all 0 → 0; all 1 → each Kennedy column sums to 7, TS = 21 × 3.74 = 78.54).
    const instrument = async (code: string, keys: string[]) => {
      const a = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ($1, 2, 'questionnaire', $1) RETURNING id", [code]);
      const ids: Record<string, string> = {};
      for (const [i, k] of keys.entries()) {
        ids[k] = (await one<{ id: string }>(t.pool, "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, $2, $3, 'likert', $2, '{}') RETURNING id", [a.id, k, i])).id;
      }
      return { id: a.id, ids };
    };
    const answer = async (who: string, ins: { id: string; ids: Record<string, string> }, attempt: number, values: number[]) => {
      for (const [i, itemId] of Object.values(ins.ids).entries()) {
        await t.pool.query(
          "INSERT INTO responses (session_id, participant_id, assessment_id, item_id, attempt, status, raw, presented_at, answered_at) VALUES ($1, $2, $3, $4, $5, 'answered', $6, now(), now())",
          [s[who]!.sessionId, s[who]!.participantId, ins.id, itemId, attempt, JSON.stringify({ value: values[i], itemKind: "likert", assessmentVersion: 2 })],
        );
      }
    };
    const sus = await instrument("sus", Array.from({ length: 10 }, (_, i) => `sus.${i + 1}`));
    await answer("P01", sus, 1, Array(10).fill(3));
    await answer("P03", sus, 1, [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]);
    const ssq = await instrument("ssq", Array.from({ length: 16 }, (_, i) => `ssq.${i + 1}`));
    await answer("P01", ssq, 1, Array(16).fill(0));
    await answer("P01", ssq, 2, Array(16).fill(1));

    // Telemetry. P01: 1 min exposure, 0.5 min navigation, 0.1 min paused, 1 concept, one each of relationship / citation / guidance.
    const [a, b] = concepts;
    await event("P01", c2d, 0, "exposure_started", { intervalId: "i1", layer: "overview", startMonoMs: 0 }, a);
    await event("P01", c2d, 1, "exposure_ended", { intervalId: "i1", layer: "overview", startMonoMs: 0, endMonoMs: 66000, activeMs: 60000, pausedMs: 6000, reason: "switched" }, a);
    await event("P01", c2d, 2, "navigation_started", { intervalId: "n1", startMonoMs: 66000 });
    await event("P01", c2d, 5, "navigation_ended", { intervalId: "n1", startMonoMs: 66000, endMonoMs: 96000, activeMs: 30000, pausedMs: 0, reason: "content" });
    await event("P01", c2d, 6, "timing_resumed", { pausedMs: 6000 });
    await event("P01", c2d, 7, "citation_opened", { sourceId: g.sourceId, claimIndex: 0 }, a);
    await event("P01", c2d, 8, "relationship_followed", { relationshipId: g.relationshipId });
    await event("P01", c2d, 9, "guidance_cue_used", { action: "followed" });
    // P03: 2 min exposure on a, then b shown with no end event (unterminated, not guessed), a WebGL context loss.
    await event("P03", c3d, 0, "exposure_started", { intervalId: "j1", layer: "overview", startMonoMs: 0 }, a);
    await event("P03", c3d, 1, "exposure_ended", { intervalId: "j1", layer: "overview", startMonoMs: 0, endMonoMs: 120000, activeMs: 120000, pausedMs: 0, reason: "closed" }, a);
    await event("P03", c3d, 2, "exposure_started", { intervalId: "j2", layer: "overview", startMonoMs: 120000 }, b);
    await event("P03", c3d, 3, "webgl_context_lost", {});

    // Data quality: an open gap (seq 3–4 of P01), a seq_conflict quarantine (P03), P02 interrupted twice,
    // P03's device check asked for a retry, P04 excluded.
    await t.pool.query("INSERT INTO sequence_gaps (session_id, kind, from_seq, to_seq) VALUES ($1, 'gap', 3, 4)", [s.P01!.sessionId]);
    await t.pool.query("INSERT INTO telemetry_quarantine (session_id, reason, raw) VALUES ($1, 'seq_conflict: seq 2 is already used by another event of this session', '{}')", [s.P03!.sessionId]);
    await t.pool.query("UPDATE study_sessions SET interrupted = true, interruption_count = 2 WHERE id = $1", [s.P02!.sessionId]);
    await t.pool.query(`UPDATE study_sessions SET device = '{"check": {"verdict": "webgl_retry"}}' WHERE id = $1`, [s.P03!.sessionId]);
    await excludeSession(t.pool, { userId: await createUser(t.pool) }, { sessionId: s.P04!.sessionId, category: "technical_failure", detail: "Renderer crashed twice" });

    data = (await loadDashboard(t.pool, studyId))!;
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  const cell = (rows: MeasureRow[], key: string, phase: string, cond: string) => rows.find((r) => r.key === key && r.phase === phase)!.byCondition.find((c) => c.conditionId === cond)!.stats;

  it("labels the study and its scope", () => {
    expect(data.study.nonExperimental).toBe(false);
    expect(data.sessionsTotal).toBe(4);
    expect(data.sessionsInScope).toBe(3);
  });

  it("the Analytics page keeps pre and post concept-map scores apart", async () => {
    const d = await outcomeDistributions(t.pool, studyId);
    const pre = d.find((x) => x.metricName === "cmap.recall.dl (pre)");
    const post = d.find((x) => x.metricName === "cmap.recall.dl (post)");
    expect(d.some((x) => x.metricName === "cmap.recall.dl")).toBe(false);
    expect([...(post!.byCondition[c2d] ?? [])].sort()).toEqual([0.5, 0.6]);
    expect(pre!.byCondition[c2d]).toHaveLength(2);
  });

  it("primary outcome: pre, post and change by condition, excluded session left out", () => {
    const post2d = cell(data.primary.summary, "cmap.recall.dl", "post", c2d);
    expect(post2d.n).toBe(2);
    expect(post2d.mean).toBeCloseTo(0.55, 10);
    expect(post2d.sd).toBeCloseTo(Math.sqrt(0.005), 10);
    const change2d = cell(data.primary.summary, "cmap.recall.dl.change", "change", c2d);
    expect(change2d.mean).toBeCloseTo(0.25, 10);
    expect(change2d.sd).toBeCloseTo(0.212132, 5);
    // 0.25 ± t(0.975, 1) · 0.212132 / √2 = 0.25 ± 12.706205 · 0.15
    expect(change2d.ciLow).toBeCloseTo(0.25 - 1.905931, 4);
    const post3d = cell(data.primary.summary, "cmap.recall.dl", "post", c3d);
    expect(post3d).toMatchObject({ n: 1, mean: 0.7, sd: null, ciLow: null });
    expect(data.primary.ancova.map((r) => [r.participantCode, r.conditionCode, r.stratum, r.pre, r.post])).toEqual([
      ["P01", "conventional", "low", 0.2, 0.6],
      ["P02", "conventional", null, 0.4, 0.5],
      ["P03", "immersive", "low", 0.1, 0.7],
    ]);
  });

  it("secondary edges drawn, knowledge test and questionnaire scales", () => {
    expect(cell(data.secondary, "cmap.edges_drawn", "post", c2d)).toMatchObject({ n: 2, mean: 1 });
    expect(cell(data.knowledge, "assessment.key_match_total", "pre", c2d)).toMatchObject({ n: 2, mean: 4 });
    expect(cell(data.questionnaires, "sus.score", "session", c2d)).toMatchObject({ n: 1, mean: 50 });
    expect(cell(data.questionnaires, "sus.score", "session", c3d)).toMatchObject({ n: 1, mean: 100 });
    expect(cell(data.questionnaires, "ssq.total", "pre", c2d).mean).toBe(0);
    expect(cell(data.questionnaires, "ssq.total", "post", c2d).mean).toBeCloseTo(78.54, 10);
  });

  it("telemetry and time per session and by condition", () => {
    const p1 = data.telemetry.sessions.find((r) => r.participantCode === "P01")!;
    expect(p1).toMatchObject({ events: 8, exposureMs: 60000, navigationMs: 30000, pauseMs: 6000, conceptsExposed: 1, coverage: 0.5, relationshipsFollowed: 1, citationOpens: 1, guidanceUses: 1 });
    const p3 = data.telemetry.sessions.find((r) => r.participantCode === "P03")!;
    expect(p3).toMatchObject({ events: 4, exposureMs: 120000, unterminated: 1, conceptsExposed: 2, coverage: 1 });
    expect(data.telemetry.scopeConcepts).toBe(2);
    // 2D: P01 1 min, P02 0 min → mean 0.5 min.
    expect(cell(data.telemetry.summary, "time.exposure_total_ms", "session", c2d).mean).toBeCloseTo(0.5, 10);
    expect(data.telemetry.sessions.some((r) => r.participantCode === "P04")).toBe(false);
  });

  it("data quality: gaps, quarantine by reason, interruptions, device failures, exclusions", () => {
    const q = data.quality;
    expect(q.sequence).toEqual([{ kind: "gap", open: 1, resolved: 0, missingSeq: 2 }]);
    expect(q.quarantine).toEqual([{ reason: "seq_conflict", n: 1, unresolved: 1 }]);
    expect(q.interruptedSessions).toBe(1);
    expect(q.interruptions).toBe(2);
    expect(q.deviceCheckNotPassed).toEqual([{ verdict: "webgl_retry", n: 1 }]);
    expect(q.webglContextLost).toBe(1);
    expect(q.excluded).toEqual([{ category: "technical_failure", n: 1 }]);
  });

  it("an empty study yields empty sections, not invented values", async () => {
    const empty = (await loadDashboard(t.pool, emptyStudyId))!;
    expect(empty.study.nonExperimental).toBe(true);
    expect(empty.primary.ancova).toEqual([]);
    expect(empty.primary.summary.every((m) => m.byCondition.every((c) => c.stats.n === 0 && c.stats.mean === null))).toBe(true);
    expect(empty.telemetry.summary).toEqual([]);
    expect(empty.secondary).toEqual([]);
  });

  it("detects new data live: the fingerprint changes when an event or a score arrives", async () => {
    const before = await dashboardFingerprint(t.pool, studyId);
    await event("P02", c2d, 0, "guidance_cue_used", { action: "dismissed" });
    const after = await dashboardFingerprint(t.pool, studyId);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(Date.parse(after.serverTime)).toBeGreaterThanOrEqual(Date.parse(before.serverTime));
    expect((await loadDashboard(t.pool, studyId))!.telemetry.sessions.find((r) => r.participantCode === "P02")!.guidanceUses).toBe(1);
  });

  describe("route handlers", () => {
    // Import (and compile) the route modules once, outside the per-test timeout: a cold import
    // under a loaded parallel run was the cause of an intermittent timeout here.
    let csvRoute: typeof CsvRoute;
    let probeRoute: typeof ProbeRoute;
    beforeAll(async () => {
      csvRoute = await import("../../src/app/(research)/research/dashboard/csv/route");
      probeRoute = await import("../../src/app/api/research/dashboard/route");
    }, 120_000);
    const csvGet = async (table: string, study = studyId) => csvRoute.GET(new Request(`http://localhost/research/dashboard/csv?study=${study}&table=${table}`));
    const probe = async () => probeRoute.GET(new Request(`http://localhost/api/research/dashboard?study=${studyId}`));
    const as = (roles: StaffRole[]) => {
      auth.roles = roles;
    };

    it("refuses a role without analytics.view (page route table, probe and CSV)", async () => {
      expect(canAny({ roles: ["study_facilitator"] }, consoleRoute("/research/dashboard").anyOf)).toBe(false);
      as(["study_facilitator"]);
      expect((await probe()).status).toBe(403);
      expect((await csvGet("dashboard_primary")).status).toBe(403);
      as([]);
      expect((await probe()).status).toBe(401);
    });

    it("lets platform_admin see the dashboard but not download CSV (no exports.create)", async () => {
      as(["platform_admin"]);
      const r = await probe();
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect(await r.json()).toMatchObject({ fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/) });
      expect((await csvGet("dashboard_primary")).status).toBe(403);
    });

    it("serves pseudonymised CSV with the metric versions in its first line", async () => {
      as(["researcher"]);
      const r = await csvGet("dashboard_primary_ancova");
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
      const text = await r.text();
      const [first, ...rest] = text.split("\r\n");
      expect(first).toMatch(/^# immersive-episteme dashboard table dashboard_primary_ancova; study=dash-study; non_experimental=false;/);
      expect(first).toContain("cmap.recall.dl@1.0.0");
      const parsed = parseCsv(rest.join("\r\n"));
      expect(parsed.columns).toEqual(["participant_code", "condition_code", "condition_interface", "stratum", "pre_cmap_recall_dl", "post_cmap_recall_dl", "change_cmap_recall_dl", "reference_map_ids"]);
      expect(parsed.rows.map((x) => [x.participant_code, x.pre_cmap_recall_dl, x.post_cmap_recall_dl])).toEqual([
        ["P01", "0.2", "0.6"],
        ["P02", "0.4", "0.5"],
        ["P03", "0.1", "0.7"],
      ]);
      expect(text).not.toMatch(/Renderer crashed/);
      const summary = parseCsv((await (await csvGet("dashboard_primary")).text()).split("\r\n").slice(1).join("\r\n"));
      const post2d = summary.rows.find((x) => x.phase === "post" && x.condition_code === "conventional")!;
      expect(post2d).toMatchObject({ metric: "cmap.recall.dl", metric_version: "1.0.0", role: "primary", n: "2", mean: "0.55" });
      expect((await csvGet("nope")).status).toBe(400);
      const audit = await t.pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action = 'export.dashboard_csv'");
      expect(audit.rows[0].n).toBe(2);
    });
  });
});
