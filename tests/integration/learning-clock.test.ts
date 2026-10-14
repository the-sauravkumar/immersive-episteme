/**
 * Integration: the server-side learning time budget (migration 0009) through the learning
 * context, and the rule that timing data never sits in learning-outcome tables.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LearningFinishRefusedError, pgLearningContextData, recordLearningEnded, resolveLearningContext } from "../../src/server/learning/context-data";
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

  /** Active study with `exposure` config and one 2D + one 3D session. */
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

  it("gives both conditions the same server-stamped budget, set once", async () => {
    const { a, b } = await study({ mode: "fixed_time", minutes: 20 });
    const c2d = await ctxFor(a, "2d");
    const c3d = await ctxFor(b, "immersive");
    for (const c of [c2d, c3d]) {
      expect(c.learningTime).toMatchObject({ mode: "fixed_time", budgetSeconds: 1200, allowEarlyFinish: false, persisted: true, endedAt: null });
      expect(Date.parse(c.learningTime.endsAt!) - Date.parse(c.learningTime.startedAt!)).toBe(1_200_000);
    }
    const again = await ctxFor(a, "2d");
    expect(again.learningTime.startedAt).toBe(c2d.learningTime.startedAt);
    await expect(t.pool.query("UPDATE study_sessions SET learning_started_at = now() - interval '1 hour' WHERE id = $1", [a.sessionId])).rejects.toThrow(/set once/);
    await expect(t.pool.query("UPDATE study_sessions SET learning_budget_seconds = 99999 WHERE id = $1", [a.sessionId])).rejects.toThrow(/set once/);
  });

  it("refuses an early finish unless the study allows it, and records the end once", async () => {
    const strict = await study({ mode: "fixed_time", minutes: 20 });
    await ctxFor(strict.a, "2d");
    await expect(recordLearningEnded(t.pool, strict.a.sessionId)).rejects.toBeInstanceOf(LearningFinishRefusedError);

    const lenient = await study({ mode: "fixed_time", minutes: 20, allowEarlyFinish: true });
    await ctxFor(lenient.a, "2d");
    const ended = await recordLearningEnded(t.pool, lenient.a.sessionId);
    expect(ended.endedAt).not.toBeNull();
    const ctx = await ctxFor(lenient.a, "2d");
    expect(ctx.learningTime.endedAt).toBe(ended.endedAt);
    await expect(t.pool.query("UPDATE study_sessions SET learning_ended_at = now() WHERE id = $1", [lenient.a.sessionId])).rejects.toThrow(/set once/);
  });

  it("self-paced studies have no budget; fixed_time needs minutes", async () => {
    const { a } = await study({ mode: "self_paced" });
    const ctx = await ctxFor(a, "2d");
    expect(ctx.learningTime).toMatchObject({ mode: "self_paced", budgetSeconds: null, endsAt: null });
    expect(ctx.learningTime.startedAt).not.toBeNull();
    const bad = await study({ mode: "fixed_time" });
    await expect(t.pool.query("UPDATE study_sessions SET learning_started_at = now() WHERE id = $1", [bad.a.sessionId])).rejects.toThrow(/exposure.minutes/);
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
    // (assessments.instrument_citation is the bibliographic reference of an instrument, not a timing.)
    const timing = cols.rows.filter((r) => /(exposure|navigation|pause|dwell|learning_|active_ms|budget|citation_(open|clos|count|ms))/.test(r.column_name));
    expect(timing).toEqual([]);
    // And no timing metric can be stored as a learning-outcome score.
    const c = await one<{ def: string }>(t.pool, "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'derived_scores_no_timing_ck'");
    expect(c.def).toMatch(/exposure/);
  });
});
