/**
 * Integration: the study engine (src/server/study/engine.ts) against a throwaway database with
 * active studies: enrolment, consent, the condition-blind pre-allocation steps, allocation after
 * the pre-test with a stratum from the scored pre-test (D3), device check and WebGL policy,
 * questionnaire steps with condition filters and instrument checks (D7, D8), the learning end on
 * arrival at the hub, resume, withdrawal and completion.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestTelemetryBatch } from "../../src/server/telemetry/ingest";
import { auditAllocations } from "../../src/server/study/allocation";
import {
  StudyEngineError,
  allocateSession,
  completeOnboarding,
  completeSession,
  consentTextSha256,
  enrolParticipant,
  findEnrollableStudy,
  listStepAssessments,
  loadSessionState,
  openSessionAfterConsent,
  recordConsent,
  recordDeviceCheck,
  resumeSession,
  stepReadiness,
  submitAssessment,
  syncPosition,
  withdraw,
  type DeviceReport,
  type EnrollableStudy,
  type OpenedSession,
} from "../../src/server/study/engine";
import { INSTRUMENT_DEFINITIONS, seedInstrumentDefinitions } from "../../src/server/study/instruments";
import {
  TEST_URL,
  addSnapshotItem,
  createPublishedManifest,
  createRealGraph,
  createSnapshot,
  createStudy,
  createTestDatabase,
  createUser,
  one,
  publishSnapshot,
  type TestDb,
} from "./schema-harness";

const CONSENT = { version: "c-1.0", text: "Test consent text written for this test.\nSecond line." };
const BUILD = "test-build";
const report = (webgl: 1 | 2 | null, width = 1280, height = 800): DeviceReport => ({ viewport: { width, height }, webglVersion: webgl, inputDevices: ["keyboard", "mouse"] });
const POST = ["post_test", "transfer", "reconstruction"] as const;

describe.skipIf(!TEST_URL)("study engine", { timeout: 60_000 }, () => {
  let t: TestDb;
  let snapshotId: string;
  let manifestId: string;
  let curator: string;
  let conceptKeys: [string, string];
  let conceptIds: [string, string];
  let n = 0;
  const ids: Record<string, string> = {};

  async function assessment(code: string, kind: string, items: { key: string; kind: string; prompt: string; config: unknown; answerKey?: unknown }[], config: Record<string, unknown> = {}) {
    const a = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title, config) VALUES ($1, 1, $2, $3, $4::jsonb) RETURNING id", [code, kind, `Test ${code}`, JSON.stringify(config)]);
    for (const [i, it] of items.entries()) {
      const r = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config, answer_key) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) RETURNING id",
        [a.id, it.key, i, it.kind, it.prompt, JSON.stringify(it.config), it.answerKey === undefined ? null : JSON.stringify(it.answerKey)],
      );
      ids[`${code}:${it.key}`] = r.id;
    }
    await t.pool.query("UPDATE assessments SET status = 'locked', locked_at = now() WHERE id = $1", [a.id]);
    ids[code] = a.id;
    return a.id;
  }

  /** An active between-subjects study with the given battery ([code, phase]) and config. */
  async function activeStudy(config: Record<string, unknown>, battery: [string, "pre" | "post"][]): Promise<EnrollableStudy> {
    const slug = `study-${++n}`;
    const s = await createStudy(t.pool, { slug, snapshotId, manifestId });
    for (const [i, [code, phase]] of battery.entries()) {
      await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) SELECT $1, id, $2, $3 FROM assessments WHERE code = $4", [s.studyId, phase, i, code]);
    }
    await t.pool.query("UPDATE studies SET config = $2::jsonb, status = 'active' WHERE id = $1", [
      s.studyId,
      JSON.stringify({ traditionSlugs: ["se-tradition"], consent: CONSENT, allocation: { algorithm: "block", seed: `seed-${slug}` }, exposure: { mode: "self_paced" }, ...config }),
    ]);
    return findEnrollableStudy(t.pool, slug);
  }

  const BASIC: [string, "pre" | "post"][] = [["se-pre", "pre"], ["se-post", "post"], ["se-recon", "post"], ["se-transfer", "post"]];
  const BASIC_STEPS = ["pre_test", "onboarding", "learning", ...POST];

  async function consented(study: EnrollableStudy): Promise<OpenedSession> {
    const p = await enrolParticipant(t.pool, study);
    await recordConsent(t.pool, { participantId: p.participantId, study, decision: "granted", shownVersion: CONSENT.version });
    return openSessionAfterConsent(t.pool, { participantId: p.participantId, studyId: study.id, appBuild: BUILD });
  }
  const state = async (sessionId: string) => (await loadSessionState(t.pool, sessionId))!;
  const position = async (sessionId: string, arrivedAtHub = false) => syncPosition(t.pool, await state(sessionId), { arrivedAtHub });
  const pre = (sessionId: string, values: Record<string, string[]> = {}) => submitAssessment(t.pool, { sessionId, step: "pre_test", assessmentId: ids["se-pre"]!, values });
  /** Pre-test, allocation, device check: returns the allocated session. */
  async function allocated(study: EnrollableStudy, preValues: Record<string, string[]> = {}): Promise<OpenedSession & { condition: "2d" | "immersive" }> {
    const s = await consented(study);
    await pre(s.sessionId, preValues);
    const a = await allocateSession(t.pool, s.sessionId);
    return { ...s, condition: a.condition, conditionId: a.conditionId };
  }

  beforeAll(async () => {
    t = await createTestDatabase("study");
    curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "se", acceptBy: curator });
    conceptIds = g.conceptIds;
    conceptKeys = ["se.process_stage.step-1", "se.process_stage.step-2"];
    snapshotId = await createSnapshot(t.pool, { label: "v-study", createdBy: curator });
    await addSnapshotItem(t.pool, snapshotId, "concept", g.conceptIds[0]);
    await publishSnapshot(t.pool, snapshotId, curator);
    manifestId = await createPublishedManifest(t.pool, snapshotId, { by: curator });
    const choice = (id: string) => ({ id, label: `Option ${id}` });
    await assessment("se-pre", "pretest", [
      { key: "q1", kind: "single_choice", prompt: "Pick b", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "b" } },
      { key: "q2", kind: "multiple_choice", prompt: "Pick a and c", config: { kind: "multiple_choice", options: [choice("a"), choice("b"), choice("c")] }, answerKey: { optionIds: ["c", "a"] } },
      { key: "q3", kind: "short_text", prompt: "Type x", config: { kind: "short_text" } },
      { key: "why", kind: "long_text", prompt: "Why?", config: { kind: "long_text" } },
    ]);
    await assessment("se-pre-nokey", "pretest", [{ key: "q1", kind: "short_text", prompt: "Anything", config: { kind: "short_text" } }]);
    await assessment("se-post", "posttest", [{ key: "q1", kind: "single_choice", prompt: "Pick a", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "a" } }]);
    const mapItem = { key: "map", kind: "concept_map", prompt: "Connect", config: { kind: "concept_map", conceptKeys, relationshipTypes: ["PRECEDES"], directed: true } };
    await assessment("se-recon", "reconstruction", [mapItem]);
    await assessment("se-premap", "reconstruction", [mapItem]);
    await assessment("se-premap-noref", "reconstruction", [mapItem]);
    await assessment("se-transfer", "transfer", [{ key: "why", kind: "long_text", prompt: "Explain why", config: { kind: "long_text" } }]);
    const likert = (key: string) => ({ key, kind: "likert", prompt: `Rate ${key}`, config: { kind: "likert", points: 5, anchors: {} } });
    await assessment("se-q-pre", "questionnaire", [likert("a")]);
    await assessment("se-q-load", "questionnaire", [likert("b")]);
    // Limited to the immersive condition by its definition; items carry their source wording.
    await assessment(
      "se-q-presence",
      "questionnaire",
      [{ key: "c", kind: "likert", prompt: "Rate c", config: { kind: "likert", points: 5, anchors: {}, provenance: { original: "Rate c" } } }],
      { instrument: { conditions: ["immersive"], pendingItems: [] } },
    );
    await assessment("se-q-end", "questionnaire", [likert("d")]);
    // Locked (finalised) reference map for the pre-test map: step-1 PRECEDES step-2, expected.
    const ref = await one<{ id: string }>(
      t.pool,
      `INSERT INTO reference_maps (assessment_id, version, title, nodes, status, adjudicated_by, adjudicated_at)
       VALUES ($1, 1, 'Reference', $2::jsonb, 'adjudicated', $3, now()) RETURNING id`,
      [ids["se-premap"], JSON.stringify(conceptIds.map((c) => ({ conceptId: c, label: c }))), curator],
    );
    await t.pool.query(
      "INSERT INTO reference_map_edges (reference_map_id, source_concept_id, target_concept_id, relationship_type_code, directed, required) VALUES ($1, $2, $3, 'PRECEDES', true, true)",
      [ref.id, conceptIds[0], conceptIds[1]],
    );
    await t.pool.query("UPDATE reference_maps SET status = 'locked' WHERE id = $1", [ref.id]);
    await seedInstrumentDefinitions(t.pool);
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  /** Saves a final pre-test map: with or without the expected PRECEDES edge. */
  async function finalPreMap(s: OpenedSession, assessmentCode: string, withEdge: boolean) {
    const nodes = conceptIds.map((c, i) => ({ key: `n${i}`, conceptId: c, label: `c${i}`, x: 0, y: 0 }));
    const m = await one<{ id: string }>(
      t.pool,
      `INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, raw) VALUES ($1, $2, $3, $4, 'pre', $5::jsonb, '{}') RETURNING id`,
      [s.sessionId, s.participantId, ids[assessmentCode], ids[`${assessmentCode}:map`], JSON.stringify(nodes)],
    );
    if (withEdge) {
      await t.pool.query("INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key, source_concept_id, target_concept_id, relationship_type_code, directed) VALUES ($1, 'e1', 'n0', 'n1', $2, $3, 'PRECEDES', true)", [m.id, conceptIds[0], conceptIds[1]]);
    }
    await t.pool.query("UPDATE concept_maps SET is_final = true, submitted_at = now() WHERE id = $1", [m.id]);
  }

  it("refuses unknown, inactive and unconfigured studies", async () => {
    await expect(findEnrollableStudy(t.pool, "no-such-study")).rejects.toMatchObject({ code: "study_not_found" });
    await createStudy(t.pool, { slug: "draft-one", snapshotId, manifestId });
    await expect(findEnrollableStudy(t.pool, "Draft-One ")).rejects.toMatchObject({ code: "study_not_open" });
    const s = await createStudy(t.pool, { slug: "no-consent", snapshotId, manifestId });
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [s.studyId]);
    await expect(findEnrollableStudy(t.pool, "no-consent")).rejects.toMatchObject({ code: "study_misconfigured" });
  });

  it("takes the pre-test blind to condition, then allocates (D3) and records the allocation", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS }, BASIC);
    const p = await enrolParticipant(t.pool, study);
    expect(p.code).toMatch(/^P-[0-9A-HJKMNP-TV-Z]{10}$/);
    await expect(openSessionAfterConsent(t.pool, { participantId: p.participantId, studyId: study.id, appBuild: BUILD })).rejects.toMatchObject({ code: "consent_required" });
    await recordConsent(t.pool, { participantId: p.participantId, study, decision: "granted", shownVersion: CONSENT.version });
    const c = await one<{ consent_text_sha256: string }>(t.pool, "SELECT consent_text_sha256 FROM consent_records WHERE participant_id = $1", [p.participantId]);
    expect(c.consent_text_sha256).toBe(consentTextSha256(CONSENT.text));

    const s = await openSessionAfterConsent(t.pool, { participantId: p.participantId, studyId: study.id, appBuild: BUILD });
    expect(s).toMatchObject({ condition: null, conditionId: null, created: true });
    expect(await one(t.pool, "SELECT condition_id, allocation_id, status FROM study_sessions WHERE id = $1", [s.sessionId])).toEqual({ condition_id: null, allocation_id: null, status: "in_progress" });
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM allocations WHERE participant_id = $1", [p.participantId])).n).toBe(0);
    expect(await position(s.sessionId)).toMatchObject({ kind: "step", step: "pre_test" });
    // No device check and no allocation before the blind steps are done.
    await expect(recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD })).rejects.toMatchObject({ code: "not_allocated" });
    await expect(allocateSession(t.pool, s.sessionId)).rejects.toMatchObject({ code: "not_current_step" });
    // An unallocated session cannot store telemetry (events carry a condition).
    const tel = await ingestTelemetryBatch(t.pool, { kind: "participant", participantId: s.participantId, sessionId: s.sessionId }, {
      idempotencyKey: `b:${s.sessionId}:0-0`, sessionId: s.sessionId, schemaVersion: 1, appBuild: BUILD, contentVersion: "v-study", clientSentAt: new Date().toISOString(),
      events: [{ eventId: randomUUID(), schemaVersion: 1, sessionId: s.sessionId, seq: 0, type: "page_entered", clientTs: new Date().toISOString(), metadata: {} }],
    });
    expect(tel).toMatchObject({ status: 403 });

    const r = await pre(s.sessionId, { [ids["se-pre:q1"]!]: ["b"], [ids["se-pre:q2"]!]: ["a", "b"], [ids["se-pre:why"]!]: ["Because."] });
    expect(r).toEqual({ answered: 3, skipped: 1, scored: 2, correct: 1, stepCompleted: true });
    const raw = await one<{ raw: unknown }>(t.pool, "SELECT raw FROM responses WHERE item_id = $1 AND session_id = $2", [ids["se-pre:q2"], s.sessionId]);
    expect(raw.raw).toEqual({ value: ["a", "b"], itemKind: "multiple_choice", assessmentVersion: 1 });
    const scores = await t.pool.query<{ metric_name: string; value: number }>("SELECT metric_name, value FROM derived_scores WHERE session_id = $1", [s.sessionId]);
    expect(scores.rows.map((x) => `${x.metric_name}:${x.value}`).sort()).toEqual(["assessment.key_match_total:1", "item.key_match:0", "item.key_match:1"]);
    expect(await position(s.sessionId)).toEqual({ kind: "allocation" });

    const a = await allocateSession(t.pool, s.sessionId);
    expect(a.created).toBe(true);
    expect(await allocateSession(t.pool, s.sessionId)).toMatchObject({ created: false, condition: a.condition });
    const alloc = await one<{ algorithm: string; seed: string; sequence_index: number; stratum: string | null; study_protocol_version: string }>(
      t.pool,
      "SELECT algorithm, seed, sequence_index, stratum, study_protocol_version FROM allocations WHERE participant_id = $1",
      [p.participantId],
    );
    expect(alloc).toEqual({ algorithm: "block", seed: `seed-${study.slug}`, sequence_index: 0, stratum: null, study_protocol_version: "p1" });
    const ss = await one<{ condition_id: string; allocation_id: string }>(t.pool, "SELECT condition_id, allocation_id FROM study_sessions WHERE id = $1", [s.sessionId]);
    expect(ss.condition_id).toBe(a.conditionId);
    // The allocation is attached once: it can never change afterwards.
    const other = await one<{ id: string }>(t.pool, "SELECT id FROM study_conditions WHERE study_id = $1 AND id <> $2", [study.id, a.conditionId]);
    await expect(t.pool.query("UPDATE study_sessions SET condition_id = $2 WHERE id = $1", [s.sessionId, other.id])).rejects.toThrow(/immutable|allocation/);
    const j = (await state(s.sessionId)).journal.find((e) => e.action === "study.allocated")!;
    expect(j.after).toMatchObject({ allocationPoint: "after_pre_test", sequenceIndex: 0, studyProtocolVersion: "p1" });
    expect(await position(s.sessionId)).toEqual({ kind: "device_check" });
  });

  it("stratifies by the pre-test score (low ≤ cutoff < high) and records source, score and cutoff", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS, allocation: { algorithm: "stratified_block", seed: "s", stratifyBy: { source: "pre_test_score", cutoff: 1 } } }, BASIC);
    const high = await allocated(study, { [ids["se-pre:q1"]!]: ["b"], [ids["se-pre:q2"]!]: ["a", "c"] });
    const low = await allocated(study, { [ids["se-pre:q1"]!]: ["a"] });
    const strata = await t.pool.query<{ participant_id: string; stratum: string }>("SELECT participant_id, stratum FROM allocations WHERE study_id = $1", [study.id]);
    expect(Object.fromEntries(strata.rows.map((r) => [r.participant_id, r.stratum]))).toEqual({ [high.participantId]: "high", [low.participantId]: "low" });
    const j = (await state(high.sessionId)).journal.find((e) => e.action === "study.allocated")!;
    expect(j.after.stratumSource).toMatchObject({ source: "pre_test_score", score: 2, cutoff: 1, metric: "item.key_match" });
    expect((await one<{ stratum: string }>(t.pool, "SELECT stratum FROM participants WHERE id = $1", [low.participantId])).stratum).toBe("low");
  });

  it("refuses allocation when the pre-test score cannot be computed (no keyed items)", async () => {
    const study = await activeStudy(
      { steps: BASIC_STEPS, allocation: { algorithm: "stratified_block", seed: "s", stratifyBy: { source: "pre_test_score", cutoff: 1 } } },
      [["se-pre-nokey", "pre"], ...BASIC.slice(1)],
    );
    const s = await consented(study);
    await submitAssessment(t.pool, { sessionId: s.sessionId, step: "pre_test", assessmentId: ids["se-pre-nokey"]!, values: {} });
    await expect(allocateSession(t.pool, s.sessionId)).rejects.toMatchObject({ code: "allocation_refused" });
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM allocations WHERE participant_id = $1", [s.participantId])).n).toBe(0);
    expect((await state(s.sessionId)).journal.some((e) => e.action === "study.allocation_refused")).toBe(true);
  });

  it("stratifies by cmap.recall.dl of the pre map against the locked reference, and refuses without one", async () => {
    const steps = ["pre_test", "pre_reconstruction", "onboarding", "learning", ...POST];
    const by = { algorithm: "stratified_block", seed: "s", stratifyBy: { source: "pre_map_recall", cutoff: 0.5 } };
    const study = await activeStudy({ steps, allocation: by }, [["se-pre", "pre"], ["se-premap", "pre"], ...BASIC.slice(1)]);
    const results: Record<string, string> = {};
    for (const withEdge of [true, false]) {
      const s = await consented(study);
      await pre(s.sessionId);
      expect(await position(s.sessionId)).toMatchObject({ step: "pre_reconstruction" });
      await finalPreMap(s, "se-premap", withEdge);
      expect(await position(s.sessionId)).toEqual({ kind: "allocation" });
      await allocateSession(t.pool, s.sessionId);
      const j = (await state(s.sessionId)).journal.find((e) => e.action === "study.allocated")!;
      expect(j.after.stratumSource).toMatchObject({ source: "pre_map_recall", metric: "cmap.recall.dl", cutoff: 0.5, score: withEdge ? 1 : 0 });
      results[String(withEdge)] = j.after.stratum as string;
    }
    expect(results).toEqual({ true: "high", false: "low" });
    // The score went through the assessment services: stored as a derived score.
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM derived_scores WHERE metric_name = 'cmap.recall.dl' AND assessment_id = $1", [ids["se-premap"]])).n).toBe(2);

    const noRef = await activeStudy({ steps, allocation: by }, [["se-pre", "pre"], ["se-premap-noref", "pre"], ...BASIC.slice(1)]);
    const s = await consented(noRef);
    await pre(s.sessionId);
    await finalPreMap(s, "se-premap-noref", true);
    const err = await allocateSession(t.pool, s.sessionId).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StudyEngineError);
    expect(err).toMatchObject({ code: "allocation_refused" });
    expect((err as Error).message).toMatch(/no locked reference map/);
  });

  it("balances permuted blocks and every allocation is reproducible from its record", async () => {
    // No blind steps: allocation follows consent at once.
    const study = await activeStudy({ steps: ["onboarding", "learning"] }, []);
    const sessions = [];
    for (let i = 0; i < 8; i++) sessions.push(await consented(study));
    expect(sessions.every((s) => s.condition !== null)).toBe(true);
    const conds = await t.pool.query<{ id: string; code: string; allocation_weight: number }>("SELECT id, code, allocation_weight FROM study_conditions WHERE study_id = $1", [study.id]);
    const rows = await t.pool.query<{ participant_id: string; condition_id: string; algorithm: string; seed: string; sequence_index: number; stratum: string | null; period: number; block_index: number }>(
      "SELECT participant_id, condition_id, algorithm, seed, sequence_index, stratum, period, block_index FROM allocations WHERE study_id = $1 ORDER BY sequence_index",
      [study.id],
    );
    for (const block of [0, 1]) {
      const inBlock = rows.rows.filter((r) => r.block_index === block);
      expect(conds.rows.map((c) => inBlock.filter((r) => r.condition_id === c.id).length)).toEqual([2, 2]);
    }
    const audit = auditAllocations(
      rows.rows.map((r) => ({ participantId: r.participant_id, conditionId: r.condition_id, algorithm: r.algorithm, seed: r.seed, sequenceIndex: r.sequence_index, stratum: r.stratum, period: r.period })),
      conds.rows.map((c) => ({ id: c.id, code: c.code, weight: c.allocation_weight })),
    );
    expect(audit).toEqual({ checked: 8, skipped: 0, mismatches: [] });
  });

  it("runs the D8 order with questionnaire steps filtered by condition", async () => {
    const steps = ["questionnaire_pre", "pre_test", "onboarding", "learning", "questionnaire_post_learning", "post_test", "transfer", "reconstruction", "questionnaire_end"];
    const questionnaires = { pre: ["se-q-pre"], postLearning: ["se-q-load", "se-q-presence"], end: [{ code: "se-q-end" }] };
    const study = await activeStudy({ steps, questionnaires }, [["se-q-pre", "pre"], ...BASIC, ["se-q-load", "post"], ["se-q-presence", "post"], ["se-q-end", "post"]]);
    const seen: Record<string, string[]> = {};
    let completedOne = false;
    for (let i = 0; i < 6 && Object.keys(seen).length < 2; i++) {
      const s = await consented(study);
      expect(await position(s.sessionId)).toMatchObject({ step: "questionnaire_pre" });
      await submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_pre", assessmentId: ids["se-q-pre"]!, values: { [ids["se-q-pre:a"]!]: ["3"] } });
      await pre(s.sessionId);
      const a = await allocateSession(t.pool, s.sessionId);
      expect(await recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD })).toEqual({ kind: "passed" });
      await completeOnboarding(t.pool, s.sessionId);
      // Arriving at the hub ends a self-paced learning phase; the next step follows at once.
      expect(await position(s.sessionId)).toMatchObject({ step: "learning" });
      expect(await position(s.sessionId, true)).toMatchObject({ step: "questionnaire_post_learning" });
      const st = await state(s.sessionId);
      seen[a.condition] = (await listStepAssessments(t.pool, st, "questionnaire_post_learning")).map((x) => x.code);
      if (!completedOne) {
        for (const code of seen[a.condition]!) {
          const item = Object.keys(ids).find((k) => k.startsWith(`${code}:`))!;
          await submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_post_learning", assessmentId: ids[code]!, values: { [ids[item]!]: ["4"] } });
        }
        await submitAssessment(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: ids["se-post"]!, values: { [ids["se-post:q1"]!]: ["a"] } });
        await submitAssessment(t.pool, { sessionId: s.sessionId, step: "transfer", assessmentId: ids["se-transfer"]!, values: { [ids["se-transfer:why"]!]: ["An explanation."] } });
        await t.pool.query(
          "INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, raw, is_final, submitted_at) VALUES ($1, $2, $3, $4, 'post', '[]', '{}', true, now())",
          [s.sessionId, s.participantId, ids["se-recon"], ids["se-recon:map"]],
        );
        expect(await position(s.sessionId)).toMatchObject({ step: "questionnaire_end" });
        await submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_end", assessmentId: ids["se-q-end"]!, values: { [ids["se-q-end:d"]!]: ["5"] } });
        await completeSession(t.pool, s.sessionId);
        expect((await state(s.sessionId)).status).toBe("completed");
        const done = (await state(s.sessionId)).journal.filter((e) => e.action === "study.step_completed").map((e) => e.after.step);
        expect(done).toEqual(steps);
        completedOne = true;
      }
    }
    expect(seen).toEqual({ "2d": ["se-q-load"], immersive: ["se-q-load", "se-q-presence"] });
  });

  it("administers one instrument before and after learning (D8: SSQ) as two attempts", async () => {
    const steps = ["questionnaire_pre", "pre_test", "onboarding", "learning", "questionnaire_post_learning"];
    const study = await activeStudy({ steps, questionnaires: { pre: ["se-q-pre"], postLearning: ["se-q-pre"] } }, [["se-q-pre", "pre"], ["se-pre", "pre"]]);
    const s = await consented(study);
    const item = ids["se-q-pre:a"]!;
    await submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_pre", assessmentId: ids["se-q-pre"]!, values: { [item]: ["2"] } });
    await pre(s.sessionId);
    await allocateSession(t.pool, s.sessionId);
    await recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD });
    await completeOnboarding(t.pool, s.sessionId);
    expect(await position(s.sessionId, true)).toMatchObject({ step: "questionnaire_post_learning" });
    await submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_post_learning", assessmentId: ids["se-q-pre"]!, values: { [item]: ["4"] } });
    const rows = await t.pool.query<{ attempt: number; raw: { value: number } }>("SELECT attempt, raw FROM responses WHERE session_id = $1 AND item_id = $2 ORDER BY attempt", [s.sessionId, item]);
    expect(rows.rows.map((r) => [r.attempt, r.raw.value])).toEqual([[1, 2], [2, 4]]);
    expect(await position(s.sessionId)).toEqual({ kind: "finish" });
  });

  it("seeds the verified instruments as showable and refuses one with pending wording", async () => {
    const rows = await t.pool.query<{ code: string; version: number; items: number; is_validated_instrument: boolean }>(
      `SELECT a.code, a.version, a.is_validated_instrument, (SELECT count(*)::int FROM assessment_items i WHERE i.assessment_id = a.id) AS items
         FROM assessments a WHERE a.code = ANY($1::text[]) ORDER BY a.code`,
      [INSTRUMENT_DEFINITIONS.map((d) => d.code)],
    );
    expect(rows.rows.map((r) => [r.code, r.version, r.items, r.is_validated_instrument])).toEqual([
      ["cognitive-load", 2, 14, false], ["mps-physical-presence", 1, 5, false], ["ssq", 2, 16, false], ["sus", 2, 10, false], ["umux-lite", 2, 2, false],
    ]);
    const item = async (code: string, key: string) =>
      one<{ prompt: string; config: { min: number; points: number; provenance: { original: string; locator: string; secondary: boolean } } }>(
        t.pool,
        "SELECT i.prompt, i.config FROM assessment_items i JOIN assessments a ON a.id = i.assessment_id WHERE a.code = $1 AND i.item_key = $2",
        [code, key],
      );
    const ecl = await item("cognitive-load", "el-int.1");
    expect(ecl.prompt).toBe("The interaction technique used in the learning environment was very unclear.");
    expect(ecl.config).toMatchObject({ points: 11, min: 0, provenance: { original: "The interaction technique used in the simulation was very unclear.", locator: "p. 14 (PDF p. 14)" } });
    const sus8 = await item("sus", "sus.8");
    expect([sus8.prompt, sus8.config.provenance.original, sus8.config.provenance.secondary]).toEqual(["I found the system very awkward to use.", "I found the system very cumbersome to use.", true]);
    expect(await seedInstrumentDefinitions(t.pool)).toEqual([]);

    // Every seeded instrument is showable; a definition with pending wording is not.
    const study0 = await createStudy(t.pool, { slug: "demo-instruments", snapshotId, manifestId, isDemo: true, allowUnverified: true });
    await assessment("pending-scale", "questionnaire", [{ key: "a", kind: "likert", prompt: "Rate a", config: { kind: "likert", points: 5, provenance: { original: "Rate a" } } }], {
      instrument: { pendingItems: [{ key: "b", reason: "wording not verified" }] },
    });
    for (const [i, code] of ["ssq", "sus", "cognitive-load", "pending-scale", "se-pre"].entries()) {
      await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) SELECT $1, id, 'pre', $2 FROM assessments WHERE code = $3", [study0.studyId, i, code]);
    }
    await t.pool.query("UPDATE studies SET config = $2::jsonb, status = 'active' WHERE id = $1", [
      study0.studyId,
      JSON.stringify({
        traditionSlugs: ["se-tradition"],
        consent: CONSENT,
        steps: ["questionnaire_pre", "pre_test", "onboarding", "learning", "questionnaire_post_learning", "questionnaire_end"],
        questionnaires: { pre: ["ssq", "pending-scale"], postLearning: ["cognitive-load", "ssq"], end: ["sus"] },
      }),
    ]);
    const study = await findEnrollableStudy(t.pool, "demo-instruments");
    const s = await consented(study);
    const st = await state(s.sessionId);
    for (const step of ["questionnaire_post_learning", "questionnaire_end"] as const) {
      expect(stepReadiness(await listStepAssessments(t.pool, st, step))).toEqual({ ready: true });
    }
    const pre = await listStepAssessments(t.pool, st, "questionnaire_pre");
    const ready = stepReadiness(pre);
    expect(ready.ready).toBe(false);
    if (!ready.ready) expect(ready.reasons).toEqual(["pending-scale v1: item wording pending verification: b"]);
    await expect(submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_pre", assessmentId: pre[0]!.id, values: {} })).rejects.toMatchObject({ code: "assessment_not_ready" });
  });

  it("stores 0-based ratings (SSQ 0-3) in the shared raw format", async () => {
    // A non-demo study needs locked assessments: the researchers lock the seeded draft.
    await t.pool.query("UPDATE assessments SET status = 'locked', locked_at = now() WHERE code = 'ssq' AND version = 2 AND status = 'draft'");
    const study = await activeStudy({ steps: ["questionnaire_pre", "pre_test", "onboarding", "learning"], questionnaires: { pre: ["ssq"] } }, [["ssq", "pre"], ["se-pre", "pre"]]);
    const s = await consented(study);
    const [ssq] = await listStepAssessments(t.pool, await state(s.sessionId), "questionnaire_pre");
    const values = Object.fromEntries(ssq!.items.map((i, k) => [i.id, [String(k % 4)]]));
    await expect(submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_pre", assessmentId: ssq!.id, values: { ...values, [ssq!.items[0]!.id]: ["4"] } })).rejects.toMatchObject({ code: "invalid_answers" });
    expect(await submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_pre", assessmentId: ssq!.id, values })).toMatchObject({ answered: 16, skipped: 0, scored: 0 });
    const r = await one<{ raw: unknown }>(t.pool, "SELECT raw FROM responses WHERE session_id = $1 AND item_id = $2", [s.sessionId, ssq!.items[0]!.id]);
    expect(r.raw).toEqual({ value: 0, itemKind: "likert", assessmentVersion: 2 });
  });

  it("ends a fixed learning budget on the server clock; the hub cannot end it early", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS, exposure: { mode: "fixed_time", minutes: 1, allowEarlyFinish: false } }, BASIC);
    const a = await allocated(study);
    const b = await allocated(study);
    for (const s of [a, b]) await recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD });
    await t.pool.query("UPDATE study_sessions SET learning_started_at = now() - interval '2 minutes' WHERE id = $1", [b.sessionId]);
    for (const s of [a, b]) await completeOnboarding(t.pool, s.sessionId);
    expect(await position(a.sessionId, true)).toMatchObject({ step: "learning" });
    expect(await position(b.sessionId)).toMatchObject({ step: "post_test" });
    const step = (await state(b.sessionId)).journal.find((e) => e.action === "study.step_completed" && e.after.step === "learning");
    expect(step?.after.reason).toBe("budget_ended");
  });

  it("applies the WebGL-failure policy after allocation, to immersive participants only", async () => {
    for (const policy of ["retry", "exclude", "reassign"] as const) {
      const study = await activeStudy({ steps: BASIC_STEPS, webglFailurePolicy: policy, device: { minViewport: { width: 1024, height: 600 } } }, BASIC);
      let s = await allocated(study);
      while (s.condition !== "immersive") s = await allocated(study);
      expect(await recordDeviceCheck(t.pool, s.sessionId, report(2, 800, 600), { appBuild: BUILD })).toMatchObject({ kind: "retry", reason: "viewport_too_small" });
      const out = await recordDeviceCheck(t.pool, s.sessionId, report(null), { appBuild: BUILD });
      if (policy === "retry") {
        expect(out).toEqual({ kind: "retry", reason: "webgl_unavailable" });
      } else if (policy === "exclude") {
        expect(out).toEqual({ kind: "excluded" });
        expect(await one(t.pool, "SELECT excluded, status FROM study_sessions WHERE id = $1", [s.sessionId])).toEqual({ excluded: true, status: "abandoned" });
      } else {
        expect(out).toMatchObject({ kind: "reassigned", condition: "2d" });
        if (out.kind !== "reassigned") return;
        expect(await one(t.pool, "SELECT a.algorithm, a.period FROM study_sessions ss JOIN allocations a ON a.id = ss.allocation_id WHERE ss.id = $1", [out.sessionId])).toEqual({ algorithm: "manual", period: 2 });
        // The pre-test already taken is carried over, not asked again.
        expect(await position(out.sessionId)).toMatchObject({ step: "onboarding" });
      }
    }
  });

  it("records interruptions, refuses resumes beyond the limits, and withdraws keeping the data", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS, resume: { allowed: true, maxInterruptions: 1 }, retentionDays: 365 }, BASIC);
    const s = await consented(study);
    expect(await resumeSession(t.pool, s.sessionId)).toMatchObject({ kind: "resumed", interruptionCount: 1 });
    expect(await resumeSession(t.pool, s.sessionId)).toEqual({ kind: "refused", reason: "too_many_interruptions" });
    const w = await consented(study);
    await pre(w.sessionId, { [ids["se-pre:q1"]!]: ["a"] });
    const before = (await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM responses WHERE session_id = $1", [w.sessionId])).n;
    expect(await withdraw(t.pool, { participantId: w.participantId, sessionId: w.sessionId, reason: "no_time" })).toEqual({ retentionDays: 365 });
    expect(await one(t.pool, "SELECT ss.withdrawn, p.status FROM study_sessions ss JOIN participants p ON p.id = ss.participant_id WHERE ss.id = $1", [w.sessionId])).toEqual({ withdrawn: true, status: "withdrawn" });
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM responses WHERE session_id = $1", [w.sessionId])).n).toBe(before);
    await expect(allocateSession(t.pool, w.sessionId)).rejects.toMatchObject({ code: "session_closed" });
  });

  it("detects repeat enrolment from the same browser and can refuse it", async () => {
    const open = await activeStudy({ steps: BASIC_STEPS }, BASIC);
    const first = await enrolParticipant(t.pool, open);
    const second = await enrolParticipant(t.pool, open, { previousParticipantIds: [first.participantId] });
    expect(second.repeatOf).toBe(first.participantId);
    const strict = await activeStudy({ steps: BASIC_STEPS, enrolment: { blockRepeatBrowser: true } }, BASIC);
    const one1 = await enrolParticipant(t.pool, strict);
    await expect(enrolParticipant(t.pool, strict, { previousParticipantIds: [one1.participantId] })).rejects.toMatchObject({ code: "repeat_browser" });
  });
});
