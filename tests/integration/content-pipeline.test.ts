/**
 * Integration: content/ -> importer -> REVIEW snapshot -> read model / search -> spatial
 * manifest -> learning context (demo/preview), against a throwaway database (schema-harness).
 * content/ is only read.
 */
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nodeSha256 } from "../../src/features/knowledge/graph/hash-node";
import { buildSnapshot } from "../../src/features/knowledge/graph/snapshot";
import { createKnowledgeView } from "../../src/features/knowledge/read/view";
import { importContent, ContentImportRefused, type ImportSummary } from "../../src/server/content/import-content";
import { storeReviewSnapshot, type StoredReviewSnapshot } from "../../src/server/content/review-snapshot";
import { loadSnapshotPayload, searchSnapshotConcepts, SnapshotNotReadableError, latestReviewSnapshotId } from "../../src/server/knowledge/snapshot-store";
import { pgLearningContextData, resolveLearningContext } from "../../src/server/learning/context-data";
import { compileAndStoreManifest, loadManifest } from "../../src/server/spatial/manifest-store";
import { REPO_ROOT, loadAndValidate } from "../../scripts/content/_shared";
import { TEST_URL, createSnapshot, createStudy, createTestDatabase, createUser, one, withSettings, type TestDb } from "./schema-harness";

const SHORTLIST = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"];

