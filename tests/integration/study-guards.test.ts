/**
 * Integration: the study guards of migration 0018 and the related services (final review
 * database-06, -07, -08, security-04), against a throwaway database.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteItem, publishAssessment } from "../../src/server/assessment/definitions";
import { consumeEnrolmentAttempt, clientAddress } from "../../src/server/study/enrolment-throttle";
import { enrolParticipant, findEnrollableStudy, recordConsent as engineConsent, StudyEngineError } from "../../src/server/study/engine";
import {
  TEST_URL,
  createPublishedManifest,
  createRealGraph,
  createSession,
  createSnapshot,
  createStudy,
  createTestDatabase,
  createUser,
  one,
  publishSnapshot,
  recordConsent,
  withSettings,
  type TestDb,
} from "./schema-harness";

const CONSENT = { version: "c-1.0", text: "Test consent text written for this test." };

describe.skipIf(!TEST_URL)("study guards (migration 0018)", { timeout: 60_000 }, () => {
  let t: TestDb;
  let studyId: string;
  let conds: { c2d: string; c3d: string };
  let curator: string;
  let n = 0;

  beforeAll(async () => {
    t = await createTestDatabase("study_guards");
    curator = await createUser(t.pool);
    await createRealGraph(t.pool, { prefix: "sg", acceptBy: curator });
    const snapshotId = await createSnapshot(t.pool, { label: "v-guards", createdBy: curator });
    await publishSnapshot(t.pool, snapshotId, curator);
    const manifestId = await createPublishedManifest(t.pool, snapshotId, { by: curator });
    const s = await createStudy(t.pool, { slug: "guards", snapshotId, manifestId });
    studyId = s.studyId;
    conds = s.conditionIds;
    await t.pool.query("UPDATE studies SET status = 'active', config = $2::jsonb WHERE id = $1", [
      studyId,
      JSON.stringify({ traditionSlugs: ["sg-tradition"], consent: CONSENT, allocation: { algorithm: "block", seed: "g" }, exposure: { mode: "self_paced" }, steps: ["onboarding", "learning"], enrolment: { maxParticipants: 1000 } }),
    ]);
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  const session = () => createSession(t.pool, studyId, conds.c2d, `P-G${String(++n).padStart(3, "0")}`, n);

  it("database-06: an ended or withdrawn session, and a withdrawn participant, cannot be reopened", async () => {
    const done = await session();
    await t.pool.query("UPDATE study_sessions SET status = 'completed', completed_at = now() WHERE id = $1", [done.sessionId]);
    await expect(t.pool.query("UPDATE study_sessions SET status = 'in_progress' WHERE id = $1", [done.sessionId])).rejects.toThrow(/session has ended/);
    await expect(t.pool.query("UPDATE study_sessions SET completed_at = now() - interval '1 day' WHERE id = $1", [done.sessionId])).rejects.toThrow(/set once/);
    const gone = await session();
    await t.pool.query("UPDATE study_sessions SET withdrawn = true, withdrawn_at = now() WHERE id = $1", [gone.sessionId]);
    await expect(t.pool.query("UPDATE study_sessions SET withdrawn = false, withdrawn_at = NULL WHERE id = $1", [gone.sessionId])).rejects.toThrow(/withdrawal is terminal/);
    await t.pool.query("UPDATE participants SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1", [gone.participantId]);
    await expect(t.pool.query("UPDATE participants SET status = 'active' WHERE id = $1", [gone.participantId])).rejects.toThrow(/withdrawal is terminal/);
    const excluded = await session();
    await t.pool.query("UPDATE participants SET status = 'excluded', exclusion_reason = 'test' WHERE id = $1", [excluded.participantId]);
    await expect(t.pool.query("UPDATE participants SET status = 'active' WHERE id = $1", [excluded.participantId])).rejects.toThrow(/can only withdraw/);
    await t.pool.query("UPDATE participants SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1", [excluded.participantId]); // withdrawal stays possible
  });

  it("database-06: consent rows take the server clock; no decision after a withdrawal; one initial decision", async () => {
    const s = await session();
    await recordConsent(t.pool, s.participantId, "withdrawn");
    await expect(recordConsent(t.pool, s.participantId, "granted")).rejects.toThrow(/cannot follow a withdrawal/);
    const s2 = await session();
    await expect(recordConsent(t.pool, s2.participantId, "declined")).rejects.toThrow(/consent_records_one_decision_uq|duplicate key/);
    const p = await one<{ id: string }>(t.pool, "INSERT INTO participants (study_id, code) VALUES ($1, 'P-CLOCK') RETURNING id", [studyId]);
    await t.pool.query(
      "INSERT INTO consent_records (participant_id, consent_version, consent_text_sha256, decision, recorded_at) VALUES ($1, 'c1', $2, 'granted', now() + interval '1 year')",
      [p.id, "a".repeat(64)],
    );
    const r = await one<{ future: boolean }>(t.pool, "SELECT recorded_at > now() + interval '1 minute' AS future FROM consent_records WHERE participant_id = $1", [p.id]);
    expect(r.future).toBe(false);
  });

  it("database-06: telemetry intake follows the latest consent decision, not only the flags", async () => {
    const s = await session();
    const event = () =>
      t.pool.query(
        `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id, client_ts, seq, event_type_code, app_build, content_version)
         VALUES ($1, 1, $2, $3, $4, $5, now(), 1, 'information_layer_opened', 'test-build', 'v-guards')`,
        [randomUUID(), studyId, s.participantId, s.sessionId, conds.c2d],
      );
    // A "withdrawn" consent recorded without the flags (a partial manual correction).
    await recordConsent(t.pool, s.participantId, "withdrawn");
    await expect(event()).rejects.toThrow(/latest consent decision is withdrawn/);
  });

  it("database-07: a session row is deleted only in a reasoned purge, never truncated", async () => {
    const s = await session();
    await t.pool.query(
      "INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after) VALUES ('system', 'study-engine', 'study.step_completed', 'study_session', $1, '{\"step\":\"onboarding\"}')",
      [s.sessionId],
    );
    await expect(t.pool.query("DELETE FROM study_sessions WHERE id = $1", [s.sessionId])).rejects.toThrow(/requires app.research_purge_reason/);
    await expect(t.pool.query("TRUNCATE study_sessions CASCADE")).rejects.toThrow(/cannot be truncated|append-only/);
    await withSettings(t.pool, { "app.research_purge_reason": "test purge" }, (c) => c.query("DELETE FROM study_sessions WHERE id = $1", [s.sessionId]));
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM study_sessions WHERE id = $1", [s.sessionId])).n).toBe(0);
  });

  it("database-08: two consent decisions submitted at once record exactly one", async () => {
    const study = await findEnrollableStudy(t.pool, "guards");
    for (let i = 0; i < 3; i++) {
      const p = await enrolParticipant(t.pool, study);
      const results = await Promise.allSettled([
        engineConsent(t.pool, { participantId: p.participantId, study, decision: "granted", shownVersion: CONSENT.version }),
        engineConsent(t.pool, { participantId: p.participantId, study, decision: "declined", shownVersion: CONSENT.version }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(refused.reason).toBeInstanceOf(StudyEngineError);
      expect((refused.reason as StudyEngineError).code).toBe("consent_already_recorded");
      expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM consent_records WHERE participant_id = $1", [p.participantId])).n).toBe(1);
    }
  });

  it("database-08: an item write waits for a concurrent publish and is then refused", async () => {
    const a = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ('race-pre', 1, 'pretest', 'Race') RETURNING id");
    const item = await one<{ id: string }>(
      t.pool,
      "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, 'q1', 0, 'short_text', 'Anything', '{\"kind\":\"short_text\"}') RETURNING id",
      [a.id],
    );
    // A publish in flight holds the assessment row.
    const publisher = await t.pool.connect();
    try {
      await publisher.query("BEGIN");
      await publisher.query("SELECT 1 FROM assessments WHERE id = $1 FOR UPDATE", [a.id]);
      let settled = false;
      const del = t.pool.query("DELETE FROM assessment_items WHERE id = $1", [item.id]).finally(() => (settled = true));
      del.catch(() => undefined);
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false); // waits for the publish (before 0018 it deleted at once)
      await publisher.query("UPDATE assessments SET status = 'locked' WHERE id = $1", [a.id]);
      await publisher.query("COMMIT");
      await expect(del).rejects.toThrow(/locked parent/);
    } finally {
      publisher.release();
    }
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM assessment_items WHERE assessment_id = $1", [a.id])).n).toBe(1);
    // The service path: publish in one transaction, and a later delete is refused.
    const b = await one<{ id: string }>(t.pool, "INSERT INTO assessments (code, version, kind, title) VALUES ('race-post', 1, 'posttest', 'Race 2') RETURNING id");
    const bi = await one<{ id: string }>(
      t.pool,
      "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config) VALUES ($1, 'q1', 0, 'short_text', 'Anything', '{\"kind\":\"short_text\"}') RETURNING id",
      [b.id],
    );
    await publishAssessment(t.pool, curator, b.id);
    await expect(deleteItem(t.pool, b.id, bi.id)).rejects.toMatchObject({ code: "immutable" });
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'assessment.publish' AND entity_id = $1", [b.id])).n).toBe(1);
  });

  it("security-04: enrolments are throttled per client address and per study", async () => {
    const id = randomUUID();
    const limits = { maxPerAddressPer10Minutes: 2, maxPerHour: 3 };
    const now = new Date("2026-10-16T10:00:00Z");
    const at = (addr: string | null, d = now) => consumeEnrolmentAttempt(t.pool, { studyId: id, address: addr, limits }, d);
    expect(await at("198.51.100.1")).toEqual({ allowed: true });
    expect(await at("198.51.100.1")).toEqual({ allowed: true });
    expect(await at("198.51.100.1")).toMatchObject({ allowed: false, scope: "address" });
    expect(await at("198.51.100.2")).toMatchObject({ allowed: false, scope: "study", retryAfterSeconds: 3600 });
    // The windows restart: an hour later both counters begin again.
    expect(await at("198.51.100.1", new Date(now.getTime() + 61 * 60_000))).toEqual({ allowed: true });
    // No address stored: only sha256 keys.
    const keys = await t.pool.query<{ key_sha256: string }>("SELECT key_sha256 FROM study_enrolment_throttle");
    expect(keys.rows.every((r) => /^[0-9a-f]{64}$/.test(r.key_sha256))).toBe(true);
    expect(JSON.stringify(keys.rows)).not.toContain("198.51.100");
  });

  it("security-04: the client address is the last untrusted hop; a cap stops enrolment when the study is full", async () => {
    const h = (v: string) => new Headers({ "x-forwarded-for": v });
    expect(clientAddress(h("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientAddress(h("1.2.3.4, 203.0.113.7, 10.0.0.1"), { trustedProxies: ["10.0.0.1"] })).toBe("203.0.113.7");
    expect(clientAddress(new Headers())).toBeNull();
    const s = await createStudy(t.pool, { slug: "guards-cap", snapshotId: (await one<{ s: string }>(t.pool, "SELECT snapshot_id AS s FROM studies WHERE id = $1", [studyId])).s, manifestId: (await one<{ m: string }>(t.pool, "SELECT manifest_id AS m FROM studies WHERE id = $1", [studyId])).m });
    await t.pool.query("UPDATE studies SET status = 'active', config = $2::jsonb WHERE id = $1", [
      s.studyId,
      JSON.stringify({ traditionSlugs: ["sg-tradition"], consent: CONSENT, steps: ["onboarding", "learning"], enrolment: { maxParticipants: 2 } }),
    ]);
    const capped = await findEnrollableStudy(t.pool, "guards-cap");
    const results = await Promise.allSettled([enrolParticipant(t.pool, capped), enrolParticipant(t.pool, capped), enrolParticipant(t.pool, capped)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "study_full" });
  });
});
