/**
 * Integration: final-review fixes of the study engine (src/server/study/engine.ts) and the
 * dashboard attribution after a reassignment, against a throwaway database.
 *  - study-01   the device check refuses what the museum refuses; a WebGL failure reported by
 *               the museum later applies the WebGL-failure policy;
 *  - study-02 / security-06  learning content only during the learning step;
 *  - study-03   attempts per participant; SSQ phase and condition after a reassignment;
 *  - study-04   an all-blank keyed pre-test scores 0 (stratum "low"), not a refusal;
 *  - study-09 / security-03  presentation stamps and map saves only for the current step;
 *  - database-02  the stratification reference map is the one pinned at activation.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadDashboard } from "../../src/server/research/dashboard";
import {
  allocateSession,
  completeOnboarding,
  currentReconstructionPhase,
  enrolParticipant,
  findEnrollableStudy,
  learningStepIsCurrent,
  listStepAssessments,
  loadSessionState,
  markAssessmentPresented,
  openSessionAfterConsent,
  recordConsent,
  recordDeviceCheck,
  recordMuseumWebglFailure,
  startFamiliarisation,
  completeFamiliarisation,
  submitAssessment,
  syncPosition,
  type DeviceReport,
  type EnrollableStudy,
  type OpenedSession,
} from "../../src/server/study/engine";
import { seedInstrumentDefinitions } from "../../src/server/study/instruments";
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

const CONSENT = { version: "c-1.0", text: "Test consent text written for this test." };
const BUILD = "test-build";
const report = (webgl: 1 | 2 | null, softwareRenderer = false): DeviceReport => ({ viewport: { width: 1280, height: 800 }, webglVersion: webgl, softwareRenderer, inputDevices: ["keyboard", "mouse"] });

describe.skipIf(!TEST_URL)("study engine: final review fixes", { timeout: 60_000 }, () => {
  let t: TestDb;
  let snapshotId: string;
  let manifestId: string;
  let curator: string;
  let conceptIds: [string, string];
  let n = 0;
  const ids: Record<string, string> = {};

  async function assessment(code: string, kind: string, items: { key: string; kind: string; prompt: string; config: unknown; answerKey?: unknown }[]) {
    const a = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ($1, 1, $2, $3) RETURNING id", [code, kind, `Test ${code}`]);
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
  }

  async function activeStudy(config: Record<string, unknown>, battery: [string, "pre" | "post"][]): Promise<EnrollableStudy> {
    const slug = `fix-${++n}`;
    const s = await createStudy(t.pool, { slug, snapshotId, manifestId });
    for (const [i, [code, phase]] of battery.entries()) {
      await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) SELECT $1, id, $2, $3 FROM assessments WHERE code = $4 AND status = 'locked'", [s.studyId, phase, i, code]);
    }
    await t.pool.query("UPDATE studies SET config = $2::jsonb, status = 'active' WHERE id = $1", [
      s.studyId,
      JSON.stringify({ traditionSlugs: ["fx-tradition"], consent: CONSENT, allocation: { algorithm: "block", seed: `seed-${slug}` }, exposure: { mode: "self_paced" }, ...config }),
    ]);
    return findEnrollableStudy(t.pool, slug);
  }

  async function consented(study: EnrollableStudy): Promise<OpenedSession> {
    const p = await enrolParticipant(t.pool, study);
    await recordConsent(t.pool, { participantId: p.participantId, study, decision: "granted", shownVersion: CONSENT.version });
    return openSessionAfterConsent(t.pool, { participantId: p.participantId, studyId: study.id, appBuild: BUILD });
  }
  const state = async (sessionId: string) => (await loadSessionState(t.pool, sessionId))!;
  const position = async (sessionId: string, arrivedAtHub = false) => syncPosition(t.pool, await state(sessionId), { arrivedAtHub });
  const pre = (sessionId: string, values: Record<string, string[]> = {}) => submitAssessment(t.pool, { sessionId, step: "pre_test", assessmentId: ids["fx-pre"]!, values });

  /** Consent, pre-test and allocation until the session lands in `condition`. */
  async function allocatedTo(study: EnrollableStudy, condition: "2d" | "immersive", beforePre?: (s: OpenedSession) => Promise<void>): Promise<OpenedSession> {
    for (let i = 0; i < 12; i++) {
      const s = await consented(study);
      await beforePre?.(s);
      await pre(s.sessionId);
      const a = await allocateSession(t.pool, s.sessionId);
      if (a.condition === condition) return { ...s, condition: a.condition, conditionId: a.conditionId };
    }
    throw new Error(`no ${condition} allocation in 12 draws`);
  }

  async function finalPreMap(s: OpenedSession, withEdge: boolean) {
    const nodes = conceptIds.map((c, i) => ({ key: `n${i}`, conceptId: c, label: `c${i}`, x: 0, y: 0 }));
    const m = await one<{ id: string }>(
      t.pool,
      `INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, raw) VALUES ($1, $2, $3, $4, 'pre', $5::jsonb, '{}') RETURNING id`,
      [s.sessionId, s.participantId, ids["fx-premap"], ids["fx-premap:map"], JSON.stringify(nodes)],
    );
    if (withEdge) {
      await t.pool.query(
        "INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key, source_concept_id, target_concept_id, relationship_type_code, directed) VALUES ($1, 'e1', 'n0', 'n1', $2, $3, 'PRECEDES', true)",
        [m.id, conceptIds[0], conceptIds[1]],
      );
    }
    await t.pool.query("UPDATE concept_maps SET is_final = true, submitted_at = now() WHERE id = $1", [m.id]);
  }

  async function referenceMap(version: number, from: string, to: string): Promise<string> {
    const ref = await one<{ id: string }>(
      t.pool,
      `INSERT INTO reference_maps (assessment_id, version, title, nodes, status, adjudicated_by, adjudicated_at)
       VALUES ($1, $2, 'Reference', $3::jsonb, 'adjudicated', $4, now()) RETURNING id`,
      [ids["fx-premap"], version, JSON.stringify(conceptIds.map((c) => ({ conceptId: c, label: c }))), curator],
    );
    await t.pool.query(
      "INSERT INTO reference_map_edges (reference_map_id, source_concept_id, target_concept_id, relationship_type_code, directed, required) VALUES ($1, $2, $3, 'PRECEDES', true, true)",
      [ref.id, from, to],
    );
    await t.pool.query("UPDATE reference_maps SET status = 'locked' WHERE id = $1", [ref.id]);
    return ref.id;
  }

  beforeAll(async () => {
    t = await createTestDatabase("study_fix");
    curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "fx", acceptBy: curator });
    conceptIds = g.conceptIds;
    snapshotId = await createSnapshot(t.pool, { label: "v-fix", createdBy: curator });
    await addSnapshotItem(t.pool, snapshotId, "concept", g.conceptIds[0]);
    await publishSnapshot(t.pool, snapshotId, curator);
    manifestId = await createPublishedManifest(t.pool, snapshotId, { by: curator });
    const choice = (id: string) => ({ id, label: `Option ${id}` });
    await assessment("fx-pre", "pretest", [
      { key: "q1", kind: "single_choice", prompt: "Pick b", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "b" } },
      { key: "q2", kind: "single_choice", prompt: "Pick a", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "a" } },
      { key: "why", kind: "long_text", prompt: "Why?", config: { kind: "long_text" } },
    ]);
    await assessment("fx-post", "posttest", [{ key: "q1", kind: "single_choice", prompt: "Pick a", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "a" } }]);
    const mapItem = { key: "map", kind: "concept_map", prompt: "Connect", config: { kind: "concept_map", conceptKeys: ["fx.process_stage.step-1", "fx.process_stage.step-2"], relationshipTypes: ["PRECEDES"], directed: true } };
    await assessment("fx-premap", "reconstruction", [mapItem]);
    await assessment("fx-recon", "reconstruction", [mapItem]);
    await seedInstrumentDefinitions(t.pool);
    await t.pool.query("UPDATE assessments SET status = 'locked', locked_at = now() WHERE code = 'ssq' AND status = 'draft'");
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  const BASIC_STEPS = ["pre_test", "onboarding", "learning", "post_test"];
  const BASIC: [string, "pre" | "post"][] = [["fx-pre", "pre"], ["fx-post", "post"]];

  it("study-01: the device check refuses a software renderer and WebGL 1 for the immersive condition only", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS, webglFailurePolicy: "retry" }, BASIC);
    const s3d = await allocatedTo(study, "immersive");
    expect(await recordDeviceCheck(t.pool, s3d.sessionId, report(2, true), { appBuild: BUILD })).toEqual({ kind: "retry", reason: "webgl_unavailable" });
    expect(await recordDeviceCheck(t.pool, s3d.sessionId, report(1), { appBuild: BUILD })).toEqual({ kind: "retry", reason: "webgl_unavailable" });
    expect(await recordDeviceCheck(t.pool, s3d.sessionId, report(2), { appBuild: BUILD })).toEqual({ kind: "passed" });
    const device = await one<{ device: { softwareRenderer?: boolean } }>(t.pool, "SELECT device FROM study_sessions WHERE id = $1", [s3d.sessionId]);
    expect(device.device.softwareRenderer).toBe(false);
    // The 2D condition does not depend on WebGL: the same report passes.
    const s2d = await allocatedTo(study, "2d");
    expect(await recordDeviceCheck(t.pool, s2d.sessionId, report(2, true), { appBuild: BUILD })).toEqual({ kind: "passed" });
  });

  it("study-01: a WebGL failure reported by the museum applies the policy (retry, exclude, reassign)", async () => {
    for (const policy of ["retry", "exclude", "reassign"] as const) {
      const study = await activeStudy({ steps: BASIC_STEPS, webglFailurePolicy: policy }, BASIC);
      const s = await allocatedTo(study, "immersive");
      expect(await recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD })).toEqual({ kind: "passed" });
      // Before the learning step the report is ignored (only practice and learning show the museum).
      expect(await recordMuseumWebglFailure(t.pool, s.sessionId, { webglVersion: 2, softwareRenderer: true }, { appBuild: BUILD })).toEqual({ kind: "ignored" });
      await completeOnboarding(t.pool, s.sessionId);
      const out = await recordMuseumWebglFailure(t.pool, s.sessionId, { webglVersion: 2, softwareRenderer: true }, { appBuild: BUILD });
      const failed = (await state(s.sessionId)).journal.find((e) => e.action === "study.webgl_failed");
      expect(failed?.after).toMatchObject({ step: "learning", policy, softwareRenderer: true, learningStarted: true });
      if (policy === "retry") {
        expect(out).toEqual({ kind: "retry", reason: "webgl_unavailable" });
        expect(await position(s.sessionId)).toEqual({ kind: "device_check" });
      } else if (policy === "exclude") {
        expect(out).toEqual({ kind: "excluded" });
        expect(await one(t.pool, "SELECT excluded, status FROM study_sessions WHERE id = $1", [s.sessionId])).toEqual({ excluded: true, status: "abandoned" });
      } else {
        expect(out).toMatchObject({ kind: "reassigned", condition: "2d" });
        if (out.kind !== "reassigned") return;
        // Only the condition-blind steps are carried: the participant gets the 2D introduction first.
        expect(await position(out.sessionId)).toMatchObject({ step: "onboarding" });
      }
    }
  });

  it("study-02: learning content only while the learning step is current", async () => {
    const study = await activeStudy({ steps: ["pre_test", "familiarisation", "onboarding", "learning", "post_test"], familiarisation: { minutes: 5 } }, BASIC);
    const s = await allocatedTo(study, "2d");
    expect(await learningStepIsCurrent(t.pool, s.sessionId)).toBe(false); // device check
    await recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD });
    await startFamiliarisation(t.pool, s.sessionId);
    expect(await learningStepIsCurrent(t.pool, s.sessionId)).toBe(false); // familiarisation
    await t.pool.query(
      "INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, occurred_at) VALUES ('system', 'test', 'study.familiarisation_started', 'study_session', $1, '{}', now() - interval '6 minutes')",
      [s.sessionId],
    );
    await completeFamiliarisation(t.pool, s.sessionId);
    expect(await learningStepIsCurrent(t.pool, s.sessionId)).toBe(false); // onboarding
    expect((await one<{ started: Date | null }>(t.pool, "SELECT learning_started_at AS started FROM study_sessions WHERE id = $1", [s.sessionId])).started).toBeNull();
    await completeOnboarding(t.pool, s.sessionId);
    expect(await learningStepIsCurrent(t.pool, s.sessionId)).toBe(true);
    expect(await position(s.sessionId, true)).toMatchObject({ step: "post_test" }); // self-paced: the hub ends learning
    expect(await learningStepIsCurrent(t.pool, s.sessionId)).toBe(false); // after learning: no content

    // Allocation at enrolment: the condition is known before the pre-test, the content is not served.
    const atConsent = await activeStudy({ steps: BASIC_STEPS, allocation: { algorithm: "block", seed: "enrol", point: "enrolment" } }, BASIC);
    const e = await consented(atConsent);
    expect(e.condition).not.toBeNull();
    expect(await learningStepIsCurrent(t.pool, e.sessionId)).toBe(false);
  });

  it("study-09: a presentation stamp is refused for any step but the current one", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS }, BASIC);
    const s = await allocatedTo(study, "2d");
    await recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD });
    await completeOnboarding(t.pool, s.sessionId);
    await expect(markAssessmentPresented(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: ids["fx-post"]! })).rejects.toMatchObject({ code: "not_current_step" });
    expect((await state(s.sessionId)).journal.some((e) => e.action === "study.assessment_started" && e.after.step === "post_test")).toBe(false);
    expect(await position(s.sessionId, true)).toMatchObject({ step: "post_test" });
    const first = await markAssessmentPresented(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: ids["fx-post"]! });
    const again = await markAssessmentPresented(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: ids["fx-post"]! });
    expect(again.presentedAt).toEqual(first.presentedAt);
  });

  it("security-03: the map-save gate names the current reconstruction phase only", async () => {
    const study = await activeStudy(
      { steps: ["pre_test", "pre_reconstruction", "onboarding", "learning", "post_test", "reconstruction"] },
      [["fx-pre", "pre"], ["fx-premap", "pre"], ["fx-post", "post"], ["fx-recon", "post"]],
    );
    const s = await consented(study);
    expect(await currentReconstructionPhase(t.pool, s.sessionId)).toBeNull(); // pre-test
    await pre(s.sessionId);
    expect(await currentReconstructionPhase(t.pool, s.sessionId)).toBe("pre");
    await finalPreMap(s, true);
    await allocateSession(t.pool, s.sessionId);
    await recordDeviceCheck(t.pool, s.sessionId, report(2), { appBuild: BUILD });
    await completeOnboarding(t.pool, s.sessionId);
    expect(await currentReconstructionPhase(t.pool, s.sessionId)).toBeNull(); // learning: no map save
    expect(await position(s.sessionId, true)).toMatchObject({ step: "post_test" });
    expect(await currentReconstructionPhase(t.pool, s.sessionId)).toBeNull();
    await submitAssessment(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: ids["fx-post"]!, values: {} });
    expect(await currentReconstructionPhase(t.pool, s.sessionId)).toBe("post");
  });

  it("study-04: a keyed pre-test left blank scores 0 (stratum low) instead of blocking allocation", async () => {
    const study = await activeStudy({ steps: BASIC_STEPS, allocation: { algorithm: "stratified_block", seed: "s", stratifyBy: { source: "pre_test_score", cutoff: 0 } } }, BASIC);
    const blank = await consented(study);
    await pre(blank.sessionId, {});
    await allocateSession(t.pool, blank.sessionId);
    const j = (await state(blank.sessionId)).journal.find((e) => e.action === "study.allocated")!;
    expect(j.after.stratum).toBe("low");
    expect(j.after.stratumSource).toMatchObject({ source: "pre_test_score", score: 0, keyedItems: 2, answeredKeyedItems: 0, skippedKeyedItems: 2 });
    const partial = await consented(study);
    await pre(partial.sessionId, { [ids["fx-pre:q1"]!]: ["b"] });
    await allocateSession(t.pool, partial.sessionId);
    const jp = (await state(partial.sessionId)).journal.find((e) => e.action === "study.allocated")!;
    expect(jp.after.stratumSource).toMatchObject({ score: 1, keyedItems: 2, answeredKeyedItems: 1, skippedKeyedItems: 1 });
    expect(jp.after.stratum).toBe("high");
  });

  it("database-02: stratification scores against the reference map pinned at activation", async () => {
    const v1 = await referenceMap(1, conceptIds[0], conceptIds[1]); // step-1 PRECEDES step-2
    const steps = ["pre_test", "pre_reconstruction", "onboarding", "learning", "post_test"];
    const battery: [string, "pre" | "post"][] = [["fx-pre", "pre"], ["fx-premap", "pre"], ["fx-post", "post"]];
    const pinned = await activeStudy({ steps, allocation: { algorithm: "stratified_block", seed: "p", stratifyBy: { source: "pre_map_recall", cutoff: 0.5, referenceMapId: v1 } } }, battery);
    // A later reference version (the reverse edge) is locked while the study runs.
    const v2 = await referenceMap(2, conceptIds[1], conceptIds[0]);
    const s = await consented(pinned);
    await pre(s.sessionId);
    await finalPreMap(s, true);
    await allocateSession(t.pool, s.sessionId);
    const j = (await state(s.sessionId)).journal.find((e) => e.action === "study.allocated")!;
    expect(j.after.stratumSource).toMatchObject({ referenceMapId: v1, referenceVersion: 1, referencePinned: true, score: 1 });
    expect(j.after.stratum).toBe("high");
    // Without a pin (a study activated before the fix) the newest locked map would have been used.
    const legacy = await activeStudy({ steps, allocation: { algorithm: "stratified_block", seed: "l", stratifyBy: { source: "pre_map_recall", cutoff: 0.5 } } }, battery);
    const l = await consented(legacy);
    await pre(l.sessionId);
    await finalPreMap(l, true);
    await allocateSession(t.pool, l.sessionId);
    const jl = (await state(l.sessionId)).journal.find((e) => e.action === "study.allocated")!;
    expect(jl.after.stratumSource).toMatchObject({ referenceMapId: v2, referencePinned: false, score: 0 });
  });

  it("study-03: after a reassignment the SSQ is attempt 1 and 2, pre and post, in the analysed (2D) condition", async () => {
    const steps = ["questionnaire_pre", "pre_test", "onboarding", "learning", "questionnaire_post_learning"];
    const study = await activeStudy({ steps, questionnaires: { pre: ["ssq"], postLearning: ["ssq"], end: [] }, webglFailurePolicy: "reassign" }, [["ssq", "pre"], ["fx-pre", "pre"]]);
    const ssqId = (await one<{ id: string }>(t.pool, "SELECT id FROM assessments WHERE code = 'ssq' AND status = 'locked' ORDER BY version DESC LIMIT 1")).id;
    const answerSsq = async (sessionId: string, step: "questionnaire_pre" | "questionnaire_post_learning", value: string) => {
      const [ssq] = await listStepAssessments(t.pool, await state(sessionId), step);
      await submitAssessment(t.pool, { sessionId, step, assessmentId: ssq!.id, values: Object.fromEntries(ssq!.items.map((i) => [i.id, [value]])) });
    };
    const s = await allocatedTo(study, "immersive", (x) => answerSsq(x.sessionId, "questionnaire_pre", "1"));
    const out = await recordDeviceCheck(t.pool, s.sessionId, report(null), { appBuild: BUILD });
    expect(out.kind).toBe("reassigned");
    if (out.kind !== "reassigned") return;
    await completeOnboarding(t.pool, out.sessionId);
    expect(await position(out.sessionId, true)).toMatchObject({ step: "questionnaire_post_learning" });
    await answerSsq(out.sessionId, "questionnaire_post_learning", "2");
    const attempts = await t.pool.query<{ session_id: string; attempt: number }>(
      "SELECT DISTINCT session_id, attempt FROM responses WHERE participant_id = $1 AND assessment_id = $2 ORDER BY attempt",
      [s.participantId, ssqId],
    );
    expect(attempts.rows).toEqual([{ session_id: s.sessionId, attempt: 1 }, { session_id: out.sessionId, attempt: 2 }]);

    const d = (await loadDashboard(t.pool, study.id))!;
    const c2d = (await one<{ id: string }>(t.pool, "SELECT id FROM study_conditions WHERE study_id = $1 AND interface = 'conventional_2d'", [study.id])).id;
    const ssq = (phase: string) => d.questionnaires.find((q) => q.key === "ssq.total" && q.phase === phase)!;
    // Every draw before the immersive one landed in 2D, and the immersive participant was reassigned
    // to 2D: no SSQ value may count in the immersive arm (before the fix the closed immersive
    // session's SSQ counted there as "pre", and the post-learning SSQ became a second "pre").
    for (const phase of ["pre", "post"]) {
      expect(ssq(phase).byCondition.filter((c) => c.conditionId !== c2d).every((c) => c.values.length === 0)).toBe(true);
    }
    const post2d = ssq("post").byCondition.find((c) => c.conditionId === c2d)!;
    expect(post2d.values).toHaveLength(1);
    expect(ssq("post").byCondition.filter((c) => c.conditionId !== c2d).every((c) => c.values.length === 0)).toBe(true);
  });
});
