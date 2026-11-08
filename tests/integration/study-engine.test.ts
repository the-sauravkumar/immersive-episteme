import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ingestTelemetryBatch } from "../../src/server/telemetry/ingest";
import { auditAllocations } from "../../src/server/study/allocation";
import type { StageTemplate, TraditionKey } from "../../src/features/process/domain/stage-template";
import type { GeneratedAssessment } from "../../src/features/study/test-items";
import {
  allocateSession,
  closeStaleSessions,
  completeEntrance,
  completeOnboarding,
  completeSession,
  finishLearning,
  recordStageEntered,
  recordStageLeft,
  stageVisitsOf,
  returnForDelayedTest,
  consentTextSha256,
  enrolParticipant,
  findEnrollableStudy,
  findReturnableStudy,
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
import { setStageTemplateSource } from "../../src/server/study/stage-templates";
import { seedTestBattery } from "../../src/server/study/test-battery";
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
  fixtureStageTemplates,
  visitEveryStage,
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

  async function activeStudy(config: Record<string, unknown>, battery: [string, "pre" | "post"][]): Promise<EnrollableStudy> {
    const slug = `study-${++n}`;
    const s = await createStudy(t.pool, { slug, snapshotId, manifestId });
    for (const [i, [code, phase]] of battery.entries()) {
      await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position, required) SELECT $1, id, $2, $3, false FROM assessments WHERE code = $4", [s.studyId, phase, i, code]);
    }
    await t.pool.query("UPDATE studies SET config = $2::jsonb, status = 'active' WHERE id = $1", [
      s.studyId,
      JSON.stringify({ traditionSlugs: ["se-tradition"], consent: CONSENT, allocation: { algorithm: "block", seed: `seed-${slug}` }, ...config }),
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
  const position = async (sessionId: string) => syncPosition(t.pool, await state(sessionId));
  const finished = async (sessionId: string) => {
    await visitEveryStage(t.pool, sessionId);
    await finishLearning(t.pool, sessionId);
    return position(sessionId);
  };
  const pre = (sessionId: string, values: Record<string, string[]> = {}) => submitAssessment(t.pool, { sessionId, step: "pre_test", assessmentId: ids["se-pre"]!, values });
  async function allocated(study: EnrollableStudy, preValues: Record<string, string[]> = {}): Promise<OpenedSession & { condition: "2d" | "immersive" }> {
    const s = await consented(study);
    await pre(s.sessionId, preValues);
    await recordDeviceCheck(t.pool, s.sessionId, report(2));
    const a = await allocateSession(t.pool, s.sessionId);
    return { ...s, condition: a.condition, conditionId: a.conditionId };
  }

  beforeAll(async () => {
    setStageTemplateSource(async () => fixtureStageTemplates("se-tradition"));
    t = await createTestDatabase("study");
    curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "se", acceptBy: curator });
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
    await assessment("se-transfer", "transfer", [{ key: "why", kind: "long_text", prompt: "Explain why", config: { kind: "long_text" } }]);
    const likert = (key: string) => ({ key, kind: "likert", prompt: `Rate ${key}`, config: { kind: "likert", points: 5, anchors: {} } });
    await assessment("se-q-pre", "questionnaire", [likert("a")]);
    await assessment("se-q-load", "questionnaire", [likert("b")]);
    await assessment(
      "se-q-presence",
      "questionnaire",
      [{ key: "c", kind: "likert", prompt: "Rate c", config: { kind: "likert", points: 5, anchors: {}, provenance: { original: "Rate c" } } }],
      { instrument: { conditions: ["immersive"], pendingItems: [] } },
    );
    await assessment("se-q-end", "questionnaire", [likert("d")]);
    await seedInstrumentDefinitions(t.pool);
  }, 120_000);

  afterAll(async () => {
    setStageTemplateSource(null);
    await t?.drop();
  });

  it("refuses unknown, inactive and unconfigured studies", async () => {
    await expect(findEnrollableStudy(t.pool, "no-such-study")).rejects.toMatchObject({ code: "study_not_found" });
    await createStudy(t.pool, { slug: "draft-one", snapshotId, manifestId });
    await expect(findEnrollableStudy(t.pool, "Draft-One ")).rejects.toMatchObject({ code: "study_not_open" });
    const s = await createStudy(t.pool, { slug: "no-consent", snapshotId, manifestId });
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [s.studyId]);
    await expect(findEnrollableStudy(t.pool, "no-consent")).rejects.toMatchObject({ code: "study_misconfigured" });
  });

  it("takes the pre-test blind to condition, then the device check, then allocates and records the allocation", async () => {
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
    await expect(allocateSession(t.pool, s.sessionId)).rejects.toMatchObject({ code: "not_current_step" });
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
    expect(await position(s.sessionId)).toEqual({ kind: "device_check" });
    await expect(allocateSession(t.pool, s.sessionId)).rejects.toMatchObject({ code: "not_current_step" });
    expect(await recordDeviceCheck(t.pool, s.sessionId, report(2))).toEqual({ kind: "passed" });
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
    const other = await one<{ id: string }>(t.pool, "SELECT id FROM study_conditions WHERE study_id = $1 AND id <> $2", [study.id, a.conditionId]);
    await expect(t.pool.query("UPDATE study_sessions SET condition_id = $2 WHERE id = $1", [s.sessionId, other.id])).rejects.toThrow(/immutable|allocation/);
    const j = (await state(s.sessionId)).journal.find((e) => e.action === "study.allocated")!;
    expect(j.after).toMatchObject({ allocationPoint: "after_pre_test", sequenceIndex: 0, studyProtocolVersion: "p1", traditionOrder: ["se-tradition"] });
    expect(await position(s.sessionId)).toMatchObject({ step: "onboarding" });
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
    await recordDeviceCheck(t.pool, s.sessionId, report(2));
    await expect(allocateSession(t.pool, s.sessionId)).rejects.toMatchObject({ code: "allocation_refused" });
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM allocations WHERE participant_id = $1", [s.participantId])).n).toBe(0);
    expect((await state(s.sessionId)).journal.some((e) => e.action === "study.allocation_refused")).toBe(true);
  });

  it("balances permuted blocks and every allocation is reproducible from its record", async () => {
    const study = await activeStudy({ steps: ["onboarding", "learning"] }, []);
    for (let i = 0; i < 8; i++) {
      const s = await consented(study);
      expect(s.condition).toBeNull();
      await recordDeviceCheck(t.pool, s.sessionId, report(2));
      await allocateSession(t.pool, s.sessionId);
    }
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
      expect(await recordDeviceCheck(t.pool, s.sessionId, report(2))).toEqual({ kind: "passed" });
      const a = await allocateSession(t.pool, s.sessionId);
      await completeOnboarding(t.pool, s.sessionId);
      expect(await position(s.sessionId)).toMatchObject({ step: "learning" });
      expect(await finished(s.sessionId)).toMatchObject({ step: "questionnaire_post_learning" });
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
    await recordDeviceCheck(t.pool, s.sessionId, report(2));
    await allocateSession(t.pool, s.sessionId);
    await completeOnboarding(t.pool, s.sessionId);
    expect(await finished(s.sessionId)).toMatchObject({ step: "questionnaire_post_learning" });
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
      ["background", 1, 4, false], ["cognitive-load", 2, 14, false], ["common-questions", 1, 4, false], ["mps-physical-presence", 1, 5, false], ["ssq", 3, 16, false], ["sus", 2, 10, false], ["umux-lite", 2, 2, false],
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

    const study0 = await createStudy(t.pool, { slug: "demo-instruments", snapshotId, manifestId, isDemo: true, allowUnverified: true });
    await assessment("pending-scale", "questionnaire", [{ key: "a", kind: "likert", prompt: "Rate a", config: { kind: "likert", points: 5, provenance: { original: "Rate a" } } }], {
      instrument: { pendingItems: [{ key: "b", reason: "wording not verified" }] },
    });
    for (const [i, code] of ["sus", "cognitive-load", "common-questions", "pending-scale", "se-pre"].entries()) {
      await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position, required) SELECT $1, id, 'pre', $2, false FROM assessments WHERE code = $3", [study0.studyId, i, code]);
    }
    await t.pool.query("UPDATE studies SET config = $2::jsonb, status = 'active' WHERE id = $1", [
      study0.studyId,
      JSON.stringify({
        traditionSlugs: ["se-tradition"],
        consent: CONSENT,
        steps: ["questionnaire_pre", "pre_test", "onboarding", "learning", "questionnaire_post_learning", "questionnaire_end"],
        questionnaires: { pre: ["pending-scale"], postLearning: ["cognitive-load", "common-questions"], end: ["sus"] },
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

  it("stores 0-based ratings in the shared raw format", async () => {
    await t.pool.query("UPDATE assessments SET status = 'locked', locked_at = now() WHERE code = 'cognitive-load' AND version = 2 AND status = 'draft'");
    const study = await activeStudy({ steps: ["questionnaire_pre", "pre_test", "onboarding", "learning"], questionnaires: { pre: ["cognitive-load"] } }, [["cognitive-load", "pre"], ["se-pre", "pre"]]);
    const s = await consented(study);
    const [load] = await listStepAssessments(t.pool, await state(s.sessionId), "questionnaire_pre");
    const values = Object.fromEntries(load!.items.map((i, k) => [i.id, [String(k % 4)]]));
    await expect(submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_pre", assessmentId: load!.id, values: { ...values, [load!.items[0]!.id]: ["11"] } })).rejects.toMatchObject({ code: "invalid_answers" });
    expect(await submitAssessment(t.pool, { sessionId: s.sessionId, step: "questionnaire_pre", assessmentId: load!.id, values })).toMatchObject({ answered: 14, skipped: 0, scored: 0 });
    const r = await one<{ raw: unknown }>(t.pool, "SELECT raw FROM responses WHERE session_id = $1 AND item_id = $2", [s.sessionId, load!.items[0]!.id]);
    expect(r.raw).toEqual({ value: 0, itemKind: "likert", assessmentVersion: 2 });
  });

  it("ends learning at the cap on the server clock; the hub cannot end it early", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS, exposure: { minutes: 1 } }, BASIC);
    const a = await allocated(study);
    const b = await allocated(study);
    await t.pool.query("UPDATE study_sessions SET learning_started_at = now() - interval '2 minutes' WHERE id = $1", [b.sessionId]);
    for (const s of [a, b]) await completeOnboarding(t.pool, s.sessionId);
    expect(await position(a.sessionId)).toMatchObject({ step: "learning" });
    expect(await position(b.sessionId)).toMatchObject({ step: "post_test" });
    const step = (await state(b.sessionId)).journal.find((e) => e.action === "study.step_completed" && e.after.step === "learning");
    expect(step?.after.reason).toBe("cap_reached");
  });

  describe("every stage visited, self-paced with a cap", () => {
    const template = (tradition: TraditionKey): StageTemplate => ({
      tradition,
      traditionName: `Sample Text ${tradition}`,
      rawClothStateId: "raw",
      products: [],
      stages: [1, 2].map((number) => ({ number, key: `${tradition}-s${number}`, sourceStageKeys: [], name: `Stage ${number}`, localName: null, kind: "table" as const, caption: { text: "Sample Text", sources: [] }, items: [], clothStateId: `c${number}` })),
    });
    const guarded = { minutes: 30 };
    const traditions: TraditionKey[] = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"];
    beforeAll(() => setStageTemplateSource(async () => traditions.map(template)));
    afterAll(() => setStageTemplateSource(async () => fixtureStageTemplates("se-tradition")));

    async function learning(exposure: Record<string, unknown> = guarded) {
      const study = await activeStudy({ steps: BASIC_STEPS, traditionSlugs: traditions, exposure }, BASIC);
      const s = await allocated(study);
      await completeOnboarding(t.pool, s.sessionId);
      const order = (await state(s.sessionId)).traditionOrder;
      return { s, order, stops: order.flatMap((key) => [`${key}-s1`, `${key}-s2`, "products"].map((stageKey) => ({ traditionKey: key, stageKey }))) };
    }
    const backdateVisits = (sessionId: string) => t.pool.query("UPDATE stage_visits SET entered_at = entered_at - interval '1 minute', left_at = left_at - interval '1 minute' WHERE session_id = $1", [sessionId]);

    it("stamps the cap on a self-paced study, draws a full tradition order, and refuses a finish with stages unvisited", async () => {
      const { s, order } = await learning();
      expect([...order].sort()).toEqual([...traditions].sort());
      const clock = await one<{ learning_budget_seconds: number; learning_ends_at: Date | null }>(t.pool, "SELECT learning_budget_seconds, learning_ends_at FROM study_sessions WHERE id = $1", [s.sessionId]);
      expect(clock.learning_budget_seconds).toBe(1800);
      expect(clock.learning_ends_at).not.toBeNull();
      await expect(finishLearning(t.pool, s.sessionId)).rejects.toMatchObject({ code: "learning_incomplete" });
      expect(await position(s.sessionId)).toMatchObject({ step: "learning" });
    });

    it("keeps learning open through hub visits and a resume once every stage is visited; only the finish ends it", async () => {
      const { s, stops } = await learning();
      for (const stop of stops) await recordStageEntered(t.pool, s.sessionId, stop);
      expect(await position(s.sessionId)).toMatchObject({ step: "learning" });
      expect(await resumeSession(t.pool, s.sessionId)).toMatchObject({ kind: "resumed" });
      expect(await position(s.sessionId)).toMatchObject({ step: "learning" });
      expect((await one<{ ended: Date | null }>(t.pool, "SELECT learning_ended_at AS ended FROM study_sessions WHERE id = $1", [s.sessionId])).ended).toBeNull();
      expect(await finished(s.sessionId)).toMatchObject({ step: "post_test" });
      const step = (await state(s.sessionId)).journal.find((e) => e.action === "study.step_completed" && e.after.step === "learning")!;
      expect(step.after).toMatchObject({ reason: "finished", unvisited: [] });
    });

    it("refuses a stage ahead, allows back, then finishes with time recorded and nothing unvisited", async () => {
      const { s, stops } = await learning();
      await expect(recordStageEntered(t.pool, s.sessionId, stops[1]!)).rejects.toMatchObject({ code: "stage_refused" });
      await recordStageEntered(t.pool, s.sessionId, stops[0]!);
      await backdateVisits(s.sessionId);
      await recordStageLeft(t.pool, s.sessionId, { ...stops[0]!, activeMs: 1200 });
      await recordStageEntered(t.pool, s.sessionId, stops[1]!);
      const back = await recordStageEntered(t.pool, s.sessionId, stops[0]!);
      expect(back).toMatchObject({ backStep: true, visitCount: 2 });
      for (const stop of stops.slice(1)) await recordStageEntered(t.pool, s.sessionId, stop);
      await finishLearning(t.pool, s.sessionId);
      expect(await position(s.sessionId)).toMatchObject({ step: "post_test" });
      const step = (await state(s.sessionId)).journal.find((e) => e.action === "study.step_completed" && e.after.step === "learning")!;
      expect(step.after).toMatchObject({ reason: "finished", stagesRequired: stops.length, stagesVisited: stops.length, unvisited: [] });
      expect((await one<{ active_ms: number }>(t.pool, "SELECT active_ms FROM stage_visits WHERE session_id = $1 AND visit_index = 0", [s.sessionId])).active_ms).toBe(1200);
    });

    it("stores the stage events in both doors and refuses the walk events in Door 1", async () => {
      const { s, stops } = await learning();
      const condition = (await state(s.sessionId)).condition;
      const send = (seq: number, type: string, metadata: Record<string, unknown>) =>
        ingestTelemetryBatch(t.pool, { kind: "participant", participantId: s.participantId, sessionId: s.sessionId }, {
          idempotencyKey: `b:${s.sessionId}:${seq}`, sessionId: s.sessionId, schemaVersion: 1, appBuild: BUILD, contentVersion: "v-study", clientSentAt: new Date().toISOString(),
          events: [{ eventId: randomUUID(), schemaVersion: 1, sessionId: s.sessionId, seq, type, clientTs: new Date().toISOString(), metadata }],
        });
      const entered = await send(0, "stage_entered", { ...stops[0]!, stageNumber: 1, visitCount: 1, backStep: false });
      expect(entered).toMatchObject({ status: 200, body: { accepted: 1, quarantined: 0 } });
      const dwell = await send(1, "object_dwell", { ...stops[0]!, stageNumber: 1, objectKey: "block", dwellMs: 900, closestM: 1.2 });
      expect(dwell).toMatchObject({ status: 200, body: condition === "immersive" ? { accepted: 1, quarantined: 0 } : { accepted: 0, quarantined: 1 } });
    });

    it("ends learning at the cap on the server and records the stages left unvisited", async () => {
      const study = await activeStudy({ steps: BASIC_STEPS, traditionSlugs: traditions, exposure: guarded }, BASIC);
      const s = await allocated(study);
      await t.pool.query("UPDATE study_sessions SET learning_started_at = now() - interval '31 minutes' WHERE id = $1", [s.sessionId]);
      await completeOnboarding(t.pool, s.sessionId);
      expect(await position(s.sessionId)).toMatchObject({ step: "post_test" });
      const step = (await state(s.sessionId)).journal.find((e) => e.action === "study.step_completed" && e.after.step === "learning")!;
      expect(step.after).toMatchObject({ reason: "cap_reached", stagesRequired: 9, stagesVisited: 0 });
      expect(step.after.unvisited).toHaveLength(9);
      const clock = await one<{ ended: Date; ends: Date }>(t.pool, "SELECT learning_ended_at AS ended, learning_ends_at AS ends FROM study_sessions WHERE id = $1", [s.sessionId]);
      expect(clock.ended.getTime()).toBe(clock.ends.getTime());
    });

    it("treats a repeated report of the current stop as the same visit, and adds up its exits", async () => {
      const { s, stops } = await learning();
      await recordStageEntered(t.pool, s.sessionId, stops[0]!);
      expect(await recordStageEntered(t.pool, s.sessionId, stops[0]!)).toMatchObject({ visitCount: 1, backStep: false, visitIndex: 0 });
      await backdateVisits(s.sessionId);
      expect(await recordStageLeft(t.pool, s.sessionId, { ...stops[0]!, activeMs: 1000 })).toBe(true);
      await backdateVisits(s.sessionId);
      expect(await recordStageLeft(t.pool, s.sessionId, { ...stops[0]!, activeMs: 250 })).toBe(true);
      const visits = await t.pool.query<{ active_ms: number }>("SELECT active_ms FROM stage_visits WHERE session_id = $1", [s.sessionId]);
      expect(visits.rows.map((row) => row.active_ms)).toEqual([1250]);
      expect(await stageVisitsOf(t.pool, s.sessionId)).toEqual([{ traditionKey: stops[0]!.traditionKey, stageKey: stops[0]!.stageKey }]);
    });

    it("records a stage exit only on this session's current visit, within the wall time since the visit's last recorded moment", async () => {
      const { s, stops } = await learning();
      const other = await learning();
      await recordStageEntered(t.pool, s.sessionId, stops[0]!);
      await recordStageEntered(t.pool, other.s.sessionId, other.stops[0]!);
      await t.pool.query("UPDATE stage_visits SET entered_at = now() - interval '2 seconds' WHERE session_id = $1", [s.sessionId]);
      expect(await recordStageLeft(t.pool, s.sessionId, { ...stops[1]!, activeMs: 500 })).toBe(false);
      expect(await recordStageLeft(t.pool, s.sessionId, { ...stops[0]!, activeMs: 86_400_000 })).toBe(true);
      const first = await one<{ active_ms: number; left_at: Date }>(t.pool, "SELECT active_ms, left_at FROM stage_visits WHERE session_id = $1", [s.sessionId]);
      expect(first.active_ms).toBeGreaterThanOrEqual(2000);
      expect(first.active_ms).toBeLessThan(60_000);
      expect(await recordStageLeft(t.pool, s.sessionId, { ...stops[0]!, activeMs: 86_400_000 })).toBe(true);
      const replayed = await one<{ active_ms: number; left_at: Date }>(t.pool, "SELECT active_ms, left_at FROM stage_visits WHERE session_id = $1", [s.sessionId]);
      expect(replayed.active_ms - first.active_ms).toBeLessThan(1000);
      expect(replayed.left_at.getTime()).toBeGreaterThanOrEqual(first.left_at.getTime());
      await recordStageEntered(t.pool, s.sessionId, stops[1]!);
      expect(await recordStageLeft(t.pool, s.sessionId, { ...stops[0]!, activeMs: 500 })).toBe(false);
      expect((await one<{ active_ms: number }>(t.pool, "SELECT active_ms FROM stage_visits WHERE session_id = $1 AND visit_index = 0", [s.sessionId])).active_ms).toBe(replayed.active_ms);
      expect((await one<{ active_ms: number | null }>(t.pool, "SELECT active_ms FROM stage_visits WHERE session_id = $1", [other.s.sessionId])).active_ms).toBeNull();
    });

    it("ignores a stage exit after the session closed and bounds a late one by the end of learning", async () => {
      const { s, stops } = await learning();
      await recordStageEntered(t.pool, s.sessionId, stops[0]!);
      await t.pool.query("UPDATE stage_visits v SET entered_at = ss.learning_started_at FROM study_sessions ss WHERE ss.id = v.session_id AND v.session_id = $1", [s.sessionId]);
      await t.pool.query("UPDATE study_sessions SET learning_ended_at = learning_started_at + interval '1 second' WHERE id = $1", [s.sessionId]);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(await recordStageLeft(t.pool, s.sessionId, { ...stops[0]!, activeMs: 300_000 })).toBe(true);
      const visit = await one<{ active_ms: number; left_at: Date; ended: Date }>(
        t.pool,
        "SELECT v.active_ms, v.left_at, ss.learning_ended_at AS ended FROM stage_visits v JOIN study_sessions ss ON ss.id = v.session_id WHERE v.session_id = $1",
        [s.sessionId],
      );
      expect(visit.left_at.getTime()).toBe(visit.ended.getTime());
      expect(visit.active_ms).toBe(1000);

      const closed = await learning();
      await recordStageEntered(t.pool, closed.s.sessionId, closed.stops[0]!);
      await t.pool.query("UPDATE study_sessions SET excluded = true, excluded_at = now(), exclusion_reason = 'other: test' WHERE id = $1", [closed.s.sessionId]);
      expect(await recordStageLeft(t.pool, closed.s.sessionId, { ...closed.stops[0]!, activeMs: 10 })).toBe(false);
    });

    it("counterbalances the order of the traditions within each condition", async () => {
      const study = await activeStudy({ steps: BASIC_STEPS, traditionSlugs: traditions, allocation: { algorithm: "block", seed: "orders" } }, BASIC);
      const seen: Record<string, string[]> = { "2d": [], immersive: [] };
      for (let i = 0; i < 12; i++) {
        const s = await allocated(study);
        seen[s.condition]!.push((await state(s.sessionId)).traditionOrder.join(">"));
      }
      for (const orders of Object.values(seen)) expect(new Set(orders).size).toBe(6);
    });
  });

  describe("the entrance and the delayed test", () => {
    it("shows the entrance after allocation and before anything else, for both doors", async () => {
      const study = await activeStudy({ steps: ["pre_test", "entrance", "onboarding", "learning", ...POST] }, BASIC);
      const s = await allocated(study);
      expect(await position(s.sessionId)).toMatchObject({ step: "entrance" });
      await completeEntrance(t.pool, s.sessionId);
      expect(await position(s.sessionId)).toMatchObject({ step: "onboarding" });
      const door = (await state(s.sessionId)).journal.find((e) => e.action === "study.step_completed" && e.after.step === "entrance")!;
      expect(door.after.door).toBe(s.condition);
    });

    async function atDelayedTest(delayedTest?: Record<string, number>) {
      const study = await activeStudy({ steps: ["pre_test", "onboarding", "learning", "post_test", "delayed_test"], ...(delayedTest ? { delayedTest } : {}) }, [["se-pre", "pre"], ["se-post", "post"], ["se-delayed", "follow_up" as "post"]]);
      const s = await allocated(study);
      await completeOnboarding(t.pool, s.sessionId);
      await finished(s.sessionId);
      await submitAssessment(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: ids["se-post"]!, values: {} });
      return { study, s };
    }

    beforeAll(async () => {
      const choice = (id: string) => ({ id, label: `Option ${id}` });
      await assessment("se-delayed", "posttest", [{ key: "q1", kind: "single_choice", prompt: "Pick a", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "a" } }], { testType: "sequence" });
    });

    it("seeds an assessment holding Sample Text items as a demo record that no real study can include", async () => {
      const sampled = (code: string, title: string): GeneratedAssessment => ({
        code,
        kind: "transfer",
        phase: "post",
        position: 0,
        title,
        description: null,
        testType: "transfer",
        paged: false,
        items: [{ itemKey: "transfer.x.order", position: 0, kind: "ranking", prompt: "Order", config: { kind: "ranking", options: [{ id: "s1", label: "One" }, { id: "s2", label: "Two" }], account: "An account.", sampleText: true }, answerKey: { order: ["s1", "s2"] } }],
      });
      expect(await seedTestBattery(t.pool, [sampled("demo-gen-transfer", "Demo: A Tradition You Have Not Seen")])).toEqual(["demo-gen-transfer"]);
      const seeded = await t.pool.query<{ is_demo: boolean }>("SELECT is_demo FROM assessments WHERE code = 'demo-gen-transfer'");
      expect(seeded.rows).toEqual([{ is_demo: true }]);
      const real = await createStudy(t.pool, { slug: "sample-text-refused", snapshotId, manifestId });
      await expect(t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) SELECT $1, id, 'post', 0 FROM assessments WHERE code = 'demo-gen-transfer'", [real.studyId])).rejects.toThrow(/non-demo study cannot include a demo assessment/);
      await expect(seedTestBattery(t.pool, [sampled("gen-transfer", "A Tradition You Have Not Seen")])).rejects.toThrow(/assessments_demo_ck/);
    });

    it("seeds the generated battery once, and delivers and scores sequence, matching and sketch items", async () => {
      const battery: GeneratedAssessment[] = [
        { code: "gen-seq", kind: "posttest", phase: "post", position: 0, title: "Put The Stages In Order", description: null, testType: "sequence", paged: false, items: [{ itemKey: "seq.a", position: 0, kind: "ranking", prompt: "Order", config: { kind: "ranking", options: [{ id: "s1", label: "One" }, { id: "s2", label: "Two" }, { id: "s3", label: "Three" }] }, answerKey: { order: ["s1", "s2", "s3"] } }] },
        { code: "gen-cloth", kind: "posttest", phase: "post", position: 1, title: "Match The Cloth", description: null, testType: "cloth_state", paged: false, items: [{ itemKey: "cloth.a", position: 0, kind: "matching", prompt: "Match", config: { kind: "matching", pairs: [{ id: "p1", image: { path: "/walkthrough/cloth/a.jpg", alt: "Cloth" } }, { id: "p2", image: { path: "/walkthrough/cloth/b.jpg", alt: "Cloth" } }], options: [{ id: "s1", label: "One" }, { id: "s2", label: "Two" }] }, answerKey: { matches: { p1: "s1", p2: "s2" } } }] },
        { code: "gen-sketch", kind: "sketch", phase: "post", position: 2, title: "Sketch The Layout", description: null, testType: null, paged: false, items: [{ itemKey: "layout.sketch", position: 0, kind: "sketch", prompt: "Sketch", config: { kind: "sketch" }, answerKey: null }] },
      ];
      expect(await seedTestBattery(t.pool, battery)).toEqual(["gen-seq", "gen-cloth", "gen-sketch"]);
      expect(await seedTestBattery(t.pool, battery)).toEqual([]);
      await t.pool.query("UPDATE assessments SET status = 'locked', locked_at = now() WHERE code LIKE 'gen-%'");
      const study = await activeStudy({ steps: ["pre_test", "onboarding", "learning", "post_test", "layout_sketch"] }, [["se-pre", "pre"], ["gen-seq", "post"], ["gen-cloth", "post"], ["gen-sketch", "post"]]);
      const s = await allocated(study);
      await completeOnboarding(t.pool, s.sessionId);
      expect(await finished(s.sessionId)).toMatchObject({ step: "post_test" });
      const st = await state(s.sessionId);
      const tests = await listStepAssessments(t.pool, st, "post_test");
      expect(stepReadiness(tests)).toEqual({ ready: true });
      const item = (code: string) => tests.find((a) => a.code === code)!;
      await submitAssessment(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: item("gen-seq").id, values: { [item("gen-seq").items[0]!.id]: ["s2", "s1", "s3"] } });
      await submitAssessment(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: item("gen-cloth").id, values: { [item("gen-cloth").items[0]!.id]: ["p1=s1", "p2=s1"] } });
      const scores = await t.pool.query<{ metric_name: string; value: number }>("SELECT metric_name, value FROM derived_scores WHERE session_id = $1 AND metric_name LIKE 'test.%' ORDER BY metric_name", [s.sessionId]);
      expect(scores.rows.map((r) => r.metric_name)).toEqual(["test.cloth_state", "test.sequence"]);
      expect(scores.rows[0]!.value).toBe(0.5);
      expect(scores.rows[1]!.value).toBeCloseTo(2 / 3, 10);
      expect(await position(s.sessionId)).toMatchObject({ step: "layout_sketch" });
      const [sketch] = await listStepAssessments(t.pool, await state(s.sessionId), "layout_sketch");
      const strokes = JSON.stringify([[[1, 2], [3, 4]]]);
      await submitAssessment(t.pool, { sessionId: s.sessionId, step: "layout_sketch", assessmentId: sketch!.id, values: { [sketch!.items[0]!.id]: [strokes] } });
      const raw = await one<{ raw: { value: string; itemKind: string } }>(t.pool, "SELECT raw FROM responses WHERE session_id = $1 AND item_id = $2", [s.sessionId, sketch!.items[0]!.id]);
      expect(raw.raw).toMatchObject({ value: strokes, itemKind: "sketch" });
    });

    it("schedules about 7 days later, refuses early answers and lets the participant back by code", async () => {
      const { study, s } = await atDelayedTest();
      expect(await position(s.sessionId)).toMatchObject({ step: "delayed_test" });
      const row = await one<{ days: number; closes: number }>(t.pool, "SELECT round(extract(epoch FROM due_at - scheduled_at) / 86400)::int AS days, round(extract(epoch FROM closes_at - scheduled_at) / 86400)::int AS closes FROM delayed_test_schedule WHERE session_id = $1", [s.sessionId]);
      expect(row).toEqual({ days: 7, closes: 14 });
      await expect(submitAssessment(t.pool, { sessionId: s.sessionId, step: "delayed_test", assessmentId: ids["se-delayed"]!, values: {} })).rejects.toMatchObject({ code: "delayed_test_not_open" });
      const code = (await state(s.sessionId)).participantCode;
      expect(await returnForDelayedTest(t.pool, { studyCode: study.slug, participantCode: code.toLowerCase() })).toMatchObject({ sessionId: s.sessionId, availability: "early" });
      await expect(returnForDelayedTest(t.pool, { studyCode: study.slug, participantCode: "P-NOSUCHCODE" })).rejects.toMatchObject({ code: "participant_not_found" });

      await t.pool.query("UPDATE delayed_test_schedule SET opens_at = now() - interval '1 hour', due_at = now(), closes_at = now() + interval '1 day' WHERE session_id = $1", [s.sessionId]);
      expect(await returnForDelayedTest(t.pool, { studyCode: study.slug, participantCode: code })).toMatchObject({ availability: "open" });
      const r = await submitAssessment(t.pool, { sessionId: s.sessionId, step: "delayed_test", assessmentId: ids["se-delayed"]!, values: { [ids["se-delayed:q1"]!]: ["a"] } });
      expect(r.stepCompleted).toBe(true);
      expect(await position(s.sessionId)).toEqual({ kind: "finish" });
      const done = await one<{ returned_at: Date | null; completed_at: Date | null }>(t.pool, "SELECT returned_at, completed_at FROM delayed_test_schedule WHERE session_id = $1", [s.sessionId]);
      expect(done.returned_at).not.toBeNull();
      expect(done.completed_at).not.toBeNull();
      const score = await one<{ value: number }>(t.pool, "SELECT value FROM derived_scores WHERE session_id = $1 AND metric_name = 'test.sequence'", [s.sessionId]);
      expect(score.value).toBe(1);
    });

    it("lets a participant at the delayed step back by code when no schedule row was written, and schedules it from the last immediate step", async () => {
      const { study, s } = await atDelayedTest();
      await t.pool.query("DELETE FROM delayed_test_schedule WHERE session_id = $1", [s.sessionId]);
      const code = (await state(s.sessionId)).participantCode;
      expect(await returnForDelayedTest(t.pool, { studyCode: study.slug, participantCode: code })).toMatchObject({ sessionId: s.sessionId, availability: "early" });
      const row = await one<{ days: number }>(t.pool, "SELECT round(extract(epoch FROM d.due_at - e.at) / 86400)::int AS days FROM delayed_test_schedule d, (SELECT max(occurred_at) AS at FROM audit_log WHERE entity_id = $1::text AND action = 'study.step_completed' AND after->>'step' <> 'delayed_test') e WHERE d.session_id = $1::uuid", [s.sessionId]);
      expect(row.days).toBe(7);
      const early = await allocated(study);
      await expect(returnForDelayedTest(t.pool, { studyCode: study.slug, participantCode: (await state(early.sessionId)).participantCode })).rejects.toMatchObject({ code: "participant_not_found" });
      expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM delayed_test_schedule WHERE session_id = $1", [early.sessionId])).n).toBe(0);
    });

    it("marks a window that has closed as missed and lets the session finish", async () => {
      const { s } = await atDelayedTest();
      await position(s.sessionId);
      await t.pool.query("UPDATE delayed_test_schedule SET opens_at = now() - interval '9 days', due_at = now() - interval '8 days', closes_at = now() - interval '1 day' WHERE session_id = $1", [s.sessionId]);
      expect(await position(s.sessionId)).toEqual({ kind: "finish" });
      expect((await one<{ missed_at: Date | null }>(t.pool, "SELECT missed_at FROM delayed_test_schedule WHERE session_id = $1", [s.sessionId])).missed_at).not.toBeNull();
    });

    it("lets a participant back for the delayed test after the study is closed, and enrols nobody new", async () => {
      const { study, s } = await atDelayedTest();
      expect(await position(s.sessionId)).toMatchObject({ step: "delayed_test" });
      await t.pool.query("UPDATE studies SET status = 'closed' WHERE id = $1", [study.id]);
      await expect(findEnrollableStudy(t.pool, study.slug)).rejects.toMatchObject({ code: "study_not_open" });
      expect((await findReturnableStudy(t.pool, study.slug.toUpperCase())).id).toBe(study.id);
      await t.pool.query("UPDATE delayed_test_schedule SET opens_at = now() - interval '1 hour', due_at = now(), closes_at = now() + interval '1 day' WHERE session_id = $1", [s.sessionId]);
      expect(await returnForDelayedTest(t.pool, { studyCode: study.slug, participantCode: (await state(s.sessionId)).participantCode })).toMatchObject({ sessionId: s.sessionId, availability: "open" });
      const r = await submitAssessment(t.pool, { sessionId: s.sessionId, step: "delayed_test", assessmentId: ids["se-delayed"]!, values: { [ids["se-delayed:q1"]!]: ["a"] } });
      expect(r.stepCompleted).toBe(true);
      const draftSlug = `draft-${++n}`;
      await createStudy(t.pool, { slug: draftSlug, snapshotId, manifestId });
      await expect(findReturnableStudy(t.pool, draftSlug)).rejects.toMatchObject({ code: "study_not_open" });
    });

    it("ends a session by the study's timing: a closed delayed window completes it, a walk-away abandons it, an open window keeps it", async () => {
      const waiting = await atDelayedTest();
      const lapsed = await atDelayedTest();
      for (const x of [waiting, lapsed]) expect(await position(x.s.sessionId)).toMatchObject({ step: "delayed_test" });
      await t.pool.query("UPDATE study_sessions SET started_at = now() - interval '21 days', last_activity_at = now() - interval '20 days' WHERE id = ANY($1::uuid[])", [[waiting.s.sessionId, lapsed.s.sessionId]]);
      await t.pool.query("UPDATE delayed_test_schedule SET opens_at = now() - interval '9 days', due_at = now() - interval '8 days', closes_at = now() - interval '1 day' WHERE session_id = $1", [lapsed.s.sessionId]);
      const study = await activeStudy({ steps: BASIC_STEPS }, BASIC);
      const away = await allocated(study);
      await completeOnboarding(t.pool, away.sessionId);
      const here = await allocated(study);
      await t.pool.query("UPDATE study_sessions SET last_activity_at = now() - interval '7 hours' WHERE id = $1", [away.sessionId]);

      const ended = [...(await closeStaleSessions(t.pool, waiting.study.id)), ...(await closeStaleSessions(t.pool, lapsed.study.id)), ...(await closeStaleSessions(t.pool, study.id))];
      expect(ended.map((e) => [e.sessionId, e.status]).sort()).toEqual([[lapsed.s.sessionId, "completed"], [away.sessionId, "abandoned"]].sort());
      const closes = await one<{ closes_at: Date; missed_at: Date | null }>(t.pool, "SELECT closes_at, missed_at FROM delayed_test_schedule WHERE session_id = $1", [lapsed.s.sessionId]);
      expect(closes.missed_at).toBeNull();
      expect(await one(t.pool, "SELECT status::text AS status, completed_at FROM study_sessions WHERE id = $1", [lapsed.s.sessionId])).toEqual({ status: "completed", completed_at: closes.closes_at });
      expect((await state(away.sessionId)).status).toBe("abandoned");
      expect((await state(waiting.s.sessionId)).status).toBe("in_progress");
      expect((await state(here.sessionId)).status).toBe("in_progress");
      expect(await closeStaleSessions(t.pool, study.id)).toEqual([]);
      await expect(returnForDelayedTest(t.pool, { studyCode: lapsed.study.slug, participantCode: (await state(lapsed.s.sessionId)).participantCode })).rejects.toMatchObject({ code: "session_closed" });
    });

    it("schedules the delayed test when the last immediate step is submitted, timed from that step, and never moves it when ending sessions by timing", async () => {
      const { study, s } = await atDelayedTest();
      expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM delayed_test_schedule WHERE session_id = $1", [s.sessionId])).n).toBe(1);
      expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM audit_log WHERE entity_id = $1 AND action = 'study.delayed_test_scheduled'", [s.sessionId])).n).toBe(1);
      const participantCode = (await state(s.sessionId)).participantCode;
      await t.pool.query("UPDATE delayed_test_schedule SET opens_at = now() - interval '1 hour' WHERE session_id = $1", [s.sessionId]);
      expect(await returnForDelayedTest(t.pool, { studyCode: study.slug, participantCode })).toMatchObject({ sessionId: s.sessionId, availability: "open" });
      await t.pool.query(
        "UPDATE delayed_test_schedule SET opens_at = d.closes_at - interval '8 days', returned_at = NULL FROM (SELECT closes_at FROM delayed_test_schedule WHERE session_id = $1) d WHERE session_id = $1",
        [s.sessionId],
      );
      await t.pool.query("UPDATE study_sessions SET started_at = now() - interval '11 days', last_activity_at = now() - interval '10 days' WHERE id = $1", [s.sessionId]);
      expect(await closeStaleSessions(t.pool, study.id)).toEqual([]);
      expect((await state(s.sessionId)).status).toBe("in_progress");

      expect(await position(s.sessionId)).toMatchObject({ step: "delayed_test" });
      const timed = await one<{ opens: boolean; closes: boolean }>(
        t.pool,
        `SELECT d.opens_at = e.at + interval '6 days' AS opens, d.closes_at = e.at + interval '14 days' AS closes
           FROM delayed_test_schedule d,
                (SELECT date_trunc('milliseconds', max(occurred_at)) AS at FROM audit_log WHERE entity_id = $1 AND action = 'study.step_completed' AND after->>'step' <> 'delayed_test') e
          WHERE d.session_id::text = $1`,
        [s.sessionId],
      );
      expect(timed).toEqual({ opens: true, closes: true });
      const before = await one(t.pool, "SELECT opens_at, due_at, closes_at, missed_at FROM delayed_test_schedule WHERE session_id = $1", [s.sessionId]);
      expect(await closeStaleSessions(t.pool, study.id)).toEqual([]);
      expect(await one(t.pool, "SELECT opens_at, due_at, closes_at, missed_at FROM delayed_test_schedule WHERE session_id = $1", [s.sessionId])).toEqual(before);
    });
  });

  it("applies one device rule before allocation, with no door known", async () => {
    for (const policy of ["retry", "exclude", "reassign"] as const) {
      const study = await activeStudy({ steps: BASIC_STEPS, webglFailurePolicy: policy, device: { minViewport: { width: 1024, height: 600 } } }, BASIC);
      const s = await consented(study);
      await pre(s.sessionId);
      expect((await state(s.sessionId)).condition).toBeNull();
      expect(await recordDeviceCheck(t.pool, s.sessionId, report(2, 800, 600))).toMatchObject({ kind: "retry", reason: "viewport_too_small" });
      const out = await recordDeviceCheck(t.pool, s.sessionId, report(null));
      if (policy === "exclude") {
        expect(out).toEqual({ kind: "excluded" });
        expect(await one(t.pool, "SELECT excluded, status FROM study_sessions WHERE id = $1", [s.sessionId])).toEqual({ excluded: true, status: "abandoned" });
      } else if (policy === "reassign") {
        expect(out).toEqual({ kind: "passed" });
        expect(await position(s.sessionId)).toEqual({ kind: "allocation" });
      } else {
        expect(out).toEqual({ kind: "retry", reason: "webgl_unavailable" });
        expect(await position(s.sessionId)).toEqual({ kind: "device_check" });
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
