/**
 * Integration: participant data removal (src/server/study/purge.ts; final review database-04 /
 * study-08, DR-030) against a throwaway database: on request and after the retention period,
 * what is removed and what is kept, the journal entry, and the refusals.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  allocateSession,
  completeOnboarding,
  completeSession,
  enrolParticipant,
  findEnrollableStudy,
  openSessionAfterConsent,
  recordConsent,
  recordDeviceCheck,
  submitAssessment,
  syncPosition,
  loadSessionState,
  withdraw,
  type EnrollableStudy,
  type OpenedSession,
} from "../../src/server/study/engine";
import { listRetentionDue, purgeParticipantData, purgeRetentionDue, PurgeError } from "../../src/server/study/purge";
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

describe.skipIf(!TEST_URL)("participant data removal", { timeout: 60_000 }, () => {
  let t: TestDb;
  let pi: string;
  let study: EnrollableStudy;
  let conceptIds: [string, string];
  const ids: Record<string, string> = {};

  const count = async (sql: string, params: unknown[]) => (await one<{ n: number }>(t.pool, `SELECT count(*)::int AS n FROM ${sql}`, params)).n;

  /** A participant with data in every table the purge covers. */
  async function fullParticipant(): Promise<OpenedSession> {
    const p = await enrolParticipant(t.pool, study);
    await recordConsent(t.pool, { participantId: p.participantId, study, decision: "granted", shownVersion: CONSENT.version });
    const s = await openSessionAfterConsent(t.pool, { participantId: p.participantId, studyId: study.id, appBuild: BUILD });
    await submitAssessment(t.pool, { sessionId: s.sessionId, step: "pre_test", assessmentId: ids["pu-pre"]!, values: { [ids["pu-pre:q1"]!]: ["b"] } });
    const a = await allocateSession(t.pool, s.sessionId);
    await recordDeviceCheck(t.pool, s.sessionId, { viewport: { width: 1280, height: 800 }, webglVersion: 2, inputDevices: ["keyboard"] }, { appBuild: BUILD });
    await completeOnboarding(t.pool, s.sessionId);
    await syncPosition(t.pool, (await loadSessionState(t.pool, s.sessionId))!, { arrivedAtHub: true });
    // A final post map with an edge (revisions by trigger), a derived score on it.
    const nodes = conceptIds.map((c, i) => ({ key: `n${i}`, conceptId: c, label: `c${i}`, x: 0, y: 0 }));
    const m = await one<{ id: string }>(
      t.pool,
      "INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, raw) VALUES ($1, $2, $3, $4, 'post', $5::jsonb, '{}') RETURNING id",
      [s.sessionId, s.participantId, ids["pu-recon"], ids["pu-recon:map"], JSON.stringify(nodes)],
    );
    await t.pool.query(
      "INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key, source_concept_id, target_concept_id, relationship_type_code, directed) VALUES ($1, 'e1', 'n0', 'n1', $2, $3, 'PRECEDES', true)",
      [m.id, conceptIds[0], conceptIds[1]],
    );
    await t.pool.query("UPDATE concept_maps SET is_final = true, submitted_at = now() WHERE id = $1", [m.id]);
    await t.pool.query(
      "INSERT INTO derived_scores (session_id, participant_id, assessment_id, concept_map_id, metric_name, metric_version, value, pipeline_version) VALUES ($1, $2, $3, $4, 'cmap.edges_test', '1', 1, 'test')",
      [s.sessionId, s.participantId, ids["pu-recon"], m.id],
    );
    // Telemetry: a batch, an event, a quarantined event, a gap.
    const condition = await one<{ condition_id: string }>(t.pool, "SELECT condition_id FROM study_sessions WHERE id = $1", [s.sessionId]);
    const b = await one<{ id: string }>(
      t.pool,
      "INSERT INTO telemetry_batches (idempotency_key, session_id, schema_version, app_build, event_count, accepted_count, quarantined_count, status) VALUES ($1, $2, 1, 'test-build', 2, 1, 1, 'accepted') RETURNING id",
      [`purge-${randomUUID()}`, s.sessionId],
    );
    await t.pool.query(
      `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, seq, event_type_code, app_build, content_version, batch_id)
       VALUES ($1, 1, $2, $3, $4, $5, now(), 0, 'information_layer_opened', 'test-build', 'v-purge', $6)`,
      [randomUUID(), study.id, s.participantId, s.sessionId, condition.condition_id, b.id],
    );
    await t.pool.query("INSERT INTO telemetry_quarantine (batch_id, session_id, raw, reason) VALUES ($1, $2, '{}', 'test: quarantined')", [b.id, s.sessionId]);
    await t.pool.query("INSERT INTO sequence_gaps (session_id, kind, from_seq, to_seq) VALUES ($1, 'gap', 2, 3)", [s.sessionId]);
    await t.pool.query(
      "INSERT INTO protocol_deviations (study_id, session_id, participant_id, category, severity, description, reported_by) VALUES ($1, $2, $3, 'technical', 'minor', 'Test deviation', $4)",
      [study.id, s.sessionId, s.participantId, pi],
    );
    await t.pool.query("INSERT INTO session_annotations (session_id, author_id, kind, body) VALUES ($1, $2, 'note', 'Test note')", [s.sessionId, pi]);
    await submitAssessment(t.pool, { sessionId: s.sessionId, step: "post_test", assessmentId: ids["pu-post"]!, values: { [ids["pu-post:q1"]!]: ["a"] } });
    return { ...s, condition: a.condition, conditionId: a.conditionId };
  }

  beforeAll(async () => {
    t = await createTestDatabase("purge");
    pi = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "pu", acceptBy: pi });
    conceptIds = g.conceptIds;
    const snapshotId = await createSnapshot(t.pool, { label: "v-purge", createdBy: pi });
    await addSnapshotItem(t.pool, snapshotId, "concept", g.conceptIds[0]);
    await publishSnapshot(t.pool, snapshotId, pi);
    const manifestId = await createPublishedManifest(t.pool, snapshotId, { by: pi });
    const choice = (id: string) => ({ id, label: `Option ${id}` });
    const assessment = async (code: string, kind: string, item: { key: string; kind: string; config: unknown; answerKey?: unknown }) => {
      const a = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ($1, 1, $2, $3) RETURNING id", [code, kind, code]);
      const i = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config, answer_key) VALUES ($1, $2, 0, $3, 'Prompt', $4::jsonb, $5::jsonb) RETURNING id",
        [a.id, item.key, item.kind, JSON.stringify(item.config), item.answerKey === undefined ? null : JSON.stringify(item.answerKey)],
      );
      await t.pool.query("UPDATE assessments SET status = 'locked' WHERE id = $1", [a.id]);
      ids[code] = a.id;
      ids[`${code}:${item.key}`] = i.id;
    };
    await assessment("pu-pre", "pretest", { key: "q1", kind: "single_choice", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "b" } });
    await assessment("pu-post", "posttest", { key: "q1", kind: "single_choice", config: { kind: "single_choice", options: [choice("a"), choice("b")] }, answerKey: { optionId: "a" } });
    await assessment("pu-recon", "reconstruction", { key: "map", kind: "concept_map", config: { kind: "concept_map", conceptKeys: ["pu.process_stage.step-1", "pu.process_stage.step-2"], relationshipTypes: ["PRECEDES"], directed: true } });
    const s = await createStudy(t.pool, { slug: "purge-study", snapshotId, manifestId });
    for (const [i, [code, phase]] of ([["pu-pre", "pre"], ["pu-post", "post"]] as const).entries()) {
      await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) VALUES ($1, $2, $3, $4)", [s.studyId, ids[code], phase, i]);
    }
    await t.pool.query("UPDATE studies SET status = 'active', config = $2::jsonb WHERE id = $1", [
      s.studyId,
      JSON.stringify({ traditionSlugs: ["pu-tradition"], consent: CONSENT, allocation: { algorithm: "block", seed: "purge" }, exposure: { mode: "self_paced" }, steps: ["pre_test", "onboarding", "learning", "post_test"], retentionDays: 30 }),
    ]);
    study = await findEnrollableStudy(t.pool, "purge-study");
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("removes a participant's data on request and keeps the audit skeleton", async () => {
    const s = await fullParticipant();
    const other = await fullParticipant();
    await completeSession(t.pool, s.sessionId);
    const tables = ["telemetry_events", "telemetry_quarantine", "telemetry_batches", "sequence_gaps", "derived_scores", "concept_maps", "responses", "protocol_deviations", "session_annotations"];
    for (const table of tables) expect(await count(`${table} WHERE session_id = $1`, [s.sessionId]), table).toBeGreaterThan(0);

    const r = await purgeParticipantData(t.pool, { studyId: study.id, participant: (await one<{ code: string }>(t.pool, "SELECT code FROM participants WHERE id = $1", [s.participantId])).code.toLowerCase(), reason: "participant asked for removal", actorId: pi, trigger: "request" });
    expect(r.sessions).toBe(1);
    expect(r.rows).toMatchObject({ study_sessions: 1, concept_map_revisions: 2, concept_map_edges: 1 });
    for (const table of tables) expect(await count(`${table} WHERE session_id = $1`, [s.sessionId]), table).toBe(0);
    expect(await count("study_sessions WHERE id = $1", [s.sessionId])).toBe(0);
    expect(await count("concept_map_revisions r JOIN concept_maps m ON m.id = r.concept_map_id WHERE m.participant_id = $1", [s.participantId])).toBe(0);
    // Kept: the pseudonymous participant row, consent, allocation, journal.
    expect(await count("participants WHERE id = $1", [s.participantId])).toBe(1);
    expect(await count("consent_records WHERE participant_id = $1", [s.participantId])).toBe(1);
    expect(await count("allocations WHERE participant_id = $1", [s.participantId])).toBe(1);
    expect(await count("audit_log WHERE entity = 'study_session' AND entity_id = $1", [s.sessionId])).toBeGreaterThan(0);
    const entry = await one<{ actor_id: string; reason: string; after: { trigger: string; rows: Record<string, number> } }>(
      t.pool,
      "SELECT actor_id, reason, after FROM audit_log WHERE action = 'research.participant_data_purged' AND entity_id = $1",
      [s.participantId],
    );
    expect(entry).toMatchObject({ actor_id: pi, reason: "participant asked for removal", after: { trigger: "request" } });
    // Nobody else's data is touched.
    expect(await count("responses WHERE participant_id = $1", [other.participantId])).toBeGreaterThan(0);
    expect(await count("telemetry_events WHERE session_id = $1", [other.sessionId])).toBe(1);
    // A second removal finds nothing left.
    await expect(purgeParticipantData(t.pool, { studyId: study.id, participant: s.participantId, reason: "again please", actorId: pi, trigger: "request" })).rejects.toBeInstanceOf(PurgeError);
  });

  it("refuses while the participant is still taking part, and without a reason", async () => {
    const s = await fullParticipant();
    await expect(purgeParticipantData(t.pool, { studyId: study.id, participant: s.participantId, reason: "asked for removal", actorId: pi, trigger: "request" })).rejects.toThrow(/still taking part/);
    await expect(purgeParticipantData(t.pool, { studyId: study.id, participant: s.participantId, reason: " ", actorId: pi, trigger: "request" })).rejects.toThrow(/reason/);
    await expect(purgeParticipantData(t.pool, { studyId: study.id, participant: "P-NOSUCHCODE", reason: "asked for removal", actorId: pi, trigger: "request" })).rejects.toThrow(/No participant/);
    // After withdrawal the removal goes through.
    await withdraw(t.pool, { participantId: s.participantId, sessionId: s.sessionId, reason: "no_longer_wish_to_take_part" });
    const r = await purgeParticipantData(t.pool, { studyId: study.id, participant: s.participantId, reason: "asked for removal", actorId: pi, trigger: "request" });
    expect(r.rows.study_sessions).toBe(1);
  });

  it("lists and removes the participants whose retention period has passed", async () => {
    const ended = await fullParticipant();
    await completeSession(t.pool, ended.sessionId);
    const running = await fullParticipant(); // still in a session: never due
    const in31Days = new Date(Date.now() + 31 * 24 * 3600 * 1000);
    expect((await listRetentionDue(t.pool, study.id)).due.map((d) => d.participantId)).not.toContain(ended.participantId);
    const due = await listRetentionDue(t.pool, study.id, in31Days);
    expect(due.retentionDays).toBe(30);
    expect(due.due.map((d) => d.participantId)).toContain(ended.participantId);
    expect(due.due.map((d) => d.participantId)).not.toContain(running.participantId);
    const removed = await purgeRetentionDue(t.pool, { studyId: study.id, actorId: pi, now: in31Days });
    expect(removed.map((r) => r.participantId)).toContain(ended.participantId);
    expect(await count("study_sessions WHERE participant_id = $1", [ended.participantId])).toBe(0);
    expect(await count("study_sessions WHERE participant_id = $1", [running.participantId])).toBe(1);
    const entry = await one<{ reason: string; after: { trigger: string } }>(t.pool, "SELECT reason, after FROM audit_log WHERE action = 'research.participant_data_purged' AND entity_id = $1", [ended.participantId]);
    expect(entry.after.trigger).toBe("retention");
    expect(entry.reason).toMatch(/retention period of 30 days/);
    expect((await listRetentionDue(t.pool, study.id, in31Days)).due.map((d) => d.participantId)).not.toContain(ended.participantId);
  });
});