describe.skipIf(!TEST_URL)("content pipeline", () => {
  let t: TestDb;
  const loaded = loadAndValidate(join(REPO_ROOT, "content"));
  let first: ImportSummary;
  let snap: StoredReviewSnapshot;

  const run = async (model = loaded.model) => {
    const c = await t.pool.connect();
    try {
      return await importContent(c, { model, issues: loaded.report.issues, hasher: nodeSha256, invokedBy: "test" });
    } finally {
      c.release();
    }
  };
  const snapshot = async () => {
    const c = await t.pool.connect();
    try {
      return await storeReviewSnapshot(c, { hasher: nodeSha256, generatedAt: "2026-10-14T00:00:00.000Z" });
    } finally {
      c.release();
    }
  };

  beforeAll(async () => {
    t = await createTestDatabase("content");
    first = await run();
    snap = await snapshot();
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  describe("importer", () => {
    it("loads every file entity with stable ids", async () => {
      const m = loaded.model;
      expect(first.concepts.inserted).toBe(m.concepts.length);
      expect(first.relationships.inserted).toBe(m.relationships.length);
      expect(first.sources.inserted).toBe(m.sources.length);
      expect(first.claims.inserted).toBe(m.concepts.reduce((n, c) => n + c.claims.length, 0));
      expect(first.traditions.inserted).toBe(m.packages.filter((p) => p.kind === "tradition").length);
      expect(first.mediaCandidates.inserted).toBe(m.packages.reduce((n, p) => n + p.mediaCandidates.length, 0));
      const c = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM concepts WHERE NOT is_demo");
      expect(c.n).toBe(m.concepts.length);
    });

    it("keeps every review state exactly as in the files, never accepted, never demo", async () => {
      const r = await t.pool.query<{ key: string; verification_state: string; is_demo: boolean }>("SELECT key, verification_state, is_demo FROM concepts");
      const byKey = new Map(loaded.model.concepts.map((c) => [c.key, c.verificationState]));
      for (const row of r.rows) {
        expect(row.verification_state).toBe(byKey.get(row.key));
        expect(row.is_demo).toBe(false);
      }
      const accepted = await one<{ n: number }>(
        t.pool,
        `SELECT (SELECT count(*) FROM concepts WHERE verification_state IN ('verified','published'))
              + (SELECT count(*) FROM relationships WHERE verification_state IN ('verified','published'))
              + (SELECT count(*) FROM sources WHERE verification_state IN ('verified','published'))
              + (SELECT count(*) FROM traditions WHERE verification_state IN ('verified','published')) AS n`,
      );
      expect(Number(accepted.n)).toBe(0);
    });

    it("stores media dimensions and licence", async () => {
      const withDims = loaded.model.packages.flatMap((p) => p.mediaCandidates).filter((m) => m.width && m.height);
      const r = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM media_candidates WHERE width IS NOT NULL AND height IS NOT NULL AND licence IS NOT NULL");
      expect(r.n).toBe(withDims.filter((m) => m.licence).length);
      expect(withDims.length).toBeGreaterThan(0);
    });

    it("writes an audit_log entry per run", async () => {
      const r = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'content.import'");
      expect(r.n).toBeGreaterThanOrEqual(1);
    });

    it("is idempotent: a second run changes nothing", async () => {
      const second = await run();
      for (const k of ["packages", "traditions", "sources", "concepts", "claims", "relationships"] as const) {
        expect(second[k].inserted, k).toBe(0);
        expect(second[k].updated, k).toBe(0);
      }
      expect(second.claimSources).toEqual({ inserted: 0, pruned: 0 });
      expect(second.relationshipSources).toEqual({ inserted: 0, pruned: 0 });
      expect(second.pruned).toEqual({ claims: 0, relationships: 0 });
      const again = await snapshot();
      expect(again.created).toBe(false);
      expect(again.id).toBe(snap.id);
    });

    it("refuses content with error-level integrity issues", async () => {
      const c = await t.pool.connect();
      try {
        await expect(
          importContent(c, { model: loaded.model, issues: [{ code: "KG201", severity: "error", message: "x" }], hasher: nodeSha256 }),
        ).rejects.toBeInstanceOf(ContentImportRefused);
      } finally {
        c.release();
      }
    });
  });

  describe("review snapshot", () => {
    it("is a draft, unverified, non-demo review row with one item per entity", async () => {
      const row = await one<{ kind: string; status: string; includes_unverified: boolean; is_demo: boolean; items: number }>(
        t.pool,
        "SELECT kind, status, includes_unverified, is_demo, (SELECT count(*)::int FROM snapshot_items WHERE snapshot_id = s.id) AS items FROM content_snapshots s WHERE id = $1",
        [snap.id],
      );
      expect(row).toEqual({ kind: "review", status: "draft", includes_unverified: true, is_demo: false, items: snap.itemCount });
      expect(snap.versionLabel).toMatch(/^review-[0-9a-f]{12}$/);
    });

    it("is the same bundle as the file-built review snapshot (lossless import)", () => {
      const fromFiles = buildSnapshot(loaded.model, { kind: "review", hasher: nodeSha256, generatedAt: "2026-10-14T00:00:00.000Z", issues: loaded.report.issues });
      expect(fromFiles.ok).toBe(true);
      if (fromFiles.ok) expect(snap.contentSha256).toBe(fromFiles.snapshot.contentSha256);
    });

    it("can never be published, relabelled or used by a non-demo study", async () => {
      const curator = await createUser(t.pool);
      await expect(
        t.pool.query("UPDATE content_snapshots SET status = 'published', published_by = $2 WHERE id = $1", [snap.id, curator]),
      ).rejects.toThrow(/content_snapshots_review_ck/);
      await expect(t.pool.query("UPDATE content_snapshots SET kind = 'release' WHERE id = $1", [snap.id])).rejects.toThrow(/kind cannot change/);
      await expect(createStudy(t.pool, { slug: "real-on-review", snapshotId: snap.id })).rejects.toThrow(/non-demo study cannot use a review snapshot/);
      const demo = await createStudy(t.pool, { slug: "demo-on-review", snapshotId: snap.id, isDemo: true, allowUnverified: true });
      // Even a demo study cannot be activated on it: activation needs a published snapshot.
      await expect(t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [demo.studyId])).rejects.toThrow(/published content snapshot/);
    });
  });

  describe("read model and search", () => {
    it("reads the immutable payload and refuses draft release snapshots", async () => {
      const bundle = await loadSnapshotPayload(t.pool, snap.id);
      const v = createKnowledgeView(bundle);
      expect(v.listTraditions().map((x) => x.slug)).toEqual(loaded.model.packages.filter((p) => p.kind === "tradition").map((p) => p.slug).sort());
      for (const slug of SHORTLIST) {
        const chain = v.getProcessChain(slug)!;
        expect(chain.steps.length).toBeGreaterThan(3);
        const ordinals = chain.links.map((l) => l.ordinal!);
        expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
        expect(chain.steps.every((s) => s.type === "process_stage")).toBe(true);
      }
      const draft = await createSnapshot(t.pool, { label: "draft-release" });
      await expect(loadSnapshotPayload(t.pool, draft)).rejects.toBeInstanceOf(SnapshotNotReadableError);
      await expect(loadSnapshotPayload(t.pool, "not-a-uuid")).rejects.toBeInstanceOf(SnapshotNotReadableError);
    });

    it("finds concepts by full text and by trigram similarity, within the snapshot", async () => {
      const bundle = await loadSnapshotPayload(t.pool, snap.id);
      // Use a real title from the snapshot rather than an assumed craft term.
      const target = bundle.concepts.find((c) => c.type === "process_stage" && c.title.split(/\s+/)[0]!.length >= 5)!;
      const word = target.title.split(/\s+/)[0]!;
      const fts = await searchSnapshotConcepts(t.pool, snap.id, word, { limit: 50 });
      expect(fts.map((h) => h.conceptId)).toContain(target.id);
      expect(fts.find((h) => h.conceptId === target.id)!.fullText).toBeGreaterThan(0);
      const typo = word.slice(0, -1); // a prefix still matches by trigram
      const tri = await searchSnapshotConcepts(t.pool, snap.id, typo, { limit: 50 });
      expect(tri.length).toBeGreaterThan(0);
      const scoped = await searchSnapshotConcepts(t.pool, snap.id, word, { limit: 50, traditionId: target.traditionId! });
      expect(scoped.every((h) => bundle.concepts.find((c) => c.id === h.conceptId)!.traditionId === target.traditionId)).toBe(true);
      expect(await searchSnapshotConcepts(t.pool, snap.id, "a")).toEqual([]);
    });
  });

  describe("spatial manifests and learning context", () => {
    it("compiles, stores and reloads a manifest idempotently, with its element index", async () => {
      const c = await t.pool.connect();
      try {
        const m = await compileAndStoreManifest(c, { snapshotId: snap.id, traditions: SHORTLIST });
        expect(m).toMatchObject({ created: true, status: "valid", validationPassed: true, traditions: [...SHORTLIST].sort() });
        expect(m.manifestHash).toMatch(/^[0-9a-f]{64}$/);
        expect(m.elements).toBeGreaterThan(0);
        const again = await compileAndStoreManifest(c, { snapshotId: snap.id, traditions: [...SHORTLIST].reverse() });
        expect(again).toMatchObject({ created: false, id: m.id, manifestHash: m.manifestHash });
        const single = await compileAndStoreManifest(c, { snapshotId: snap.id, traditions: ["ajrakh"] });
        expect(single.id).not.toBe(m.id);
        const rec = await loadManifest(t.pool, m.id);
        expect(rec?.manifest.snapshotVersion).toBe(snap.versionLabel);
        expect(rec?.validation.compilerManifestHash).toBe(m.compilerManifestHash);
        // A non-demo study can never pin it (the manifest must come from the study snapshot, which cannot be a review snapshot).
        await expect(createStudy(t.pool, { slug: "real-manifest", manifestId: m.id })).rejects.toThrow(/snapshot/);
        await expect(createStudy(t.pool, { slug: "real-manifest-2", snapshotId: snap.id, manifestId: m.id })).rejects.toThrow(/review snapshot/);
      } finally {
        c.release();
      }
    });

    it("gives demo and preview the newest review snapshot, non-experimental and unverified", async () => {
      expect(await latestReviewSnapshotId(t.pool)).toBe(snap.id);
      const m = await one<{ id: string }>(t.pool, "SELECT id FROM spatial_manifests WHERE snapshot_id = $1 AND cardinality(traditions) = 3", [snap.id]);
      await t.pool.query("UPDATE studies SET manifest_id = $2, config = $3::jsonb WHERE slug = 'demo-on-review' AND snapshot_id = $1", [
        snap.id,
        m.id,
        JSON.stringify({ traditionSlugs: SHORTLIST, nonExperimental: true }),
      ]);
      const data = pgLearningContextData(t.pool);
      const demo = await resolveLearningContext({ kind: "demo", experimental: false, condition: "immersive", demoId: "demo1234567890abcdef" }, { data, appBuild: "test" });
      expect(demo).toMatchObject({
        mode: "demo",
        snapshotId: snap.id,
        contentVersion: snap.versionLabel,
        manifestId: m.id,
        sessionId: null,
        participantPseudonym: null,
        nonExperimental: true,
        unverifiedContent: true,
        traditionSlugs: SHORTLIST,
      });
      const preview = await resolveLearningContext({ kind: "staff_preview", experimental: false, condition: "2d", userId: "u1" }, { data, appBuild: "test" });
      expect(preview).toMatchObject({ mode: "preview", snapshotId: snap.id, nonExperimental: true });
      expect(preview.telemetrySessionId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("keeps curator-accepted rows untouched on re-import", async () => {
      const curator = await createUser(t.pool);
      const key = loaded.model.concepts.find((c) => c.type === "material")!.key;
      await withSettings(t.pool, { "app.actor_id": curator }, (c) => c.query("UPDATE concepts SET verification_state = 'verified' WHERE key = $1", [key]));
      const changed = { ...loaded.model, concepts: loaded.model.concepts.map((c) => (c.key === key ? { ...c, title: `${c.title} (edited)` } : c)) };
      const s = await run(changed);
      expect(s.concepts.keptAccepted).toBe(1);
      const row = await one<{ title: string; verification_state: string }>(t.pool, "SELECT title, verification_state FROM concepts WHERE key = $1", [key]);
      expect(row.verification_state).toBe("verified");
      expect(row.title.endsWith("(edited)")).toBe(false);
    });
  });
});
