/**
 * Assessment services against a fresh database: participant concept-map save/load with the
 * edit log, phase selection, cross-participant isolation, expert reference maps (agreement,
 * consensus, ties flagged and adjudicated), typed/directed scoring through the library,
 * published-definition immutability, rubric ratings with agreement, keyed items.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emptyState, reduceMap, toPayload, type EditorRules, type MapAction, type MapState } from "@/components/assessment/map-state";
import { getScore, scoreConceptMap } from "@/features/assessment/scoring";
import { type AssessmentError } from "@/server/assessment/common";
import { conceptSetFromTables } from "@/server/assessment/concept-set";
import { createAssessment, createNewVersion, createRubric, lockRubric, publishAssessment, saveItem, updateAssessmentMeta } from "@/server/assessment/definitions";
import { loadReconstructionTask, saveParticipantMap, type ParticipantIdentity } from "@/server/assessment/participant-maps";
import { createReferenceMap, finaliseReferenceMap, getReferenceWorkspace, lockReferenceMap, recordAdjudication, submitRaterMap } from "@/server/assessment/reference-maps";
import { listMapScores, mapBreakdown, rateResponse, rubricAgreement, rubricQueue, scoreConceptMaps, scoreKeyedItems } from "@/server/assessment/scoring";

import {
  createPublishedManifest,
  createRealGraph,
  createSession,
  createStudy,
  createTestDatabase,
  createUser,
  FAKE_SHA256,
  one,
  publishSnapshot,
  snapshotPayloadSkeleton,
  TEST_URL,
  type TestDb,
} from "./schema-harness";

const run = TEST_URL ? describe : describe.skip;

let t: TestDb;
let researcher: string;
let raterA: string;
let raterB: string;
let adjudicator: string;
let keys: string[];
let assessmentId: string;
let itemId: string;
let studyId: string;
let conds: { c2d: string; c3d: string };
let p1: ParticipantIdentity;
let p2: ParticipantIdentity;
let rules: EditorRules;

const TS = "2026-01-01T00:00:00.000Z";

async function expectError(p: Promise<unknown>, code: AssessmentError["code"]) {
  await expect(p).rejects.toMatchObject({ name: "AssessmentError", code });
}

/** Publishes a snapshot whose payload carries the given concepts and relationship types. */
async function publishTestSnapshot(label: string, conceptKeys: string[], typeCodes: string[]): Promise<string> {
  const concepts = (await t.pool.query<{ id: string; key: string; title: string; category: string }>("SELECT id, key, title, category_code AS category FROM concepts WHERE key = ANY($1::text[])", [conceptKeys])).rows;
  const types = (await t.pool.query<{ code: string; label: string; directed: boolean }>("SELECT code, label, directed FROM relationship_types WHERE code = ANY($1::text[])", [typeCodes])).rows;
  const payload = {
    ...snapshotPayloadSkeleton(label, false, true),
    concepts: concepts.map((c) => ({ ...c, claims: [], assetIds: [] })),
    relationshipTypes: types,
  };
  const snap = await one<{ id: string }>(
    t.pool,
    "INSERT INTO content_snapshots (version_label, title, payload, includes_unverified, is_demo) VALUES ($1, $2, $3, true, false) RETURNING id",
    [label, `Snapshot ${label}`, JSON.stringify(payload)],
  );
  for (const c of concepts) await t.pool.query("INSERT INTO snapshot_items (snapshot_id, item_kind, entity_ref, item_sha256) VALUES ($1, 'concept', $2, $3)", [snap.id, c.id, FAKE_SHA256]);
  for (const ty of types) await t.pool.query("INSERT INTO snapshot_items (snapshot_id, item_kind, entity_ref, item_sha256) VALUES ($1, 'relationship_type', $2, $3)", [snap.id, ty.code, FAKE_SHA256]);
  await publishSnapshot(t.pool, snap.id, researcher);
  return snap.id;
}

function build(state: MapState, actions: MapAction[]): MapState {
  return actions.reduce((s, a) => reduceMap(s, a, rules, () => TS), state);
}

async function blankState(): Promise<MapState> {
  const set = await conceptSetFromTables(t.pool, { kind: "concept_map", conceptKeys: keys, relationshipTypes: ["PRECEDES", "USES", "SIMILAR_TO"], directed: true });
  return emptyState(set.concepts);
}

