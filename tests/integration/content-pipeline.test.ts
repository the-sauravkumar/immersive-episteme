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
      expect(second.relationshipSources).toEqual({ inserted: 0, updated: 0, pruned: 0 });
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

    it("carries every claim's located evidence through the database", async () => {
      // Hash equality above would also hold if evidence were lost on both sides: check it directly.
      const r = await t.pool.query<{ total: number; with_evidence: number; passages: number }>(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE jsonb_array_length(evidence) > 0)::int AS with_evidence,
                coalesce(sum(jsonb_array_length(evidence)), 0)::int AS passages
           FROM concept_claim_sources WHERE NOT is_demo`,
      );
      const fileSources = loaded.model.concepts.reduce((s, c) => s + c.claims.reduce((n, cl) => n + new Set(cl.sourceRefs).size, 0), 0);
      const filePassages = loaded.model.concepts.reduce((s, c) => s + c.claims.reduce((n, cl) => n + cl.evidence.length, 0), 0);
      expect(r.rows[0]).toEqual({ total: fileSources, with_evidence: fileSources, passages: filePassages });
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
        // Images come only from the snapshot's asset links (what 2D can show), never from
        // unreviewed media candidates, although those are in the database (parity check a.media).
        const candidates = await t.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM media_candidates WHERE NOT is_demo");
        expect(candidates.rows[0]!.n).toBeGreaterThan(0);
        const linked = new Set((await loadSnapshotPayload(t.pool, snap.id)).concepts.flatMap((x) => x.assetIds));
        const shown = rec!.manifest.elements.flatMap((e) => ((e.assetRefs as { assetId: string; missing?: true }[] | undefined) ?? []).filter((r) => !r.missing).map((r) => r.assetId));
        expect(shown.filter((id) => !linked.has(id))).toEqual([]);
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

    it("keeps a curator's review decision, and follows the files only for states the importer set (knowledge-04)", async () => {
      const curator = await createUser(t.pool);
      const materials = loaded.model.concepts.filter((c) => c.type === "process_stage" && c.verificationState === "under_review");
      const [decided, fileDriven] = [materials[0]!.key, materials[1]!.key];
      await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test: curator rejects" }, (c) =>
        c.query("UPDATE concepts SET verification_state = 'rejected' WHERE key = $1", [decided]),
      );
      // The files now say needs_evidence for a row whose state the importer itself last set.
      const changed = { ...loaded.model, concepts: loaded.model.concepts.map((c) => (c.key === fileDriven ? { ...c, verificationState: "needs_evidence" as const } : c)) };
      const s = await run(changed);
      const state = async (key: string) => (await one<{ s: string }>(t.pool, "SELECT verification_state::text AS s FROM concepts WHERE key = $1", [key])).s;
      expect(await state(decided)).toBe("rejected");
      expect(await state(fileDriven)).toBe("needs_evidence");
      expect(s.concepts.keptCurated).toBeGreaterThanOrEqual(1);
      await run(); // restore the file state for the tests below
      expect(await state(fileDriven)).toBe("under_review");
      expect(await state(decided)).toBe("rejected");
    });

    it("never prunes a CMS-authored edge or one a spatial manifest encodes; reports them as stale (knowledge-04)", async () => {
      const curator = await createUser(t.pool);
      // An edge a curator added in the CMS between two imported concepts (package = the source concept's).
      const [a, b] = loaded.model.concepts.filter((c) => c.packageSlug === "ajrakh" && c.type === "process_stage");
      const cms = await one<{ id: string }>(
        t.pool,
        `INSERT INTO relationships (source_concept_id, target_concept_id, type_code, package_id, provenance_kind, verification_state, created_by)
         SELECT s.id, tc.id, 'SIMILAR_TO', s.package_id, 'historical_documentation', 'draft', $3
           FROM concepts s, concepts tc WHERE s.key = $1 AND tc.key = $2 RETURNING id`,
        [a!.key, b!.key, curator],
      );
      // An imported edge that the manifest compiled above encodes, then dropped from the files.
      const enc = await one<{ source: string; target: string; type: string }>(
        t.pool,
        `SELECT s.key AS source, tc.key AS target, r.type_code AS type
           FROM spatial_element_encodings e JOIN relationships r ON r.id = e.relationship_id
           JOIN concepts s ON s.id = r.source_concept_id JOIN concepts tc ON tc.id = r.target_concept_id LIMIT 1`,
      );
      const dropped = { ...loaded.model, relationships: loaded.model.relationships.filter((r) => !(r.source === enc.source && r.target === enc.target && r.type === enc.type)) };
      const s = await run(dropped);
      expect(s.stale.relationships).toEqual(expect.arrayContaining([`${a!.key} SIMILAR_TO ${b!.key}`, `${enc.source} ${enc.type} ${enc.target}`]));
      const left = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM relationships WHERE id = $1", [cms.id]);
      expect(left.n).toBe(1);
      await t.pool.query("DELETE FROM relationships WHERE id = $1", [cms.id]);
      await run();
    });

    it("leaves an accepted tradition's GI evidence alone, and any change to it reopens review (knowledge-09)", async () => {
      const curator = await createUser(t.pool);
      const pkg = loaded.model.packages.find((p) => p.kind === "tradition" && (p.gi?.sourceRefs.length ?? 0) > 0)!;
      await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test: accepted" }, (c) =>
        c.query("UPDATE traditions SET verification_state = 'verified' WHERE slug = $1", [pkg.slug]),
      );
      const gi = async () =>
        (await t.pool.query<{ source_id: string }>("SELECT ts.source_id::text FROM tradition_sources ts JOIN traditions tr ON tr.id = ts.tradition_id WHERE tr.slug = $1 AND ts.purpose = 'gi' ORDER BY 1", [pkg.slug])).rows.map((r) => r.source_id);
      const before = await gi();
      expect(before.length).toBeGreaterThan(0);
      const changed = { ...loaded.model, packages: loaded.model.packages.map((p) => (p.slug === pkg.slug ? { ...p, gi: p.gi ? { ...p.gi, sourceRefs: [] } : null } : p)) };
      await run(changed);
      expect(await gi()).toEqual(before);
      const state = async () => (await one<{ s: string }>(t.pool, "SELECT verification_state::text AS s FROM traditions WHERE slug = $1", [pkg.slug])).s;
      expect(await state()).toBe("verified");
      // Any writer that changes the evidence of an accepted tradition sends it back to review (0019 trigger).
      await t.pool.query("DELETE FROM tradition_sources ts USING traditions tr WHERE tr.id = ts.tradition_id AND tr.slug = $1 AND ts.purpose = 'gi'", [pkg.slug]);
      expect(await state()).toBe("under_review");
      await run(); // the files put the GI evidence back
      expect(await gi()).toEqual(before);
    });

    it("writes relationship evidence into its citation, keeps evidence the files do not carry, and never touches an accepted relationship", async () => {
      // Placeholder passages only (throwaway database): no craft facts.
      type Rel = (typeof loaded.model.relationships)[number];
      // Edges and endpoints still under review in the database (earlier tests decided some rows),
      // with real provenance, so one of them can be accepted below.
      const conceptByKey = new Map(loaded.model.concepts.map((c) => [c.key, c]));
      const dbState = new Map(
        (await t.pool.query<{ key: string; s: string }>("SELECT key, verification_state::text AS s FROM concepts WHERE NOT is_demo")).rows.map((x) => [x.key, x.s]),
      );
      const relState = new Map(
        (
          await t.pool.query<{ k: string; s: string }>(
            `SELECT s.key || '|' || x.type_code || '|' || tc.key AS k, x.verification_state::text AS s
               FROM relationships x JOIN concepts s ON s.id = x.source_concept_id JOIN concepts tc ON tc.id = x.target_concept_id WHERE NOT x.is_demo`,
          )
        ).rows.map((x) => [x.k, x.s]),
      );
      const usable = loaded.model.relationships.filter(
        (r) =>
          r.sourceRefs.length > 0 &&
          r.provenanceKind !== "unverified" &&
          relState.get(`${r.source}|${r.type}|${r.target}`) === "under_review" &&
          [r.source, r.target].every((k) => conceptByKey.get(k)?.provenanceKind !== "unverified" && dbState.get(k) === "under_review"),
      );
      // Three edges that share no endpoint, so accepting the third touches neither of the others.
      const picked: Rel[] = [];
      for (const r of usable) {
        if (picked.every((p) => ![p.source, p.target].some((k) => k === r.source || k === r.target))) picked.push(r);
        if (picked.length === 3) break;
      }
      expect(picked).toHaveLength(3);
      const [a, b, accepted] = picked;
      const citations = async (r: Rel) =>
        (
          await t.pool.query<{ ref: string; locator: string | null; quote: string | null }>(
            `SELECT p.slug || '#' || so.local_key AS ref, rs.locator, rs.quote
               FROM relationship_sources rs
               JOIN relationships x ON x.id = rs.relationship_id
               JOIN concepts s ON s.id = x.source_concept_id JOIN concepts tc ON tc.id = x.target_concept_id
               JOIN sources so ON so.id = rs.source_id JOIN content_packages p ON p.id = so.package_id
              WHERE s.key = $1 AND tc.key = $2 AND x.type_code = $3 ORDER BY 1`,
            [r.source, r.target, r.type],
          )
        ).rows;
      const withEvidence = (targets: Rel[], locator: string, quote: string) => ({
        ...loaded.model,
        relationships: loaded.model.relationships.map((r) => (targets.includes(r) ? { ...r, evidence: [{ ref: r.sourceRefs[0]!, locator, quote }] } : r)),
      });

      // 1. The file passage lands in that citation, and only there.
      const s1 = await run(withEvidence([a!], "PDF p. 1", "a placeholder passage"));
      expect(s1.relationshipSources).toEqual({ inserted: 0, updated: 1, pruned: 0 });
      const aRows = await citations(a!);
      expect(aRows.find((x) => x.ref === a!.sourceRefs[0])).toMatchObject({ locator: "PDF p. 1", quote: "a placeholder passage" });
      expect(aRows.filter((x) => x.ref !== a!.sourceRefs[0]).every((x) => x.locator === null && x.quote === null)).toBe(true);

      // 2. Unchanged files write nothing; a file without the passage never clears it, nor one a
      //    curator entered in the CMS.
      await t.pool.query(
        `UPDATE relationship_sources rs SET locator = 'p. 2', quote = 'a curator placeholder'
           FROM relationships x, concepts s, concepts tc
          WHERE x.id = rs.relationship_id AND s.id = x.source_concept_id AND tc.id = x.target_concept_id
            AND s.key = $1 AND tc.key = $2 AND x.type_code = $3`,
        [b!.source, b!.target, b!.type],
      );
      expect((await run(withEvidence([a!], "PDF p. 1", "a placeholder passage"))).relationshipSources).toEqual({ inserted: 0, updated: 0, pruned: 0 });
      expect((await run()).relationshipSources).toEqual({ inserted: 0, updated: 0, pruned: 0 });
      expect((await citations(a!)).find((x) => x.ref === a!.sourceRefs[0])).toMatchObject({ locator: "PDF p. 1", quote: "a placeholder passage" });
      expect((await citations(b!)).every((x) => x.locator === "p. 2" && x.quote === "a curator placeholder")).toBe(true);

      // 3. A changed passage replaces the stored one.
      expect((await run(withEvidence([a!], "PDF p. 3", "a corrected placeholder passage"))).relationshipSources).toEqual({ inserted: 0, updated: 1, pruned: 0 });
      expect((await citations(a!)).find((x) => x.ref === a!.sourceRefs[0])).toMatchObject({ locator: "PDF p. 3", quote: "a corrected placeholder passage" });

      // 4. An accepted relationship keeps the citations its reviewer checked.
      const curator = await createUser(t.pool);
      await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test: accepted" }, async (c) => {
        await c.query("UPDATE concepts SET verification_state = 'verified' WHERE key = ANY($1::text[])", [[accepted!.source, accepted!.target]]);
        await c.query(
          `UPDATE relationships x SET verification_state = 'verified' FROM concepts s, concepts tc
            WHERE s.id = x.source_concept_id AND tc.id = x.target_concept_id AND s.key = $1 AND tc.key = $2 AND x.type_code = $3`,
          [accepted!.source, accepted!.target, accepted!.type],
        );
      });
      const before = await citations(accepted!);
      const s4 = await run(withEvidence([accepted!], "PDF p. 4", "a placeholder passage"));
      expect(s4.relationshipSources.updated).toBe(0);
      expect(s4.relationships.keptAccepted).toBeGreaterThanOrEqual(1);
      expect(await citations(accepted!)).toEqual(before);
    });
  });
});
