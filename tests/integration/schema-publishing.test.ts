/**
 * Integration: published content snapshots and spatial manifests are immutable, snapshots
 * cannot mix demo and real content, and studies cannot use demo content.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

describe.skipIf(!TEST_URL)("schema: publishing and study integrity", () => {
  let t: TestDb;
  let curator: string;
  let real: Awaited<ReturnType<typeof createRealGraph>>;
  let demoConceptId: string;

  beforeAll(async () => {
    t = await createTestDatabase("publishing");
    curator = await createUser(t.pool);
    real = await createRealGraph(t.pool, { prefix: "pub", acceptBy: curator });
    demoConceptId = (
      await one<{ id: string }>(
        t.pool,
        `INSERT INTO concepts (key, slug, type, category_code, title, provenance_kind, is_demo)
         VALUES ('demo-p.material.m1', 'demo-p-material-m1', 'material', 'materials', 'Demo: m1', 'unverified', true) RETURNING id`,
      )
    ).id;
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  async function publishedRealSnapshot(label: string): Promise<string> {
    const id = await createSnapshot(t.pool, { label, createdBy: curator });
    await addSnapshotItem(t.pool, id, "concept", real.conceptIds[0]);
    await addSnapshotItem(t.pool, id, "relationship", real.relationshipId);
    await addSnapshotItem(t.pool, id, "category", "process_stages");
    await publishSnapshot(t.pool, id, curator);
    return id;
  }

  describe("content snapshots", () => {
    it("derives the payload hash in the database and ignores key order", async () => {
      const a = await createSnapshot(t.pool, { label: "hash-a" });
      const r = await one<{ h: string; expected: string }>(
        t.pool,
        `SELECT payload_sha256 AS h, encode(sha256(convert_to(payload::text, 'UTF8')), 'hex') AS expected FROM content_snapshots WHERE id = $1`,
        [a],
      );
      expect(r.h).toMatch(/^[0-9a-f]{64}$/);
      expect(r.h).toBe(r.expected);
      const same = await one<{ h: string }>(t.pool, "SELECT ie_jsonb_sha256('{\"b\":1,\"a\":2}'::jsonb) = ie_jsonb_sha256('{\"a\":2, \"b\":1}'::jsonb) AS h");
      expect(same.h).toBe(true);
      await expect(t.pool.query("UPDATE content_snapshots SET payload_sha256 = 'x' WHERE id = $1", [a])).rejects.toThrow(/can only be updated to DEFAULT|generated column/);
    });

    it("rejects UPDATE and DELETE of a published snapshot and freezes its items", async () => {
      const id = await publishedRealSnapshot("v1.0.0");
      const snap = await one<{ status: string; item_count: number; published_at: Date | null }>(
        t.pool,
        "SELECT status, item_count, published_at FROM content_snapshots WHERE id = $1",
        [id],
      );
      expect(snap).toMatchObject({ status: "published", item_count: 3 });
      expect(snap.published_at).not.toBeNull();

      await expect(t.pool.query("UPDATE content_snapshots SET title = 'changed' WHERE id = $1", [id])).rejects.toThrow(/is immutable/);
      await expect(t.pool.query("UPDATE content_snapshots SET payload = '{}' WHERE id = $1", [id])).rejects.toThrow(/is immutable/);
      await expect(t.pool.query("UPDATE content_snapshots SET status = 'draft' WHERE id = $1", [id])).rejects.toThrow(/is immutable/);
      await expect(t.pool.query("DELETE FROM content_snapshots WHERE id = $1", [id])).rejects.toThrow(/cannot be deleted/);
      await expect(addSnapshotItem(t.pool, id, "source", real.sourceId)).rejects.toThrow(/immutable/);
      await expect(t.pool.query("UPDATE snapshot_items SET item_sha256 = $2 WHERE snapshot_id = $1", [id, "b".repeat(64)])).rejects.toThrow(/immutable/);
      await expect(t.pool.query("DELETE FROM snapshot_items WHERE snapshot_id = $1", [id])).rejects.toThrow(/immutable/);
    });

    it("lets a draft snapshot be edited and deleted", async () => {
      const id = await createSnapshot(t.pool, { label: "draft-1" });
      await addSnapshotItem(t.pool, id, "concept", real.conceptIds[1]);
      await t.pool.query("UPDATE content_snapshots SET title = 'edited' WHERE id = $1", [id]);
      await t.pool.query("DELETE FROM content_snapshots WHERE id = $1", [id]);
      const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM snapshot_items WHERE snapshot_id = $1", [id]);
      expect(n.n).toBe(0);
    });

    it("never mixes demo and real content", async () => {
      const realSnap = await createSnapshot(t.pool, { label: "mix-real", includesUnverified: true });
      await expect(addSnapshotItem(t.pool, realSnap, "concept", demoConceptId)).rejects.toThrow(
        /demo content cannot be included in a non-demo snapshot/,
      );
      // The item row itself cannot claim to be demo inside a real snapshot (composite FK).
      await expect(addSnapshotItem(t.pool, realSnap, "concept", demoConceptId, true)).rejects.toThrow(
        /snapshot_items_snapshot_fk|demo content cannot be included/,
      );

      const demoSnap = await createSnapshot(t.pool, { label: "demo-mix", isDemo: true, includesUnverified: true });
      await expect(addSnapshotItem(t.pool, demoSnap, "concept", real.conceptIds[0], true)).rejects.toThrow(
        /real content cannot be included in a demo snapshot/,
      );
      await expect(addSnapshotItem(t.pool, demoSnap, "concept", demoConceptId, true)).resolves.toBeUndefined();
    });

    it("admits unverified content only into snapshots that explicitly allow it", async () => {
      const g = await createRealGraph(t.pool, { prefix: "unverified" });
      const strict = await createSnapshot(t.pool, { label: "strict-1" });
      await expect(addSnapshotItem(t.pool, strict, "concept", g.conceptIds[0])).rejects.toThrow(/does not allow unverified content/);
      const lenient = await createSnapshot(t.pool, { label: "lenient-1", includesUnverified: true });
      await expect(addSnapshotItem(t.pool, lenient, "concept", g.conceptIds[0])).resolves.toBeUndefined();
      await expect(addSnapshotItem(t.pool, lenient, "concept", "00000000-0000-7000-8000-000000000000")).rejects.toThrow(/does not exist/);
    });

    it("requires a publisher for real snapshots", async () => {
      const id = await createSnapshot(t.pool, { label: "nopub-1" });
      await expect(publishSnapshot(t.pool, id, null)).rejects.toThrow(/content_snapshots_published_ck/);
    });
  });

  describe("spatial manifests", () => {
    it("are immutable once published, except for supersession", async () => {
      const snap = await publishedRealSnapshot("v-spatial");
      const m = await createPublishedManifest(t.pool, snap, { by: curator });
      await expect(t.pool.query("UPDATE spatial_manifests SET manifest = '{}' WHERE id = $1", [m])).rejects.toThrow(/immutable/);
      await expect(t.pool.query("DELETE FROM spatial_manifests WHERE id = $1", [m])).rejects.toThrow(/cannot be deleted/);
      await expect(
        t.pool.query("INSERT INTO spatial_elements (manifest_id, element_id, kind, rule_id) VALUES ($1, 'room-1', 'room', 'r1')", [m]),
      ).rejects.toThrow(/immutable/);
      await t.pool.query("UPDATE spatial_manifests SET status = 'superseded' WHERE id = $1", [m]);
      await expect(t.pool.query("UPDATE spatial_manifests SET status = 'published' WHERE id = $1", [m])).rejects.toThrow(/immutable/);
    });

    it("cannot be published from a draft rule set or draft snapshot", async () => {
      const draftSnap = await createSnapshot(t.pool, { label: "draft-for-manifest" });
      const rs = await one<{ id: string }>(t.pool, "INSERT INTO mapping_rule_sets (name, version, config) VALUES ('rules-draft', 1, '{}') RETURNING id");
      await expect(
        t.pool.query(
          "INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, manifest, status) VALUES ($1, $2, '1', 's', '{}', 'published')",
          [draftSnap, rs.id],
        ),
      ).rejects.toThrow(/frozen rule set/);
      await t.pool.query("UPDATE mapping_rule_sets SET status = 'frozen' WHERE id = $1", [rs.id]);
      await expect(t.pool.query("UPDATE mapping_rule_sets SET config = '{\"x\":1}' WHERE id = $1", [rs.id])).rejects.toThrow(/frozen rule set/);
      await expect(
        t.pool.query(
          "INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, manifest, status) VALUES ($1, $2, '1', 's', '{}', 'published')",
          [draftSnap, rs.id],
        ),
      ).rejects.toThrow(/published snapshot/);
    });
  });

  describe("studies", () => {
    let demoSnap: string;
    beforeAll(async () => {
      demoSnap = await createSnapshot(t.pool, { label: "demo-study-snap", isDemo: true, includesUnverified: true });
      await addSnapshotItem(t.pool, demoSnap, "concept", demoConceptId, true);
      await publishSnapshot(t.pool, demoSnap, null); // demo snapshots may be published by the seed
    });

    it("never attach a demo snapshot to a non-demo study (draft or active)", async () => {
      await expect(createStudy(t.pool, { slug: "real-on-demo", snapshotId: demoSnap })).rejects.toThrow(
        /non-demo study cannot use a demo content snapshot/,
      );
      // Nor by switching the snapshot of an existing real study.
      const realSnap = await publishedRealSnapshot("v-study-1");
      const { studyId } = await createStudy(t.pool, { slug: "real-study-1", snapshotId: realSnap });
      await expect(t.pool.query("UPDATE studies SET snapshot_id = $2 WHERE id = $1", [studyId, demoSnap])).rejects.toThrow(
        /non-demo study cannot use a demo content snapshot/,
      );
      // Nor by flipping the study's demo flag.
      await expect(t.pool.query("UPDATE studies SET is_demo = true, slug = 'demo-flip', title = 'Demo: flip' WHERE id = $1", [studyId])).rejects.toThrow(
        /is_demo cannot change/,
      );
    });

    it("let a demo study run on a demo snapshot", async () => {
      const m = await createPublishedManifest(t.pool, demoSnap, { isDemo: true });
      const { studyId } = await createStudy(t.pool, { slug: "demo-ok", snapshotId: demoSnap, manifestId: m, isDemo: true, allowUnverified: true });
      await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);
      const s = await one<{ status: string }>(t.pool, "SELECT status FROM studies WHERE id = $1", [studyId]);
      expect(s.status).toBe("active");
    });

    it("refuse a non-demo assessment battery containing demo assessments", async () => {
      const { studyId } = await createStudy(t.pool, { slug: "battery-check" });
      const a = await one<{ id: string }>(
        t.pool,
        "INSERT INTO assessments (code, version, kind, title, is_demo) VALUES ('demo-pre', 1, 'pretest', 'Demo: pre', true) RETURNING id",
      );
      await expect(
        t.pool.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position) VALUES ($1, $2, 'pre', 0)", [studyId, a.id]),
      ).rejects.toThrow(/cannot include a demo assessment/);
    });

    it("activate only on published content and then freeze the protocol", async () => {
      const draftSnap = await createSnapshot(t.pool, { label: "v-draft-study" });
      const draftStudy = await createStudy(t.pool, { slug: "on-draft", snapshotId: draftSnap });
      await expect(t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [draftStudy.studyId])).rejects.toThrow(
        /published content snapshot/,
      );

      const snap = await publishedRealSnapshot("v-study-2");
      const noManifest = await createStudy(t.pool, { slug: "no-manifest", snapshotId: snap });
      await expect(t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [noManifest.studyId])).rejects.toThrow(
        /needs a spatial manifest/,
      );

      const manifest = await createPublishedManifest(t.pool, snap, { by: curator });
      const { studyId, conditionIds } = await createStudy(t.pool, { slug: "real-study-2", snapshotId: snap, manifestId: manifest });
      await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId]);

      await expect(t.pool.query("UPDATE studies SET config = '{\"changed\":true}' WHERE id = $1", [studyId])).rejects.toThrow(/frozen/);
      await expect(t.pool.query("UPDATE studies SET status = 'draft' WHERE id = $1", [studyId])).rejects.toThrow(/cannot return to draft/);
      await expect(
        t.pool.query("INSERT INTO study_conditions (study_id, code, label, interface) VALUES ($1, 'extra', 'x', 'conventional_2d')", [studyId]),
      ).rejects.toThrow(/frozen/);

      // Sessions inherit the study's snapshot and manifest.
      const sess = await createSession(t.pool, studyId, conditionIds.c2d, "P-0001");
      const row = await one<{ snapshot_id: string; manifest_id: string }>(
        t.pool,
        "SELECT snapshot_id, manifest_id FROM study_sessions WHERE id = $1",
        [sess.sessionId],
      );
      expect(row).toEqual({ snapshot_id: snap, manifest_id: manifest });
      await expect(t.pool.query("UPDATE study_sessions SET app_build = 'other' WHERE id = $1", [sess.sessionId])).rejects.toThrow(/immutable/);
      await expect(t.pool.query("UPDATE allocations SET seed = 'x' WHERE id = $1", [sess.allocationId])).rejects.toThrow(/append-only/);

      // A session cannot claim a condition of another study (composite FK).
      const other = await createStudy(t.pool, { slug: "other-study", snapshotId: snap, manifestId: manifest });
      await expect(
        t.pool.query(
          "INSERT INTO allocations (study_id, participant_id, condition_id, period, algorithm, seed, sequence_index, study_protocol_version) VALUES ($1, $2, $3, 2, 'block', 's', 99, 'p1')",
          [studyId, sess.participantId, other.conditionIds.c3d],
        ),
      ).rejects.toThrow(/allocations_condition_fk/);

      await t.pool.query("UPDATE studies SET status = 'closed' WHERE id = $1", [studyId]);
      await expect(t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [studyId])).rejects.toThrow(/cannot be reopened/);
    });

    it("refuse sessions in a draft study", async () => {
      const { studyId, conditionIds } = await createStudy(t.pool, { slug: "draft-sessions" });
      await expect(createSession(t.pool, studyId, conditionIds.c2d, "P-0002")).rejects.toThrow(/active study/);
    });
  });
});