run("assessment services", () => {
  beforeAll(async () => {
    t = await createTestDatabase("assess_svc");
    researcher = await createUser(t.pool);
    raterA = await createUser(t.pool);
    raterB = await createUser(t.pool);
    adjudicator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "asv" });
    // Two more concepts in other categories (structure only; titles are test labels).
    for (const [name, type, cat] of [
      ["mat-1", "material", "materials"],
      ["out-1", "outcome", "production_outcomes"],
    ] as const) {
      await t.pool.query(
        `INSERT INTO concepts (key, slug, type, category_code, tradition_id, title, provenance_kind, verification_state)
         VALUES ($1, $2, $3, $4, $5, $6, 'historical_documentation', 'under_review')`,
        [`asv.${type}.${name}`, `asv-${type}-${name}`, type, cat, g.traditionId, `Test ${name}`],
      );
    }
    keys = ["asv.process_stage.step-1", "asv.process_stage.step-2", "asv.material.mat-1", "asv.outcome.out-1"];
    rules = { relationshipTypes: [{ code: "PRECEDES", label: "precedes", directed: true }, { code: "USES", label: "uses", directed: true }, { code: "SIMILAR_TO", label: "is similar to", directed: false }], directedLinks: true };

    assessmentId = await createAssessment(t.pool, researcher, { code: "recon-test", kind: "reconstruction", title: "Reconstruction (test)" });
    itemId = await saveItem(t.pool, assessmentId, {
      itemKey: "map",
      position: 0,
      kind: "concept_map",
      prompt: "Connect the concepts.",
      config: { kind: "concept_map", conceptKeys: keys, relationshipTypes: ["PRECEDES", "USES", "SIMILAR_TO"], directed: true },
    });
    await updateAssessmentMeta(t.pool, assessmentId, {
      title: "Reconstruction (test)",
      description: null,
      instrumentName: null,
      instrumentCitation: null,
      isValidatedInstrument: false,
      scoring: { validityLevel: "directed_labelled" },
    });
    await publishAssessment(t.pool, researcher, assessmentId);
    // A published snapshot that carries the concept set (sessions read labels from it).
    const snapshotId = await publishTestSnapshot("v-assess", keys, ["PRECEDES", "USES", "SIMILAR_TO"]);
    const manifestId = await createPublishedManifest(t.pool, snapshotId);
    const s = await createStudy(t.pool, { slug: "assess-svc", snapshotId, manifestId, allowUnverified: true });
    studyId = s.studyId;
    conds = s.conditionIds;
    await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) VALUES ($1, $2, 'pre', 0), ($1, $2, 'post', 0)", [studyId, assessmentId]);
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
    p1 = await createSession(t.pool, studyId, conds.c2d, "P-001", 0);
    p2 = await createSession(t.pool, studyId, conds.c3d, "P-002", 1);
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("saves and reloads the raw map with its edit log; autosaves extend the log; final freezes it", async () => {
    const task = await loadReconstructionTask(t.pool, p1);
    expect(task.kind).toBe("task");
    if (task.kind !== "task") return;
    expect(task.phase).toBe("pre");
    expect(task.set.concepts.map((c) => c.nodeKey)).toEqual(["c1", "c2", "c3", "c4"]);

    let s = build(emptyState(task.set.concepts), [
      { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form" },
      { type: "move_node", nodeKey: "c3", x: 10.4, y: 20.6, via: "canvas" },
    ]);
    const first = await saveParticipantMap(t.pool, p1, { itemId, payload: toPayload(s), final: false });
    expect(first.revision).toBe(1);

    s = build(s, [
      { type: "add_edge", source: "c2", target: "c3", relationshipType: "USES", via: "canvas" },
      { type: "retype_edge", edgeKey: "e2", relationshipType: "PRECEDES", via: "form" },
      { type: "reverse_edge", edgeKey: "e2", via: "form" },
      { type: "add_edge", source: "c1", target: "c4", relationshipType: "USES", via: "form" },
      { type: "delete_edge", edgeKey: "e3", via: "form" },
    ]);
    const second = await saveParticipantMap(t.pool, p1, { itemId, payload: toPayload(s), final: false });
    expect(second.revision).toBe(2);

    const reloaded = await loadReconstructionTask(t.pool, p1);
    if (reloaded.kind !== "task" || !reloaded.map) throw new Error("map not reloaded");
    expect(reloaded.map.payload).toEqual(toPayload(s));
    expect(reloaded.map.payload.editLog.map((l) => l.op)).toEqual(["add_edge", "move_node", "add_edge", "retype_edge", "reverse_edge", "add_edge", "delete_edge"]);
    expect(reloaded.map.payload.nodes.find((n) => n.key === "c3")).toMatchObject({ x: 10, y: 21 });

    const edges = await t.pool.query("SELECT edge_key, source_node_key, target_node_key, relationship_type_code, directed FROM concept_map_edges WHERE concept_map_id = $1 ORDER BY edge_key", [second.conceptMapId]);
    expect(edges.rows).toEqual([
      { edge_key: "e1", source_node_key: "c1", target_node_key: "c2", relationship_type_code: "PRECEDES", directed: true },
      { edge_key: "e2", source_node_key: "c3", target_node_key: "c2", relationship_type_code: "PRECEDES", directed: true },
    ]);

    // A save that rewrites history (e.g. a stale second tab) is refused.
    const stale = { ...toPayload(s), editLog: s.editLog.slice(0, 1) };
    await expectError(saveParticipantMap(t.pool, p1, { itemId, payload: stale, final: false }), "conflict");

    const done = await saveParticipantMap(t.pool, p1, { itemId, payload: toPayload(s), final: true });
    expect(done.isFinal).toBe(true);
    await expectError(saveParticipantMap(t.pool, p1, { itemId, payload: toPayload(s), final: false }), "immutable");
    const revs = await t.pool.query<{ revision: number; is_final: boolean }>("SELECT revision, is_final FROM concept_map_revisions WHERE concept_map_id = $1 ORDER BY revision", [done.conceptMapId]);
    expect(revs.rows.map((r) => r.revision)).toEqual([1, 2, 3]);
    expect(revs.rows.at(-1)?.is_final).toBe(true);
    // The raw graph is stored, never just a score.
    const scores = await t.pool.query("SELECT 1 FROM derived_scores WHERE concept_map_id = $1", [done.conceptMapId]);
    expect(scores.rowCount).toBe(0);
  });

  it("refuses tampered payloads and overwrites client labels", async () => {
    const s = await blankState();
    const tampered = toPayload(build(s, [{ type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form" }]));
    await expectError(saveParticipantMap(t.pool, p2, { itemId, payload: { ...tampered, edges: [{ ...tampered.edges[0]!, relationshipType: "CAUSES" }] }, final: false }), "invalid");
    await expectError(saveParticipantMap(t.pool, p2, { itemId, payload: { ...tampered, edges: [{ ...tampered.edges[0]!, directed: false }] }, final: false }), "invalid");
    await expectError(saveParticipantMap(t.pool, p2, { itemId, payload: { ...tampered, edges: [{ ...tampered.edges[0]!, required: true }] }, final: false }), "invalid");
    await expectError(saveParticipantMap(t.pool, p2, { itemId, payload: { ...tampered, nodes: tampered.nodes.slice(1) }, final: false }), "invalid");
    const relabelled = { ...tampered, nodes: tampered.nodes.map((n) => ({ ...n, label: "Injected" })) };
    const saved = await saveParticipantMap(t.pool, p2, { itemId, payload: relabelled, final: false });
    const row = await one<{ nodes: Array<{ label: string }> }>(t.pool, "SELECT nodes FROM concept_maps WHERE id = $1", [saved.conceptMapId]);
    expect(row.nodes.map((n) => n.label)).not.toContain("Injected");
  });

  it("denies cross-participant access: a session can only be used by its own participant", async () => {
    const forged: ParticipantIdentity = { participantId: p2.participantId, sessionId: p1.sessionId };
    await expectError(loadReconstructionTask(t.pool, forged), "forbidden");
    const s = await blankState();
    await expectError(saveParticipantMap(t.pool, forged, { itemId, payload: toPayload(s), final: false }), "forbidden");
    // p2's own save never touches p1's (final) map.
    const before = await one<{ revision: number }>(t.pool, "SELECT revision FROM concept_maps WHERE session_id = $1 AND phase = 'pre'", [p1.sessionId]);
    const task2 = await loadReconstructionTask(t.pool, p2);
    if (task2.kind !== "task" || !task2.map) throw new Error("expected p2 map");
    expect(task2.map.payload.nodes.every((n) => n.label !== "Injected")).toBe(true);
    // Same task for both conditions (p1 is 2D, p2 is 3D): the editor input does not depend on the condition.
    const task1 = await loadReconstructionTask(t.pool, p1);
    if (task1.kind !== "task") throw new Error("expected p1 task");
    expect(task2.set).toEqual(task1.set);
    expect([task2.itemId, task2.prompt, task2.phase]).toEqual([task1.itemId, task1.prompt, task1.phase]);
    const after = await one<{ revision: number }>(t.pool, "SELECT revision FROM concept_maps WHERE session_id = $1 AND phase = 'pre'", [p1.sessionId]);
    expect(after.revision).toBe(before.revision);
  });

  it("switches to the post administration once learning has started", async () => {
    await t.pool.query("UPDATE study_sessions SET learning_started_at = now() WHERE id = $1", [p1.sessionId]);
    const task = await loadReconstructionTask(t.pool, p1);
    if (task.kind !== "task") throw new Error("expected task");
    expect(task.phase).toBe("post");
    expect(task.map).toBeNull();
    // Post map: c1 PRECEDES c2 (correct), c3 PRECEDES c2 (direction reversed vs c2 PRECEDES c3), c2 USES c3 (wrong type), c3 SIMILAR_TO c4.
    const s = build(emptyState(task.set.concepts), [
      { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form" },
      { type: "add_edge", source: "c3", target: "c2", relationshipType: "PRECEDES", via: "form" },
      { type: "add_edge", source: "c2", target: "c3", relationshipType: "USES", via: "form" },
      { type: "add_edge", source: "c4", target: "c3", relationshipType: "SIMILAR_TO", via: "form" },
    ]);
    expect(s.edges.find((e) => e.relationshipType === "SIMILAR_TO")?.directed).toBe(false);
    const r = await saveParticipantMap(t.pool, p1, { itemId, payload: toPayload(s), final: true });
    expect(r.isFinal).toBe(true);
  });

  it("keeps published definitions immutable and versions them", async () => {
    await expectError(saveItem(t.pool, assessmentId, { itemKey: "extra", position: 1, kind: "short_text", prompt: "x", config: { kind: "short_text" } }), "immutable");
    await expectError(
      updateAssessmentMeta(t.pool, assessmentId, { title: "Changed", description: null, instrumentName: null, instrumentCitation: null, isValidatedInstrument: false }),
      "immutable",
    );
    await expect(t.pool.query("UPDATE assessments SET title = 'x' WHERE id = $1", [assessmentId])).rejects.toThrow(/locked assessments are immutable/);
    await expect(t.pool.query("UPDATE assessment_items SET prompt = 'x' WHERE assessment_id = $1", [assessmentId])).rejects.toThrow(/locked parent/);
    const v2 = await createNewVersion(t.pool, researcher, assessmentId);
    const row = await one<{ version: number; status: string; n: string }>(
      t.pool,
      "SELECT a.version, a.status, (SELECT count(*) FROM assessment_items i WHERE i.assessment_id = a.id) AS n FROM assessments a WHERE a.id = $1",
      [v2],
    );
    expect(row).toEqual({ version: 2, status: "draft", n: "1" });
    // A draft version has no fixed concept set yet: no reference map.
    await expectError(createReferenceMap(t.pool, researcher, v2, { title: "Too early" }), "invalid");
  });

  it("builds a consensus reference map, flags ties for adjudication and records the adjudicator", async () => {
    const refId = await createReferenceMap(t.pool, researcher, assessmentId, { title: "Expert map" });
    const base = await blankState();
    // Both raters: c1 PRECEDES c2 (expected), c2 PRECEDES c3 (expected). Only rater A: c2 USES c3 -> 1 of 2 = tie.
    const a = build(base, [
      { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form", required: true },
      { type: "add_edge", source: "c2", target: "c3", relationshipType: "PRECEDES", via: "form", required: true },
      { type: "add_edge", source: "c2", target: "c3", relationshipType: "USES", via: "form", required: true },
    ]);
    const b = build(base, [
      { type: "add_edge", source: "c1", target: "c2", relationshipType: "PRECEDES", via: "form", required: true },
      { type: "add_edge", source: "c2", target: "c3", relationshipType: "PRECEDES", via: "form", required: true },
    ]);
    await submitRaterMap(t.pool, raterA, refId, toPayload(a));
    await submitRaterMap(t.pool, raterB, refId, toPayload(b));

    const ws = await getReferenceWorkspace(t.pool, refId, raterA);
    expect(ws.raters).toHaveLength(2);
    expect(ws.ownSubmission).toEqual(toPayload(a));
    expect(ws.agreement?.items).toBe(3);
    expect(ws.agreement?.percentAgreement).toBeCloseTo(2 / 3, 10);
    expect(ws.consensus?.unresolved).toHaveLength(1);
    const tie = ws.consensus!.edges.find((e) => e.decision === "disputed")!;
    expect(tie.type).toBe("USES");
    expect(tie.agreement).toBe(0.5);

    await expectError(finaliseReferenceMap(t.pool, researcher, refId, null), "invalid");
    await recordAdjudication(t.pool, adjudicator, refId, { key: tie.key, decision: "excluded", note: "Not supported by the content." });
    await expectError(recordAdjudication(t.pool, researcher, refId, { key: tie.key, decision: "expected" }), "forbidden");
    await finaliseReferenceMap(t.pool, adjudicator, refId, "Adjudicated in test.");
    await expectError(submitRaterMap(t.pool, raterA, refId, toPayload(a)), "immutable");

    const ref = await one<{ status: string; adjudicated_by: string }>(t.pool, "SELECT status, adjudicated_by FROM reference_maps WHERE id = $1", [refId]);
    expect(ref).toEqual({ status: "adjudicated", adjudicated_by: adjudicator });
    const edges = await t.pool.query<{ relationship_type_code: string; required: boolean; agreement: number }>(
      "SELECT relationship_type_code, required, agreement FROM reference_map_edges WHERE reference_map_id = $1",
      [refId],
    );
    expect(edges.rows).toHaveLength(2);
    expect(edges.rows.every((e) => e.relationship_type_code === "PRECEDES" && e.required && e.agreement === 1)).toBe(true);
    const adj = await one<{ submission: { adjudications: Array<{ decision: string; adjudicatorId: string }> } }>(
      t.pool,
      "SELECT submission FROM reference_map_raters WHERE reference_map_id = $1 AND role = 'adjudicator'",
      [refId],
    );
    expect(adj.submission.adjudications).toMatchObject([{ decision: "excluded", adjudicatorId: adjudicator }]);

    // Scoring: typed + directed edges through the library, against the adjudicated reference.
    const run1 = await scoreConceptMaps(t.pool, researcher, refId);
    expect(run1).toMatchObject({ maps: 2, changePairs: 1, alreadyStored: 0 });
    expect(run1.inserted).toBeGreaterThan(0);
    const rerun = await scoreConceptMaps(t.pool, researcher, refId);
    expect(rerun).toMatchObject({ inserted: 0, alreadyStored: run1.inserted });

    const post = await one<{ id: string }>(t.pool, "SELECT id FROM concept_maps WHERE session_id = $1 AND phase = 'post'", [p1.sessionId]);
    const val = async (metric: string) =>
      (await one<{ value: number | null }>(t.pool, "SELECT value FROM derived_scores WHERE concept_map_id = $1 AND reference_map_id = $2 AND metric_name = $3", [post.id, refId, metric])).value;
    expect(await val("cmap.valid_relationships")).toBe(1);
    expect(await val("cmap.incorrect_relationships")).toBe(3);
    expect(await val("cmap.missing_expected_relationships")).toBe(1);
    expect(await val("cmap.cross_category.total")).toBe(3);

    const breakdown = await mapBreakdown(t.pool, post.id, refId);
    expect(breakdown.parametersSource).toBe("stored");
    expect(breakdown.mismatches).toEqual([]);
    expect(Object.fromEntries(breakdown.result.participantEdges.map((e) => [e.edgeKey, e.class]))).toEqual({ e1: "correct", e2: "wrong_direction", e3: "wrong_type", e4: "unsupported" });
    expect(breakdown.change?.scores.find((s) => s.metricName === "cmap.change.added")?.value).toBe(2);
    // Same numbers as calling the library directly on the stored raw map.
    const postTask = await loadReconstructionTask(t.pool, p1);
    if (postTask.kind !== "task" || !postTask.map) throw new Error("expected post map");
    const direct = scoreConceptMap(postTask.map.payload, breakdown.reference.input, { validityLevel: "directed_labelled" }, { conceptCategories: breakdown.set.categories });
    expect(direct.scores.map((x) => [x.metricName, x.value])).toEqual(breakdown.result.scores.map((x) => [x.metricName, x.value]));
    expect(getScore(direct, "cmap.valid_relationships")).toBe(1);

    const rows = await listMapScores(t.pool, refId);
    expect(rows.map((r) => [r.participantCode, r.phase, r.scored])).toEqual([
      ["P-001", "pre", true],
      ["P-001", "post", true],
    ]);

    await lockReferenceMap(t.pool, researcher, refId);
    await expect(t.pool.query("UPDATE reference_maps SET title = 'x' WHERE id = $1", [refId])).rejects.toThrow(/immutable/);
  });

  it("collects rubric ratings from several raters with agreement, and scores keyed items", async () => {
    const tid = await createAssessment(t.pool, researcher, { code: "transfer-test", kind: "transfer", title: "Transfer (test)" });
    const textItem = await saveItem(t.pool, tid, { itemKey: "why", position: 0, kind: "long_text", prompt: "Explain why.", config: { kind: "long_text" } });
    const choiceItem = await saveItem(t.pool, tid, {
      itemKey: "mc",
      position: 1,
      kind: "single_choice",
      prompt: "Pick one.",
      config: { kind: "single_choice", options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }] },
      answerKey: { optionId: "b" },
    });
    await expectError(saveItem(t.pool, tid, { itemKey: "bad", position: 2, kind: "single_choice", prompt: "x", config: { kind: "single_choice", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }, answerKey: { optionId: "zz" } }), "invalid");
    await publishAssessment(t.pool, researcher, tid);
    const rubricId = await createRubric(t.pool, researcher, tid, textItem, [
      { value: 0, label: "None", descriptor: "No explanation." },
      { value: 1, label: "Partial", descriptor: "Partial explanation." },
      { value: 2, label: "Full", descriptor: "Complete explanation." },
    ]);
    const responses: string[] = [];
    for (const [who, text, choice] of [
      [p1, "answer one", "b"],
      [p2, "answer two", "a"],
    ] as const) {
      const r = await one<{ id: string }>(
        t.pool,
        `INSERT INTO responses (session_id, participant_id, assessment_id, item_id, status, raw, answered_at) VALUES ($1, $2, $3, $4, 'answered', $5, now()) RETURNING id`,
        [who.sessionId, who.participantId, tid, textItem, JSON.stringify({ text })],
      );
      responses.push(r.id);
      await t.pool.query(
        `INSERT INTO responses (session_id, participant_id, assessment_id, item_id, status, raw, answered_at) VALUES ($1, $2, $3, $4, 'answered', $5, now())`,
        [who.sessionId, who.participantId, tid, choiceItem, JSON.stringify({ optionId: choice })],
      );
    }
    await expectError(rateResponse(t.pool, raterA, rubricId, responses[0]!, 2), "invalid"); // rubric not yet published
    await lockRubric(t.pool, researcher, rubricId);
    await rateResponse(t.pool, raterA, rubricId, responses[0]!, 2);
    await rateResponse(t.pool, raterA, rubricId, responses[1]!, 1);
    await rateResponse(t.pool, raterB, rubricId, responses[0]!, 2);
    await rateResponse(t.pool, raterB, rubricId, responses[1]!, 0);
    await expectError(rateResponse(t.pool, raterB, rubricId, responses[1]!, 1), "immutable");
    await expectError(rateResponse(t.pool, raterB, rubricId, responses[1]!, 7), "invalid");

    const queue = await rubricQueue(t.pool, rubricId, raterA);
    expect(queue.items.map((i) => i.myRating).sort()).toEqual([1, 2]);
    expect(queue.items.every((i) => i.ratingCount === 2 && !i.label.includes("P-00"))).toBe(true);
    const agreement = await rubricAgreement(t.pool, rubricId);
    expect(agreement).toMatchObject({ raters: 2, responsesRated: 2, completeItems: 2, percentAgreement: 0.5 });
    expect(agreement.pairwise[0]).toMatchObject({ n: 2, percentAgreement: 0.5 });

    const keyed = await scoreKeyedItems(t.pool, researcher, tid);
    expect(keyed).toEqual({ responses: 2, inserted: 2 });
    const values = await t.pool.query<{ participant_id: string; value: number }>("SELECT participant_id, value FROM derived_scores WHERE assessment_id = $1 AND metric_name = 'item.key_match'", [tid]);
    expect(Object.fromEntries(values.rows.map((r) => [r.participant_id, r.value]))).toEqual({ [p1.participantId]: 1, [p2.participantId]: 0 });
  });
});
