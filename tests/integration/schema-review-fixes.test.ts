/**
 * Integration: regression tests for the integrity rules added in migration 0005 (review fixes).
 *  - published snapshots: payload == items, live recheck at publication, derived item hashes
 *  - accepted knowledge stays backed by its evidence
 *  - demo isolation through single-column references
 *  - consent before allocation, content set per period, release status at activation
 *  - telemetry consistency with the session snapshot
 *  - raw participant data is append-only / frozen once final
 * Every test file gets its own throwaway database (see ./schema-harness.ts).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { publicDemoGate, realStudyActive } from "@/server/auth/demo-policy";

import {
  FAKE_SHA256,
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
  recordConsent,
  withSettings,
  type TestDb,
} from "./schema-harness";

describe.skipIf(!TEST_URL)("schema: review-fix integrity rules (0005)", () => {
  let t: TestDb;
  let curator: string;
  let demoConceptId: string;

  beforeAll(async () => {
    t = await createTestDatabase("reviewfix");
    curator = await createUser(t.pool);
    demoConceptId = (
      await one<{ id: string }>(
        t.pool,
        `INSERT INTO concepts (key, slug, type, category_code, title, provenance_kind, is_demo)
         VALUES ('demo-r.material.mud', 'demo-r-material-mud', 'material', 'materials', 'Demo: Mud', 'unverified', true) RETURNING id`,
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  const asCurator = <T>(fn: Parameters<typeof withSettings<T>>[2]) =>
    withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test" }, fn);

  const stateOf = async (table: "concepts" | "relationships", id: string) =>
    (await one<{ s: string }>(t.pool, `SELECT verification_state::text AS s FROM ${table} WHERE id = $1`, [id])).s;

  // ---------------------------------------------------------------------------------------
  describe("published snapshots", () => {
    it("cannot be inserted already published", async () => {
      await expect(
        t.pool.query(
          `INSERT INTO content_snapshots (version_label, title, payload, status, published_at, published_by, item_count)
           VALUES ('direct-pub', 'Direct', '{"concepts":[{"id":"x","key":"demo.material.x"}]}', 'published', now(), $1, 999)`,
          [curator],
        ),
      ).rejects.toThrow(/insert the snapshot as draft/);
    });

    it("require the payload entity set to equal the snapshot items", async () => {
      const g = await createRealGraph(t.pool, { prefix: "pl", acceptBy: curator });
      // Payload lists a (demo) concept that is not an item.
      const extra = await createSnapshot(t.pool, { label: "payload-extra", createdBy: curator });
      await addSnapshotItem(t.pool, extra, "concept", g.conceptIds[0]);
      await t.pool.query(
        `UPDATE content_snapshots SET payload = jsonb_set(payload, '{concepts}', payload->'concepts' || jsonb_build_array(jsonb_build_object('id', $2::text, 'key', 'demo-r.material.mud')))
          WHERE id = $1`,
        [extra, demoConceptId],
      );
      await expect(publishSnapshot(t.pool, extra, curator)).rejects.toThrow(/payload contains concept .* which is not a snapshot item/);

      // An item missing from the payload.
      const missing = await createSnapshot(t.pool, { label: "payload-missing", createdBy: curator });
      await addSnapshotItem(t.pool, missing, "concept", g.conceptIds[0]);
      await t.pool.query("UPDATE content_snapshots SET payload = jsonb_set(payload, '{concepts}', '[]') WHERE id = $1", [missing]);
      await expect(publishSnapshot(t.pool, missing, curator)).rejects.toThrow(/is not in the payload/);

      // Header disagreeing with the row (claims to be demo / unverified).
      const header = await createSnapshot(t.pool, { label: "payload-header", createdBy: curator });
      await t.pool.query("UPDATE content_snapshots SET payload = payload || '{\"includesUnverified\": true}' WHERE id = $1", [header]);
      await expect(publishSnapshot(t.pool, header, curator)).rejects.toThrow(/payload header/);

      // A payload key that is not the live concept key.
      const key = await createSnapshot(t.pool, { label: "payload-key", createdBy: curator });
      await addSnapshotItem(t.pool, key, "concept", g.conceptIds[0]);
      await t.pool.query(
        "UPDATE content_snapshots SET payload = jsonb_set(payload, '{concepts,0,key}', '\"pl.process_stage.other\"') WHERE id = $1",
        [key],
      );
      await expect(publishSnapshot(t.pool, key, curator)).rejects.toThrow(/not its current key/);
    });

    it("recheck items against their live entities at publication", async () => {
      const g = await createRealGraph(t.pool, { prefix: "rj", acceptBy: curator });
      const id = await createSnapshot(t.pool, { label: "recheck-1", createdBy: curator });
      await addSnapshotItem(t.pool, id, "concept", g.conceptIds[0]);
      // Verified when added, rejected before publication.
      await asCurator((c) => c.query("UPDATE concepts SET verification_state = 'rejected' WHERE id = $1", [g.conceptIds[0]]));
      await expect(publishSnapshot(t.pool, id, curator)).rejects.toThrow(/does not allow unverified content/);
    });

    it("derive item hashes from the payload and recompute item_count", async () => {
      const g = await createRealGraph(t.pool, { prefix: "hs", acceptBy: curator });
      const id = await createSnapshot(t.pool, { label: "hash-items", createdBy: curator });
      await addSnapshotItem(t.pool, id, "concept", g.conceptIds[0]);
      await addSnapshotItem(t.pool, id, "category", "process_stages");
      await t.pool.query("UPDATE content_snapshots SET item_count = 999 WHERE id = $1", [id]);
      await publishSnapshot(t.pool, id, curator);
      const snap = await one<{ item_count: number }>(t.pool, "SELECT item_count FROM content_snapshots WHERE id = $1", [id]);
      expect(snap.item_count).toBe(2);
      const rows = await t.pool.query<{ item_sha256: string; expected: string }>(
        `SELECT si.item_sha256, ie_jsonb_sha256(p.slice) AS expected
           FROM snapshot_items si
           JOIN content_snapshots cs ON cs.id = si.snapshot_id
           JOIN ie_snapshot_payload_entities(cs.payload) p ON p.item_kind = si.item_kind AND p.entity_ref = si.entity_ref
          WHERE si.snapshot_id = $1`,
        [id],
      );
      expect(rows.rowCount).toBe(2);
      for (const r of rows.rows) {
        expect(r.item_sha256).toBe(r.expected);
        expect(r.item_sha256).not.toBe(FAKE_SHA256);
      }
    });

    it("cannot be truncated, nor can their items or parity reports", async () => {
      for (const table of ["content_snapshots", "snapshot_items", "parity_reports"]) {
        await expect(t.pool.query(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/cannot be truncated/);
      }
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("accepted knowledge and its evidence", () => {
    it("returns a verified concept to review when a claim source is removed, and records it", async () => {
      const g = await createRealGraph(t.pool, { prefix: "ev1", acceptBy: curator });
      const claim = await one<{ id: string }>(t.pool, "SELECT id FROM concept_claims WHERE concept_id = $1", [g.conceptIds[0]]);
      await t.pool.query("DELETE FROM concept_claim_sources WHERE claim_id = $1", [claim.id]);
      expect(await stateOf("concepts", g.conceptIds[0])).toBe("under_review");
      const rec = await one<{ from_state: string; to_state: string; reason: string }>(
        t.pool,
        `SELECT from_state::text, to_state::text, reason FROM verification_records
          WHERE entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [g.conceptIds[0]],
      );
      expect(rec).toMatchObject({ from_state: "verified", to_state: "under_review" });
      expect(rec.reason).toMatch(/returned to review automatically/);
      // The relationship that depends on it went back to review too.
      expect(await stateOf("relationships", g.relationshipId)).toBe("under_review");
      // Re-acceptance with an unsourced claim fails.
      await expect(
        asCurator((c) => c.query("UPDATE concepts SET verification_state = 'verified' WHERE id = $1", [g.conceptIds[0]])),
      ).rejects.toThrow(/every claim of concept .* needs a source/);
    });

    it("returns a verified concept to review when a claim is rewritten or an unsourced claim is added", async () => {
      const g = await createRealGraph(t.pool, { prefix: "ev2", acceptBy: curator });
      await t.pool.query("UPDATE concept_claims SET text = 'entirely different unsourced statement' WHERE concept_id = $1", [g.conceptIds[0]]);
      expect(await stateOf("concepts", g.conceptIds[0])).toBe("under_review");

      await t.pool.query("INSERT INTO concept_claims (concept_id, position, text) VALUES ($1, 1, 'Unsourced')", [g.conceptIds[1]]);
      expect(await stateOf("concepts", g.conceptIds[1])).toBe("under_review");
    });

    it("returns accepted rows to review when substantive columns are edited", async () => {
      const g = await createRealGraph(t.pool, { prefix: "ev3", acceptBy: curator });
      await t.pool.query("UPDATE concepts SET title = 'Edited title' WHERE id = $1", [g.conceptIds[0]]);
      expect(await stateOf("concepts", g.conceptIds[0])).toBe("under_review");
      // Bookkeeping-only updates do not.
      await t.pool.query("UPDATE concepts SET updated_at = now() WHERE id = $1", [g.conceptIds[1]]);
      expect(await stateOf("concepts", g.conceptIds[1])).toBe("verified");
      const tr = await one<{ s: string }>(
        t.pool,
        "UPDATE traditions SET summary = 'changed' WHERE id = $1 RETURNING verification_state::text AS s",
        [g.traditionId],
      );
      expect(tr.s).toBe("under_review");
    });

    it("returns a verified relationship to review when its source is removed", async () => {
      const g = await createRealGraph(t.pool, { prefix: "ev4", acceptBy: curator });
      await t.pool.query("DELETE FROM relationship_sources WHERE relationship_id = $1", [g.relationshipId]);
      expect(await stateOf("relationships", g.relationshipId)).toBe("under_review");
    });

    it("accepts a relationship only between accepted concepts", async () => {
      const g = await createRealGraph(t.pool, { prefix: "ev5" });
      await asCurator(async (c) => {
        await c.query("UPDATE sources SET verification_state = 'verified' WHERE id = $1", [g.sourceId]);
        await c.query("UPDATE concepts SET verification_state = 'verified' WHERE id = $1", [g.conceptIds[0]]);
      });
      await expect(
        asCurator((c) => c.query("UPDATE relationships SET verification_state = 'verified' WHERE id = $1", [g.relationshipId])),
      ).rejects.toThrow(/only be accepted between accepted concepts/);
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("demo isolation through single-column references", () => {
    it("rejects demo concepts in non-demo assessments, reference maps, manifests and overrides", async () => {
      const a = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessments (code, version, kind, title) VALUES ('realtest', 1, 'pretest', 'Real test') RETURNING id",
      );
      await expect(
        t.pool.query(
          "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, concept_id) VALUES ($1, 'q1', 0, 'short_text', 'Q?', $2)",
          [a.id, demoConceptId],
        ),
      ).rejects.toThrow(/assessment_items of non-demo content cannot reference demo content/);

      const g = await createRealGraph(t.pool, { prefix: "dm", acceptBy: curator });
      const rm = await one<{ id: string }>(
        t.pool,
        "INSERT INTO reference_maps (assessment_id, version, title) VALUES ($1, 1, 'Ref') RETURNING id",
        [a.id],
      );
      await expect(
        t.pool.query(
          "INSERT INTO reference_map_edges (reference_map_id, source_concept_id, target_concept_id) VALUES ($1, $2, $3)",
          [rm.id, g.conceptIds[0], demoConceptId],
        ),
      ).rejects.toThrow(/reference_map_edges of non-demo content cannot reference demo content/);

      const demoSnap = await createSnapshot(t.pool, { label: "demo-dm-snap", isDemo: true, includesUnverified: true });
      await expect(
        t.pool.query("INSERT INTO reference_maps (assessment_id, version, title, snapshot_id) VALUES ($1, 2, 'Ref 2', $2)", [a.id, demoSnap]),
      ).rejects.toThrow(/reference_maps of non-demo content cannot reference demo content/);

      const rs = await one<{ id: string }>(
        t.pool,
        `INSERT INTO mapping_rule_sets (name, version, config) VALUES ('rules-dm', 1, '{}') RETURNING id`,
      );
      await expect(
        t.pool.query(
          "INSERT INTO manual_overrides (rule_set_id, target_element_id, target_concept_id, field, value, reason, created_by) VALUES ($1, 'e1', $2, '/position', '[0,0,0]', 'move it', $3)",
          [rs.id, demoConceptId, curator],
        ),
      ).rejects.toThrow(/manual_overrides of non-demo content cannot reference demo content/);

      const snap = await createSnapshot(t.pool, { label: "dm-real", createdBy: curator });
      await addSnapshotItem(t.pool, snap, "concept", g.conceptIds[0]);
      await publishSnapshot(t.pool, snap, curator);
      const m = await one<{ id: string }>(
        t.pool,
        `INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, manifest) VALUES ($1, $2, '1', 's', '{}') RETURNING id`,
        [snap, rs.id],
      );
      await expect(
        t.pool.query("INSERT INTO spatial_elements (manifest_id, element_id, kind, rule_id, concept_id) VALUES ($1, 'x1', 'exhibit', 'r1', $2)", [
          m.id,
          demoConceptId,
        ]),
      ).rejects.toThrow(/spatial_elements of non-demo content cannot reference demo content/);
      // Real concepts are fine.
      await expect(
        t.pool.query("INSERT INTO spatial_elements (manifest_id, element_id, kind, rule_id, concept_id) VALUES ($1, 'x2', 'exhibit', 'r1', $2)", [
          m.id,
          g.conceptIds[0],
        ]),
      ).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("studies, consent and releases", () => {
    let snap: string;
    let manifest: string;
    beforeAll(async () => {
      const g = await createRealGraph(t.pool, { prefix: "st", acceptBy: curator });
      snap = await createSnapshot(t.pool, { label: "st-snap", createdBy: curator });
      await addSnapshotItem(t.pool, snap, "concept", g.conceptIds[0]);
      await addSnapshotItem(t.pool, snap, "tradition", g.traditionId);
      await publishSnapshot(t.pool, snap, curator);
      manifest = await createPublishedManifest(t.pool, snap, { by: curator });
    });

    it("allocates only participants with granted consent who are still taking part", async () => {
      const { studyId, conditionIds } = await createStudy(t.pool, { slug: "consent-study", snapshotId: snap, manifestId: manifest });
      // The public demo ("auto") is available until a real study becomes active.
      expect(await realStudyActive(t.db)).toBe(false);
      expect(await publicDemoGate(() => t.db, "auto")()).toBe(true);
      await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
      expect(await publicDemoGate(() => t.db, "auto")()).toBe(false);
      expect(await publicDemoGate(() => t.db, "on")()).toBe(true);

      await expect(createSession(t.pool, studyId, conditionIds.c2d, "P-NOCONSENT", 0, { consent: false })).rejects.toThrow(
        /cannot allocate: participant has no consent record/,
      );

      const p = await one<{ id: string }>(t.pool, "INSERT INTO participants (study_id, code) VALUES ($1, 'P-DECLINED') RETURNING id", [studyId]);
      await recordConsent(t.pool, p.id, "granted");
      await recordConsent(t.pool, p.id, "withdrawn");
      const alloc = (participantId: string, seq: number) =>
        t.pool.query(
          `INSERT INTO allocations (study_id, participant_id, condition_id, algorithm, seed, sequence_index, study_protocol_version)
           VALUES ($1, $2, $3, 'block', 's', $4, 'p1')`,
          [studyId, participantId, conditionIds.c2d, seq],
        );
      await expect(alloc(p.id, 10)).rejects.toThrow(/participant consent is withdrawn/);

      const w = await one<{ id: string }>(
        t.pool,
        "INSERT INTO participants (study_id, code, status, withdrawn_at) VALUES ($1, 'P-WITHDRAWN', 'withdrawn', now()) RETURNING id",
        [studyId],
      );
      await recordConsent(t.pool, w.id, "granted");
      await expect(alloc(w.id, 11)).rejects.toThrow(/participant is withdrawn/);

      await expect(createSession(t.pool, studyId, conditionIds.c2d, "P-GRANTED", 12)).resolves.toBeDefined();
    });

    it("records the content set per period in within-subjects designs and copies it to the session", async () => {
      const s = await one<{ id: string }>(
        t.pool,
        `INSERT INTO studies (slug, title, protocol_version, design, snapshot_id, manifest_id, config)
         VALUES ('within-study', 'Within', 'p1', 'within', $1, $2, '{"contentSets": {"set-a": {}, "set-b": {}}}') RETURNING id`,
        [snap, manifest],
      );
      const c2d = await one<{ id: string }>(
        t.pool,
        "INSERT INTO study_conditions (study_id, code, label, interface, position) VALUES ($1, 'conventional', '2D', 'conventional_2d', 0) RETURNING id",
        [s.id],
      );
      await t.pool.query(
        "INSERT INTO study_conditions (study_id, code, label, interface, position) VALUES ($1, 'immersive', '3D', 'immersive_3d', 1)",
        [s.id],
      );
      await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [s.id]);

      await expect(createSession(t.pool, s.id, c2d.id, "W-0001", 0)).rejects.toThrow(/must record its content set/);
      await expect(createSession(t.pool, s.id, c2d.id, "W-0002", 1, { contentSetCode: "set-z" })).rejects.toThrow(
        /content set set-z is not declared/,
      );
      const ok = await createSession(t.pool, s.id, c2d.id, "W-0003", 2, { contentSetCode: "set-a" });
      const row = await one<{ content_set_code: string; compiler_version: string }>(
        t.pool,
        "SELECT content_set_code, compiler_version FROM study_sessions WHERE id = $1",
        [ok.sessionId],
      );
      expect(row).toEqual({ content_set_code: "set-a", compiler_version: "test-1.0.0" });
      await expect(t.pool.query("UPDATE study_sessions SET content_set_code = 'set-b' WHERE id = $1", [ok.sessionId])).rejects.toThrow(
        /immutable/,
      );
    });

    it("activates only on a released release manifest, which records the database environment", async () => {
      const rel = await one<{ id: string; db_environment: { serverVersionNum: number; extensions: Record<string, string> } }>(
        t.pool,
        `INSERT INTO release_manifests (version_label, snapshot_id, spatial_manifest_id, app_build, db_environment)
         VALUES ('rel-1', $1, $2, 'build-1', '{"forged": true}') RETURNING id, db_environment`,
        [snap, manifest],
      );
      expect(rel.db_environment.serverVersionNum).toBeGreaterThanOrEqual(180000);
      expect(rel.db_environment.extensions).toHaveProperty("vector");

      const { studyId } = await createStudy(t.pool, { slug: "release-study", snapshotId: snap, manifestId: manifest });
      await t.pool.query("UPDATE studies SET release_manifest_id = $2 WHERE id = $1", [studyId, rel.id]);
      await expect(t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId])).rejects.toThrow(
        /released release manifest/,
      );
      await t.pool.query("UPDATE release_manifests SET status = 'released', released_by = $2 WHERE id = $1", [rel.id, curator]);
      await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
      await expect(t.pool.query("UPDATE release_manifests SET app_build = 'other' WHERE id = $1", [rel.id])).rejects.toThrow(
        /can only be withdrawn|is frozen/,
      );
    });

    it("rejects a battery whose reference map is bound to another snapshot", async () => {
      const other = await createSnapshot(t.pool, { label: "st-other", createdBy: curator });
      await publishSnapshot(t.pool, other, curator);
      const a = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessments (code, version, kind, title) VALUES ('recon', 1, 'reconstruction', 'Reconstruction') RETURNING id",
      );
      await t.pool.query("INSERT INTO reference_maps (assessment_id, version, title, snapshot_id) VALUES ($1, 1, 'Ref', $2)", [a.id, other]);
      await t.pool.query("UPDATE assessments SET status = 'locked' WHERE id = $1", [a.id]);
      const { studyId } = await createStudy(t.pool, { slug: "refmap-study", snapshotId: snap, manifestId: manifest });
      await t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) VALUES ($1, $2, 'post', 0)", [studyId, a.id]);
      await expect(t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId])).rejects.toThrow(
        /bound to the study snapshot/,
      );
    });
  });

  // ---------------------------------------------------------------------------------------
  describe("telemetry and raw participant data", () => {
    let studyId: string;
    let conceptInSnapshot: string;
    let conceptOutside: string;
    let sess: Awaited<ReturnType<typeof createSession>>;
    let c2d: string;

    beforeAll(async () => {
      const g = await createRealGraph(t.pool, { prefix: "tm", acceptBy: curator });
      conceptInSnapshot = g.conceptIds[0];
      conceptOutside = g.conceptIds[1];
      const snap = await createSnapshot(t.pool, { label: "tm-snap", createdBy: curator });
      await addSnapshotItem(t.pool, snap, "concept", conceptInSnapshot);
      await publishSnapshot(t.pool, snap, curator);
      const manifest = await createPublishedManifest(t.pool, snap, { by: curator });
      const study = await createStudy(t.pool, { slug: "tm-study", snapshotId: snap, manifestId: manifest });
      studyId = study.studyId;
      c2d = study.conditionIds.c2d;
      await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
      sess = await createSession(t.pool, studyId, c2d, "T-0001", 0);
    });

    const event = (
      s: { sessionId: string; participantId: string },
      seq: number,
      extra: { contentVersion?: string; conceptId?: string | null; compilerVersion?: string | null; clientTs?: string } = {},
    ) =>
      t.pool.query(
        `INSERT INTO telemetry_events (event_id, schema_version, study_id, participant_id, session_id, condition_id,
           client_ts, seq, event_type_code, app_build, content_version, concept_id, compiler_version)
         VALUES ($1, 1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7, 'page_entered', 'test-build', $8, $9, $10)
         RETURNING compiler_version`,
        [
          randomUUID(),
          studyId,
          s.participantId,
          s.sessionId,
          c2d,
          extra.clientTs ?? null,
          seq,
          extra.contentVersion ?? "tm-snap",
          extra.conceptId ?? null,
          extra.compilerVersion ?? null,
        ],
      );

    it("accepts only events consistent with the session snapshot and manifest", async () => {
      const ok = await event(sess, 1, { conceptId: conceptInSnapshot });
      expect(ok.rows[0].compiler_version).toBe("test-1.0.0");
      await expect(event(sess, 2, { contentVersion: "some-other-version" })).rejects.toThrow(/content version/);
      await expect(event(sess, 3, { conceptId: conceptOutside })).rejects.toThrow(/concept is not part of the session snapshot/);
      await expect(event(sess, 4, { compilerVersion: "9.9.9" })).rejects.toThrow(/compiler version differs/);
    });

    it("rejects events for withdrawn participants and after a session ended", async () => {
      const done = await createSession(t.pool, studyId, c2d, "T-0002", 1);
      await t.pool.query("UPDATE study_sessions SET status = 'completed', completed_at = now() WHERE id = $1", [done.sessionId]);
      await expect(event(done, 1, { clientTs: new Date(Date.now() - 60_000).toISOString() })).resolves.toBeDefined();
      await expect(event(done, 2, { clientTs: new Date(Date.now() + 60_000).toISOString() })).rejects.toThrow(/after it ended/);

      const gone = await createSession(t.pool, studyId, c2d, "T-0003", 2);
      await t.pool.query("UPDATE participants SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1", [gone.participantId]);
      await expect(event(gone, 1)).rejects.toThrow(/withdrawn participant/);
    });

    it("keeps responses append-only and deletable only in a reasoned purge", async () => {
      const a = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessments (code, version, kind, title) VALUES ('tm-pre', 1, 'pretest', 'Pre') RETURNING id",
      );
      const item = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt) VALUES ($1, 'q1', 0, 'short_text', 'Q?') RETURNING id",
        [a.id],
      );
      const r = await one<{ id: string }>(
        t.pool,
        `INSERT INTO responses (session_id, participant_id, assessment_id, item_id, status, raw, answered_at)
         VALUES ($1, $2, $3, $4, 'answered', '{"text":"a"}', now()) RETURNING id`,
        [sess.sessionId, sess.participantId, a.id, item.id],
      );
      await expect(t.pool.query("UPDATE responses SET raw = '{\"text\":\"b\"}' WHERE id = $1", [r.id])).rejects.toThrow(/append-only/);
      await expect(t.pool.query("DELETE FROM responses WHERE id = $1", [r.id])).rejects.toThrow(/research_purge_reason/);
      await withSettings(t.pool, { "app.research_purge_reason": "consent withdrawn (test)" }, (c) =>
        c.query("DELETE FROM responses WHERE id = $1", [r.id]),
      );
    });

    it("keeps every concept-map revision and freezes a final map with its edges", async () => {
      const a = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessments (code, version, kind, title) VALUES ('tm-recon', 1, 'reconstruction', 'Recon') RETURNING id",
      );
      const item = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt) VALUES ($1, 'map', 0, 'concept_map', 'Map it') RETURNING id",
        [a.id],
      );
      const m = await one<{ id: string }>(
        t.pool,
        `INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, raw)
         VALUES ($1, $2, $3, $4, 'post', '[{"key":"n1"}]', '{"v":1}') RETURNING id`,
        [sess.sessionId, sess.participantId, a.id, item.id],
      );
      await t.pool.query("INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key) VALUES ($1, 'e1', 'n1', 'n2')", [m.id]);
      await t.pool.query("UPDATE concept_maps SET nodes = '[{\"key\":\"n1\"},{\"key\":\"n2\"}]', raw = '{\"v\":2}' WHERE id = $1", [m.id]);
      await t.pool.query("UPDATE concept_maps SET is_final = true, submitted_at = now() WHERE id = $1", [m.id]);

      const revs = await t.pool.query<{ revision: number; raw: { v: number }; is_final: boolean }>(
        "SELECT revision, raw, is_final FROM concept_map_revisions WHERE concept_map_id = $1 ORDER BY revision",
        [m.id],
      );
      expect(revs.rows).toEqual([
        { revision: 1, raw: { v: 1 }, is_final: false },
        { revision: 2, raw: { v: 2 }, is_final: false },
        { revision: 3, raw: { v: 2 }, is_final: true },
      ]);

      await expect(t.pool.query("UPDATE concept_maps SET is_final = false WHERE id = $1", [m.id])).rejects.toThrow(/final concept map is immutable/);
      await expect(t.pool.query("DELETE FROM concept_map_edges WHERE concept_map_id = $1", [m.id])).rejects.toThrow(/final concept map/);
      await expect(
        t.pool.query("INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key) VALUES ($1, 'e2', 'n2', 'n1')", [m.id]),
      ).rejects.toThrow(/final concept map/);
      await expect(t.pool.query("UPDATE concept_map_revisions SET raw = '{}' WHERE concept_map_id = $1", [m.id])).rejects.toThrow(/append-only/);
      await expect(t.pool.query("DELETE FROM concept_maps WHERE id = $1", [m.id])).rejects.toThrow(/research_purge_reason/);
    });

    it("keeps scores against different reference maps side by side, append-only", async () => {
      const a = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessments (code, version, kind, title) VALUES ('tm-score', 1, 'reconstruction', 'Scored') RETURNING id",
      );
      const r1 = await one<{ id: string }>(t.pool, "INSERT INTO reference_maps (assessment_id, version, title) VALUES ($1, 1, 'R1') RETURNING id", [a.id]);
      const r2 = await one<{ id: string }>(t.pool, "INSERT INTO reference_maps (assessment_id, version, title) VALUES ($1, 2, 'R2') RETURNING id", [a.id]);
      const score = (ref: string) =>
        one<{ id: string }>(
          t.pool,
          `INSERT INTO derived_scores (session_id, participant_id, assessment_id, reference_map_id, metric_name, metric_version, value, pipeline_version)
           VALUES ($1, $2, $3, $4, 'edge_f1', '1', 0.5, 'p-1') RETURNING id`,
          [sess.sessionId, sess.participantId, a.id, ref],
        );
      const s1 = await score(r1.id);
      await expect(score(r2.id)).resolves.toBeDefined();
      await expect(score(r1.id)).rejects.toThrow(/derived_scores_uq/);
      await expect(t.pool.query("UPDATE derived_scores SET value = 1 WHERE id = $1", [s1.id])).rejects.toThrow(/append-only/);
    });
  });
});
