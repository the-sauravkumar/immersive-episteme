import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nodeSha256 } from "../../src/features/knowledge/graph/hash-node";
import { buildSnapshot } from "../../src/features/knowledge/graph/snapshot";
import { createKnowledgeView } from "../../src/features/knowledge/read/view";
import type { Actor } from "../../src/server/cms/core";
import { EVIDENCE_CHECK_KEYS } from "../../src/server/cms/schemas";
import { transition } from "../../src/server/cms/workflow";
import { importContent, ContentImportRefused, type ImportSummary } from "../../src/server/content/import-content";
import { storeReviewSnapshot, type StoredReviewSnapshot } from "../../src/server/content/review-snapshot";
import { loadSnapshotPayload, SnapshotNotReadableError } from "../../src/server/knowledge/snapshot-store";
import { pgLearningContextData, resolveLearningContext } from "../../src/server/learning/context-data";
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
  });

  describe("learning context", () => {
    it("gives demo and preview the newest review snapshot", async () => {
      const data = pgLearningContextData(t.pool);
      const demo = await resolveLearningContext({ kind: "demo", experimental: false, condition: "immersive", demoId: "demo1234567890abcdef" }, { data, appBuild: "test" });
      expect(demo).toMatchObject({ mode: "demo", contentVersion: snap.versionLabel, sessionId: null });
      const preview = await resolveLearningContext({ kind: "staff_preview", experimental: false, condition: "2d", userId: "u1" }, { data, appBuild: "test" });
      expect(preview).toMatchObject({ mode: "preview", contentVersion: snap.versionLabel });
      expect(preview.telemetrySessionId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("keeps the previews on the review snapshot the demo study is pinned to when a newer one is rebuilt from the CMS (DR-114)", async () => {
      const newer = await one<{ id: string }>(
        t.pool,
        `INSERT INTO content_snapshots (version_label, title, kind, status, schema_version, payload, includes_unverified, is_demo, created_at)
         SELECT 'review-rebuilt-later', title, 'review', 'draft', schema_version, payload, true, false, created_at + interval '1 hour' FROM content_snapshots WHERE id = $1
         RETURNING id`,
        [snap.id],
      );
      const preview = await resolveLearningContext({ kind: "staff_preview", experimental: false, condition: "2d", userId: "u1" }, { data: pgLearningContextData(t.pool), appBuild: "test" });
      expect(preview).toMatchObject({ mode: "preview", contentVersion: snap.versionLabel });
      await t.pool.query("DELETE FROM content_snapshots WHERE id = $1", [newer.id]);
    });

    it("updates accepted content the files changed and returns it to review on the record, until a curator accepts the new evidence (DR-126)", async () => {
      const curator: Actor = { userId: await createUser(t.pool), roles: ["curator"] };
      const target = loaded.model.concepts.filter((c) => c.packageSlug === "ajrakh" && c.type === "process_stage" && c.provenanceKind !== "unverified").at(-1)!;
      const conceptId = (await one<{ id: string }>(t.pool, "SELECT id FROM concepts WHERE key = $1", [target.key])).id;
      const accept = () =>
        transition(t.pool, curator, { entityKind: "concept", entityId: conceptId, to: "verified", reason: "test: checked against the recorded passages", evidenceChecked: [...EVIDENCE_CHECK_KEYS] });
      const row = async () =>
        one<{ s: string; text: string; evidence: { quote: string }[] }>(
          t.pool,
          `SELECT c.verification_state::text AS s, cc.text, ccs.evidence FROM concepts c
             JOIN concept_claims cc ON cc.concept_id = c.id AND cc.position = 0
             JOIN concept_claim_sources ccs ON ccs.claim_id = cc.id
            WHERE c.id = $1 ORDER BY ccs.source_id LIMIT 1`,
          [conceptId],
        );
      const item = async (snapshotId: string) =>
        (await one<{ sha: string }>(t.pool, "SELECT item_sha256 AS sha FROM snapshot_items WHERE snapshot_id = $1 AND item_kind = 'concept' AND entity_key = $2", [snapshotId, target.key])).sha;

      await accept();
      const unchanged = await run();
      expect(unchanged.concepts.keptAccepted).toBe(1);
      expect(unchanged.returnedToReview.concepts).toEqual([]);
      expect((await row()).s).toBe("verified");

      const [claim0, ...rest] = target.claims;
      const reworded = `${claim0!.text} (reworded in a test)`;
      const changed = {
        ...loaded.model,
        concepts: loaded.model.concepts.map((c) =>
          c.key === target.key ? { ...c, claims: [{ ...claim0!, text: reworded, evidence: claim0!.evidence.map((e) => ({ ...e, quote: "a reworded placeholder passage" })) }, ...rest] } : c,
        ),
      };
      const s = await run(changed);
      expect(s.returnedToReview.concepts).toEqual([target.key]);
      expect(s.concepts.keptAccepted).toBe(0);
      const after = await row();
      expect(after).toMatchObject({ s: "under_review", text: reworded });
      expect(after.evidence.every((e) => e.quote === "a reworded placeholder passage")).toBe(true);
      const record = await one<{ from_state: string; to_state: string; actor_id: string | null; reason: string }>(
        t.pool,
        "SELECT from_state::text, to_state::text, actor_id, reason FROM verification_records WHERE entity_kind = 'concept' AND entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
        [conceptId],
      );
      expect(record).toMatchObject({ from_state: "verified", to_state: "under_review", actor_id: null });
      expect(record.reason).toMatch(/content import.*returns to review/);
      const audit = await one<{ after: { returnedToReview: { concepts: string[] } } }>(t.pool, "SELECT after FROM audit_log WHERE id = $1", [s.auditLogId]);
      expect(audit.after.returnedToReview.concepts).toEqual([target.key]);

      const reopened = await snapshot();
      expect(reopened.created).toBe(true);
      expect(await item(reopened.id)).not.toBe(await item(snap.id));
      const inBundle = (await loadSnapshotPayload(t.pool, reopened.id)).concepts.find((c) => c.key === target.key)!;
      expect(inBundle.verificationState).toBe("under_review");
      expect(inBundle.claims[0]!.text).toBe(reworded);

      await accept();
      const again = await run(changed);
      expect(again.returnedToReview.concepts).toEqual([]);
      expect(again.concepts.keptAccepted).toBe(1);
      expect((await row()).s).toBe("verified");
      const reaccepted = await snapshot();
      expect(await item(reaccepted.id)).not.toBe(await item(reopened.id));

      const restored = await run();
      expect(restored.returnedToReview.concepts).toEqual([target.key]);
      expect(await row()).toMatchObject({ s: "under_review", text: claim0!.text });
    });

    it("keeps a curator's review decision, and follows the files only for states the importer set (knowledge-04)", async () => {
      const curator = await createUser(t.pool);
      const materials = loaded.model.concepts.filter((c) => c.type === "process_stage" && c.verificationState === "under_review");
      const [decided, fileDriven] = [materials[0]!.key, materials[1]!.key];
      await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test: curator rejects" }, (c) =>
        c.query("UPDATE concepts SET verification_state = 'rejected' WHERE key = $1", [decided]),
      );
      const changed = { ...loaded.model, concepts: loaded.model.concepts.map((c) => (c.key === fileDriven ? { ...c, verificationState: "needs_evidence" as const } : c)) };
      const s = await run(changed);
      const state = async (key: string) => (await one<{ s: string }>(t.pool, "SELECT verification_state::text AS s FROM concepts WHERE key = $1", [key])).s;
      expect(await state(decided)).toBe("rejected");
      expect(await state(fileDriven)).toBe("needs_evidence");
      expect(s.concepts.keptCurated).toBeGreaterThanOrEqual(1);
      await run();
      expect(await state(fileDriven)).toBe("under_review");
      expect(await state(decided)).toBe("rejected");
    });

    it("never prunes a CMS-authored edge; reports it as stale (knowledge-04)", async () => {
      const curator = await createUser(t.pool);
      const [a, b] = loaded.model.concepts.filter((c) => c.packageSlug === "ajrakh" && c.type === "process_stage");
      const cms = await one<{ id: string }>(
        t.pool,
        `INSERT INTO relationships (source_concept_id, target_concept_id, type_code, package_id, provenance_kind, verification_state, created_by)
         SELECT s.id, tc.id, 'SIMILAR_TO', s.package_id, 'historical_documentation', 'draft', $3
           FROM concepts s, concepts tc WHERE s.key = $1 AND tc.key = $2 RETURNING id`,
        [a!.key, b!.key, curator],
      );
      const s = await run();
      expect(s.stale.relationships).toEqual(expect.arrayContaining([`${a!.key} SIMILAR_TO ${b!.key}`]));
      const left = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM relationships WHERE id = $1", [cms.id]);
      expect(left.n).toBe(1);
      await t.pool.query("DELETE FROM relationships WHERE id = $1", [cms.id]);
      await run();
    });

    it("archives an edge it imported that the files dropped while a snapshot holds it, so no later snapshot carries it", async () => {
      const gone = loaded.model.relationships.find((r) => r.type === "PRECEDES" && r.verificationState !== "verified")!;
      const state = async () =>
        (await one<{ s: string }>(t.pool, "SELECT r.verification_state::text AS s FROM relationships r JOIN concepts s ON s.id = r.source_concept_id JOIN concepts tc ON tc.id = r.target_concept_id WHERE s.key = $1 AND tc.key = $2 AND r.type_code = 'PRECEDES'", [gone.source, gone.target])).s;
      const s = await run({ ...loaded.model, relationships: loaded.model.relationships.filter((r) => r !== gone) });
      expect(s.stale.relationships).toContain(`${gone.source} PRECEDES ${gone.target}`);
      expect(s.archived.relationships).toBe(1);
      expect(await state()).toBe("archived");
      await run();
      expect(await state()).not.toBe("archived");
    });

    it("keeps an accepted tradition's GI evidence while the files keep it, and a change to it reopens review (knowledge-09, DR-126)", async () => {
      const curator = await createUser(t.pool);
      const pkg = loaded.model.packages.find((p) => p.kind === "tradition" && (p.gi?.sourceRefs.length ?? 0) > 0)!;
      await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test: accepted" }, (c) =>
        c.query("UPDATE traditions SET verification_state = 'verified' WHERE slug = $1", [pkg.slug]),
      );
      const gi = async () =>
        (await t.pool.query<{ source_id: string }>("SELECT ts.source_id::text FROM tradition_sources ts JOIN traditions tr ON tr.id = ts.tradition_id WHERE tr.slug = $1 AND ts.purpose = 'gi' ORDER BY 1", [pkg.slug])).rows.map((r) => r.source_id);
      const before = await gi();
      expect(before.length).toBeGreaterThan(0);
      const state = async () => (await one<{ s: string }>(t.pool, "SELECT verification_state::text AS s FROM traditions WHERE slug = $1", [pkg.slug])).s;
      expect((await run()).traditions.keptAccepted).toBe(1);
      expect(await gi()).toEqual(before);
      expect(await state()).toBe("verified");
      const changed = { ...loaded.model, packages: loaded.model.packages.map((p) => (p.slug === pkg.slug ? { ...p, gi: p.gi ? { ...p.gi, sourceRefs: [] } : null } : p)) };
      const s = await run(changed);
      expect(await gi()).toEqual([]);
      expect(await state()).toBe("under_review");
      expect(s.returnedToReview.traditions).toEqual([pkg.slug]);
      await run();
      expect(await gi()).toEqual(before);
    });

    it("writes relationship evidence into its citation, keeps evidence the files do not carry, and never touches an accepted relationship", async () => {
      type Rel = (typeof loaded.model.relationships)[number];
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
      const keyOf = (r: Rel) => `${r.source}|${r.type}|${r.target}`;
      const base = { ...loaded.model, relationships: loaded.model.relationships.map((r) => ([a!, b!].some((x) => keyOf(x) === keyOf(r)) ? { ...r, evidence: [] } : r)) };
      const withEvidence = (targets: Rel[], locator: string, quote: string) => ({
        ...base,
        relationships: base.relationships.map((r) => (targets.some((x) => keyOf(x) === keyOf(r)) ? { ...r, evidence: [{ ref: r.sourceRefs[0]!, locator, quote }] } : r)),
      });

      const aBefore = await citations(a!);
      const s1 = await run(withEvidence([a!], "PDF p. 1", "a placeholder passage"));
      expect(s1.relationshipSources).toEqual({ inserted: 0, updated: 1, pruned: 0 });
      const aRows = await citations(a!);
      expect(aRows.find((x) => x.ref === a!.sourceRefs[0])).toMatchObject({ locator: "PDF p. 1", quote: "a placeholder passage" });
      expect(aRows.filter((x) => x.ref !== a!.sourceRefs[0])).toEqual(aBefore.filter((x) => x.ref !== a!.sourceRefs[0]));

      await t.pool.query(
        `UPDATE relationship_sources rs SET locator = 'p. 2', quote = 'a curator placeholder'
           FROM relationships x, concepts s, concepts tc
          WHERE x.id = rs.relationship_id AND s.id = x.source_concept_id AND tc.id = x.target_concept_id
            AND s.key = $1 AND tc.key = $2 AND x.type_code = $3`,
        [b!.source, b!.target, b!.type],
      );
      expect((await run(withEvidence([a!], "PDF p. 1", "a placeholder passage"))).relationshipSources).toEqual({ inserted: 0, updated: 0, pruned: 0 });
      expect((await run(base)).relationshipSources).toEqual({ inserted: 0, updated: 0, pruned: 0 });
      expect((await citations(a!)).find((x) => x.ref === a!.sourceRefs[0])).toMatchObject({ locator: "PDF p. 1", quote: "a placeholder passage" });
      expect((await citations(b!)).every((x) => x.locator === "p. 2" && x.quote === "a curator placeholder")).toBe(true);

      expect((await run(withEvidence([a!], "PDF p. 3", "a corrected placeholder passage"))).relationshipSources).toEqual({ inserted: 0, updated: 1, pruned: 0 });
      expect((await citations(a!)).find((x) => x.ref === a!.sourceRefs[0])).toMatchObject({ locator: "PDF p. 3", quote: "a corrected placeholder passage" });

      const curator = await createUser(t.pool);
      await withSettings(t.pool, { "app.actor_id": curator, "app.change_reason": "test: accepted" }, async (c) => {
        await c.query("UPDATE concepts SET verification_state = 'verified' WHERE key = ANY($1::text[])", [[accepted!.source, accepted!.target]]);
        await c.query(
          `UPDATE relationships x SET verification_state = 'verified' FROM concepts s, concepts tc
            WHERE s.id = x.source_concept_id AND tc.id = x.target_concept_id AND s.key = $1 AND tc.key = $2 AND x.type_code = $3`,
          [accepted!.source, accepted!.target, accepted!.type],
        );
      });
      const label = `${accepted!.source} ${accepted!.type} ${accepted!.target}`;
      const before = await citations(accepted!);
      const kept = await run();
      expect(kept.relationships.keptAccepted).toBeGreaterThanOrEqual(1);
      expect(kept.returnedToReview.relationships).not.toContain(label);
      expect(await citations(accepted!)).toEqual(before);
      const s4 = await run(withEvidence([accepted!], "PDF p. 4", "a placeholder passage"));
      expect(s4.relationshipSources.updated).toBe(1);
      expect(s4.returnedToReview.relationships).toContain(label);
      expect((await citations(accepted!)).find((x) => x.ref === accepted!.sourceRefs[0])).toMatchObject({ locator: "PDF p. 4", quote: "a placeholder passage" });
    });
  });
});
