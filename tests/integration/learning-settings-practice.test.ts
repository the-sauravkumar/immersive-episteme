/**
 * Integration: the protocol settings both learning conditions read through the learning context
 * (minimap, WebGL policy, guidance, learning prompts, search), the comparison scope rule read from
 * the pinned manifest's rule set, and the familiarisation practice: its context never starts the
 * learning clock, and its telemetry is acknowledged but never stored.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultRuleSetConfig } from "../../src/features/spatial/compiler/config";
import { practiceTelemetrySessionId, pgLearningContextData, resolveLearningContext, resolvePracticeContext } from "../../src/server/learning/context-data";
import { ingestTelemetryBatch } from "../../src/server/telemetry/ingest";
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

type Session = Awaited<ReturnType<typeof createSession>>;

const CONFIG = {
  minimap: "on",
  webglFailurePolicy: "exclude",
  searchEnabled: true,
  guidance: { policy: "hybrid", cueEnabled: true, stallSeconds: 90, hintText: "Test hint written by the researchers." },
  learningPrompts: [{ id: "p1", text: "Test prompt one." }, { id: "p2", text: "Test prompt two." }],
  familiarisation: { minutes: 5 },
};

describe.skipIf(!TEST_URL)("learning settings, scope rule and practice", () => {
  let t: TestDb;
  let snapshotId: string;
  let s2d: Session;
  let s3d: Session;
  let sDefault: Session;
  const label = "v-settings";

  beforeAll(async () => {
    t = await createTestDatabase("settings");
    const curator = await createUser(t.pool);
    const g = await createRealGraph(t.pool, { prefix: "set", acceptBy: curator });
    snapshotId = await createSnapshot(t.pool, { label, createdBy: curator });
    await addSnapshotItem(t.pool, snapshotId, "concept", g.conceptIds[0]);
    await publishSnapshot(t.pool, snapshotId, curator);

    // A manifest compiled under a rule set whose comparison rule asks for 3 traditions.
    const strict = defaultRuleSetConfig();
    for (const r of strict.rules) if (r.emit.params?.strategy === "comparison-zone") r.emit.params = { ...r.emit.params, minTraditions: 3 };
    const rs = await one<{ id: string }>(t.pool, "INSERT INTO mapping_rule_sets (name, version, config) VALUES ('strict comparisons', 1, $1::jsonb) RETURNING id", [JSON.stringify(strict)]);
    await t.pool.query("UPDATE mapping_rule_sets SET status = 'frozen' WHERE id = $1", [rs.id]);
    const m = await one<{ id: string }>(
      t.pool,
      `INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, manifest) VALUES ($1, $2, 'test-1.0.0', 'seed-1', '{"schemaVersion":1,"elements":[]}') RETURNING id`,
      [snapshotId, rs.id],
    );
    await t.pool.query("UPDATE spatial_manifests SET status = 'published', published_by = $2 WHERE id = $1", [m.id, curator]);

    const study = await createStudy(t.pool, { slug: "settings-study", snapshotId, manifestId: m.id });
    await t.pool.query("UPDATE studies SET status = 'active', config = $2::jsonb WHERE id = $1", [study.studyId, JSON.stringify(CONFIG)]);
    s2d = await createSession(t.pool, study.studyId, study.conditionIds.c2d, "P-SET01", 0);
    s3d = await createSession(t.pool, study.studyId, study.conditionIds.c3d, "P-SET02", 1);

    // Default config, manifest from a rule set without a comparison rule: the compiler default.
    const plainManifest = await createPublishedManifest(t.pool, snapshotId, { by: curator });
    const plain = await createStudy(t.pool, { slug: "settings-default", snapshotId, manifestId: plainManifest });
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [plain.studyId]);
    sDefault = await createSession(t.pool, plain.studyId, plain.conditionIds.c2d, "P-SET03", 0);
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  const access = (s: Session, condition: "2d" | "immersive") => ({ kind: "participant" as const, experimental: true as const, condition, participantId: s.participantId, sessionId: s.sessionId });
  const deps = () => ({ data: pgLearningContextData(t.pool), appBuild: "test" });

  it("gives both conditions the same protocol settings through the learning context", async () => {
    const a = await resolveLearningContext(access(s2d, "2d"), deps());
    const b = await resolveLearningContext(access(s3d, "immersive"), deps());
    const expected = {
      minimap: "on",
      webglFailurePolicy: "exclude",
      guidance: { policy: "hybrid", cueEnabled: true, stallSeconds: 90, hintText: "Test hint written by the researchers." },
      learningPrompts: CONFIG.learningPrompts,
      figures: { structureDiagrams: true, photos: true },
    };
    expect(a.settings).toEqual(expected);
    expect(b.settings).toEqual(a.settings);
    expect(a.features).toEqual({ search: true });
    expect(b.features).toEqual(a.features);
  });

  it("reads the comparison scope rule from the pinned manifest's rule set", async () => {
    expect((await resolveLearningContext(access(s2d, "2d"), deps())).scope).toEqual({ minCompareTraditions: 3 });
    expect((await resolveLearningContext(access(s3d, "immersive"), deps())).scope).toEqual({ minCompareTraditions: 3 });
    const d = await resolveLearningContext(access(sDefault, "2d"), deps());
    expect(d.scope).toEqual({ minCompareTraditions: 2 });
    expect(d.settings.guidance).toEqual({ policy: "none", cueEnabled: false, stallSeconds: 120, hintText: null });
    expect(d.settings.learningPrompts).toEqual([]);
  });

  it("resolves the practice context without starting the learning clock", async () => {
    const fresh = await createSession(t.pool, (await one<{ id: string }>(t.pool, "SELECT study_id AS id FROM study_sessions WHERE id = $1", [s2d.sessionId])).id, (await one<{ id: string }>(t.pool, "SELECT condition_id AS id FROM study_sessions WHERE id = $1", [s2d.sessionId])).id, "P-SET04", 2);
    const p = await resolvePracticeContext(access(fresh, "2d"), deps());
    expect(p).toMatchObject({ mode: "study", sessionId: fresh.sessionId, minutes: 5, contentVersion: label, telemetrySessionId: practiceTelemetrySessionId(fresh.sessionId) });
    expect(p.telemetrySessionId).not.toBe(fresh.sessionId);
    expect(p.settings.guidance.hintText).toBe("Test hint written by the researchers.");
    const clock = await one<{ started: Date | null }>(t.pool, "SELECT learning_started_at AS started FROM study_sessions WHERE id = $1", [fresh.sessionId]);
    expect(clock.started).toBeNull();
  });

  it("acknowledges practice telemetry and stores none of it", async () => {
    const practiceId = practiceTelemetrySessionId(s3d.sessionId);
    const events = [0, 1].map((seq) => ({ eventId: randomUUID(), schemaVersion: 1, sessionId: practiceId, seq, type: "room_entered", clientTs: new Date().toISOString(), metadata: { via: "start" } }));
    const body = { idempotencyKey: `b:${practiceId}:0-1`, sessionId: practiceId, schemaVersion: 1, appBuild: "test", contentVersion: label, clientSentAt: new Date().toISOString(), events };
    const r = await ingestTelemetryBatch(t.pool, { kind: "participant", participantId: s3d.participantId, sessionId: s3d.sessionId }, body);
    expect(r).toMatchObject({ status: 200, body: { persisted: false, practice: true, accepted: 2, quarantined: 0, batchId: null } });
    const stored = await one<{ n: number }>(t.pool, "SELECT (SELECT count(*) FROM telemetry_events WHERE session_id = $1) + (SELECT count(*) FROM telemetry_batches WHERE session_id = $1) AS n", [s3d.sessionId]);
    expect(Number(stored.n)).toBe(0);
    // Another session's practice id is still refused.
    const other = await ingestTelemetryBatch(t.pool, { kind: "participant", participantId: s2d.participantId, sessionId: s2d.sessionId }, body);
    expect(other).toMatchObject({ status: 403, body: { error: "session_mismatch" } });
  });
});
