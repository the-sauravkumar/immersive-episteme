import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pgLearningContextData, recordLearningEnded, resolveLearningContext } from "../../src/server/learning/context-data";
import { stageTemplateSha256 } from "../../src/server/study/stage-templates";
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

describe.skipIf(!TEST_URL)("learning clock and outcome separation", () => {
  let t: TestDb;
  let snapshotId: string;
  let manifestId: string;
  let n = 0;

  beforeAll(async () => {
    t = await createTestDatabase("clock");
    const curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "clk", acceptBy: curator });
    snapshotId = await createSnapshot(t.pool, { label: "v-clock", createdBy: curator });
    await addSnapshotItem(t.pool, snapshotId, "concept", g.conceptIds[0]);
    await publishSnapshot(t.pool, snapshotId, curator);
    manifestId = await createPublishedManifest(t.pool, snapshotId, { by: curator });
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  async function study(exposure: Record<string, unknown>) {
    n++;
    const s = await createStudy(t.pool, { slug: `clock-${n}`, snapshotId, manifestId });
    await t.pool.query("UPDATE studies SET config = $2::jsonb WHERE id = $1", [s.studyId, JSON.stringify({ exposure })]);
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [s.studyId]);
    const a = await createSession(t.pool, s.studyId, s.conditionIds.c2d, `C${n}-2D01`, 0);
    const b = await createSession(t.pool, s.studyId, s.conditionIds.c3d, `C${n}-3D01`, 1);
    return { a, b };
  }
  const ctxFor = (sess: { participantId: string; sessionId: string }, condition: "2d" | "immersive") =>
    resolveLearningContext({ kind: "participant", experimental: true, condition, participantId: sess.participantId, sessionId: sess.sessionId }, { data: pgLearningContextData(t.pool), appBuild: "test" });
  const clockOf = async (sessionId: string) => {
    const row = await one<{ started_at: Date | null; budget_seconds: number | null; ends_at: Date | null; ended_at: Date | null }>(
      t.pool,
      "SELECT learning_started_at AS started_at, learning_budget_seconds AS budget_seconds, learning_ends_at AS ends_at, learning_ended_at AS ended_at FROM study_sessions WHERE id = $1",
      [sessionId],
    );
    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    return { startedAt: iso(row.started_at), budgetSeconds: row.budget_seconds, endsAt: iso(row.ends_at), endedAt: iso(row.ended_at) };
  };

  it("gives both conditions the same server-stamped budget, set once", async () => {
    const { a, b } = await study({ minutes: 20 });
    await ctxFor(a, "2d");
    await ctxFor(b, "immersive");
    for (const sessionId of [a.sessionId, b.sessionId]) {
      const c = await clockOf(sessionId);
      expect(c).toMatchObject({ budgetSeconds: 1200, endedAt: null });
      expect(Date.parse(c.endsAt!) - Date.parse(c.startedAt!)).toBe(1_200_000);
    }
    const first = (await clockOf(a.sessionId)).startedAt;
    await ctxFor(a, "2d");
    expect((await clockOf(a.sessionId)).startedAt).toBe(first);
    await expect(t.pool.query("UPDATE study_sessions SET learning_started_at = now() - interval '1 hour' WHERE id = $1", [a.sessionId])).rejects.toThrow(/set once/);
    await expect(t.pool.query("UPDATE study_sessions SET learning_budget_seconds = 99999 WHERE id = $1", [a.sessionId])).rejects.toThrow(/set once/);
  });

  it("records the hash of the stage templates served when learning starts, once", async () => {
    const { a } = await study({ minutes: 20 });
    await ctxFor(a, "2d");
    const row = await one<{ template_sha256: string | null }>(t.pool, "SELECT template_sha256 FROM study_sessions WHERE id = $1", [a.sessionId]);
    expect(row.template_sha256).toBe(await stageTemplateSha256());
    await expect(t.pool.query("UPDATE study_sessions SET template_sha256 = $2 WHERE id = $1", [a.sessionId, "0".repeat(64)])).rejects.toThrow(/set once/);
  });

  it("records the end of learning once, before the cap", async () => {
    const capped = await study({ minutes: 20 });
    await ctxFor(capped.a, "2d");
    const ended = await recordLearningEnded(t.pool, capped.a.sessionId);
    expect(ended.endedAt).not.toBeNull();
    expect(Date.parse(ended.endedAt!)).toBeLessThan(Date.parse(ended.endsAt!));
    await ctxFor(capped.a, "2d");
    expect((await clockOf(capped.a.sessionId)).endedAt).toBe(ended.endedAt);
    await expect(t.pool.query("UPDATE study_sessions SET learning_ended_at = now() WHERE id = $1", [capped.a.sessionId])).rejects.toThrow(/set once/);
  });

  it("gives a study without a cap no budget", async () => {
    const { a } = await study({});
    await ctxFor(a, "2d");
    const c = await clockOf(a.sessionId);
    expect(c).toMatchObject({ budgetSeconds: null, endsAt: null });
    expect(c.startedAt).not.toBeNull();
  });

  it("keeps exposure, navigation, pause and citation timings out of every learning-outcome table", async () => {
    const outcome = [
      "assessments", "study_assessments", "assessment_items", "responses", "scoring_rubrics", "reference_maps",
      "reference_map_edges", "reference_map_raters", "concept_maps", "concept_map_edges", "concept_map_revisions", "derived_scores",
    ];
    const cols = await t.pool.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [outcome],
    );
    expect(new Set(cols.rows.map((r) => r.table_name)).size).toBe(outcome.length);
    const timing = cols.rows.filter((r) => /(exposure|navigation|pause|dwell|learning_|active_ms|budget|citation_(open|clos|count|ms))/.test(r.column_name));
    expect(timing).toEqual([]);
    const c = await one<{ def: string }>(t.pool, "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'derived_scores_no_timing_ck'");
    expect(c.def).toMatch(/exposure/);
  });
});
