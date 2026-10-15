/**
 * Integration: spatial studio services (src/server/cms/spatial/service.ts) against a throwaway
 * database with the real content imported and a REVIEW snapshot stored (as dev:bootstrap does).
 */
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { nodeSha256 } from "../../src/features/knowledge/graph/hash-node";
import type { Actor } from "../../src/server/cms/core";
import { CmsError } from "../../src/server/cms/core";
import { explainElement, listManifests, loadManifestDetail } from "../../src/server/cms/spatial/queries";
import {
  compileManifest,
  compileWithOverrides,
  createOverride,
  publishManifest,
  revokeOverride,
} from "../../src/server/cms/spatial/service";
import { importContent } from "../../src/server/content/import-content";
import { storeReviewSnapshot } from "../../src/server/content/review-snapshot";
import { REPO_ROOT, loadAndValidate } from "../../scripts/content/_shared";
import { TEST_URL, createTestDatabase, createUser, one, type TestDb } from "./schema-harness";

async function refusal(p: Promise<unknown>): Promise<CmsError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof CmsError) return err;
    throw err;
  }
  throw new Error("expected a refusal");
}

describe.skipIf(!TEST_URL)("CMS spatial studio", () => {
  let t: TestDb;
  let editor: Actor;
  let curator: Actor;
  let pi: Actor;
  let snapshotId: string;
  let baseManifestId: string;
  let exhibitId: string;

  beforeAll(async () => {
    t = await createTestDatabase("cms_spatial");
    const loaded = loadAndValidate(join(REPO_ROOT, "content"));
    const c = await t.pool.connect();
    try {
      await importContent(c, { model: loaded.model, issues: loaded.report.issues, hasher: nodeSha256, invokedBy: "test" });
      snapshotId = (await storeReviewSnapshot(c, { hasher: nodeSha256, generatedAt: "2026-10-14T00:00:00.000Z" })).id;
    } finally {
      c.release();
    }
    editor = { userId: await createUser(t.pool), roles: ["content_editor"] };
    curator = { userId: await createUser(t.pool), roles: ["curator"] };
    pi = { userId: await createUser(t.pool), roles: ["principal_investigator"] };
  }, 180_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("lets a content editor compile (audited as the user) and the result is idempotent", async () => {
    const m = await compileManifest(t.pool, editor, { snapshotId, traditions: ["ajrakh"], seed: "default" });
    expect(m.created).toBe(true);
    baseManifestId = m.id;
    const again = await compileManifest(t.pool, editor, { snapshotId, traditions: ["ajrakh"], seed: "default" });
    expect(again.id).toBe(m.id);
    expect(again.created).toBe(false);
    const a = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'spatial.compile_requested' AND actor_id = $1 AND entity_id = $2", [editor.userId, m.id]);
    expect(a.n).toBe(2);
    const list = await listManifests(t.pool);
    expect(list.map((x) => x.id)).toContain(m.id);
  }, 120_000);

  it("explains an element from the snapshot (rule, rationale, concept titles)", async () => {
    const d = (await loadManifestDetail(t.pool, baseManifestId))!;
    const exhibit = d.manifest.elements.find((e) => e.kind === "exhibit" && e.conceptId)!;
    exhibitId = exhibit.id;
    const ex = explainElement(d, exhibit.id)!;
    expect(ex.rule?.id).toBe(exhibit.ruleId);
    expect(ex.element.rationale.length).toBeGreaterThan(0);
    expect(ex.concepts[0]?.title).toBe(d.bundle!.concepts.find((c) => c.id === exhibit.conceptId)!.title);
    expect(ex.interactions.length).toBeGreaterThan(0);
  });

  it("refuses overrides and publishing to a content editor", async () => {
    expect((await refusal(createOverride(t.pool, editor, { manifestId: baseManifestId, targetElementId: exhibitId, field: "/label", value: "X", reason: "test" }))).code).toBe("forbidden");
    expect((await refusal(compileWithOverrides(t.pool, editor, { manifestId: baseManifestId }))).code).toBe("forbidden");
    expect((await refusal(publishManifest(t.pool, editor, { manifestId: baseManifestId, supersede: false }))).code).toBe("forbidden");
  });

  it("refuses an override of a traceability field or a missing path", async () => {
    for (const field of ["/ruleId", "/trace/conceptIds", "/encodes", "/rationale", "/conceptId"]) {
      const e = await refusal(createOverride(t.pool, curator, { manifestId: baseManifestId, targetElementId: exhibitId, field, value: "x", reason: "test" }));
      expect(e.code, field).toBe("forbidden_pointer");
    }
    expect((await refusal(createOverride(t.pool, curator, { manifestId: baseManifestId, targetElementId: exhibitId, field: "/nope", value: 1, reason: "test" }))).code).toBe("forbidden_pointer");
    expect((await refusal(createOverride(t.pool, curator, { manifestId: baseManifestId, targetElementId: "exhibit:missing", field: "/label", value: "x", reason: "test" }))).code).toBe("unknown_element");
    const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM manual_overrides");
    expect(n.n).toBe(0);
  });

  it("records, revokes and audits overrides on a draft rule-set version, then compiles with them", async () => {
    const keep = await createOverride(t.pool, curator, { manifestId: baseManifestId, targetElementId: exhibitId, field: "/label", value: "Relabelled exhibit", reason: "clearer label for the study" });
    const drop = await createOverride(t.pool, curator, { manifestId: baseManifestId, targetElementId: exhibitId, field: "/yawDeg", value: 90, reason: "try a rotation" });
    expect(keep.ruleSetId).toBe(drop.ruleSetId);
    expect(keep.version).toBe(1);
    await revokeOverride(t.pool, curator, { overrideId: drop.overrideId, reason: "rotation not needed" });

    const rows = await t.pool.query<{ id: string; created_by: string; revoked_by: string | null; revoke_reason: string | null }>(
      "SELECT id, created_by, revoked_by, revoke_reason FROM manual_overrides ORDER BY created_at",
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.every((r) => r.created_by === curator.userId)).toBe(true);
    expect(rows.rows.find((r) => r.id === drop.overrideId)).toMatchObject({ revoked_by: curator.userId, revoke_reason: "rotation not needed" });
    const audits = await t.pool.query<{ action: string; entity_id: string }>(
      "SELECT action, entity_id FROM audit_log WHERE actor_id = $1 AND action LIKE 'spatial.%' ORDER BY occurred_at, id",
      [curator.userId],
    );
    const actions = audits.rows.map((r) => r.action);
    expect(actions).toContain("spatial.rule_set_draft_created");
    expect(audits.rows.filter((r) => r.action === "spatial.override_created").map((r) => r.entity_id).sort()).toEqual([keep.overrideId, drop.overrideId].sort());
    expect(audits.rows.find((r) => r.action === "spatial.override_revoked")?.entity_id).toBe(drop.overrideId);
    // The database refuses deleting an override outright.
    await expect(t.pool.query("DELETE FROM manual_overrides WHERE id = $1", [keep.overrideId])).rejects.toThrow(/cannot be deleted/);

    const r = await compileWithOverrides(t.pool, curator, { manifestId: baseManifestId });
    expect(r.created).toBe(true);
    expect(r.applied).toBe(1);
    const rs = await one<{ status: string; frozen_by: string }>(t.pool, "SELECT status, frozen_by FROM mapping_rule_sets WHERE id = $1", [r.ruleSetId]);
    expect(rs).toEqual({ status: "frozen", frozen_by: curator.userId });
    const m = await one<{ rule_set_id: string; manifest: { elements: { id: string; label: string }[] }; validation: { overrides: { id: string; before: unknown; after: unknown }[] } }>(
      t.pool,
      "SELECT rule_set_id, manifest, validation FROM spatial_manifests WHERE id = $1",
      [r.manifestId],
    );
    expect(m.rule_set_id).toBe(r.ruleSetId);
    expect(m.validation.overrides).toEqual([expect.objectContaining({ id: keep.overrideId, after: "Relabelled exhibit" })]);
    expect(m.manifest.elements.find((e) => e.id === exhibitId)?.label).toBe("Relabelled exhibit");
    const idx = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM spatial_elements WHERE manifest_id = $1", [r.manifestId]);
    expect(idx.n).toBe(m.manifest.elements.length);
    const audit = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM audit_log WHERE action IN ('spatial.rule_set_frozen', 'spatial.manifest_compiled_with_overrides') AND actor_id = $1", [curator.userId]);
    expect(audit.n).toBe(2);

    // The frozen version can no longer change; a new override opens version 2 carrying the active one over.
    expect((await refusal(revokeOverride(t.pool, curator, { overrideId: keep.overrideId, reason: "late change" }))).code).toBe("rule_set_frozen");
    const next = await createOverride(t.pool, curator, { manifestId: r.manifestId, targetElementId: exhibitId, field: "/label", value: "Second label", reason: "second pass" });
    expect(next.version).toBe(2);
    const carried = await t.pool.query<{ reason: string; created_by: string }>("SELECT reason, created_by FROM manual_overrides WHERE rule_set_id = $1 ORDER BY created_at", [next.ruleSetId]);
    expect(carried.rows).toEqual([
      { reason: "clearer label for the study", created_by: curator.userId },
      { reason: "second pass", created_by: curator.userId },
    ]);
  }, 120_000);

  it("refuses to publish an invalid manifest and a manifest from a review snapshot", async () => {
    const bad = await createOverride(t.pool, curator, { manifestId: baseManifestId, targetElementId: exhibitId, field: "/approach/x", value: 100000, reason: "move the approach point outside every room" });
    const r = await compileWithOverrides(t.pool, curator, { manifestId: baseManifestId });
    expect(r.ruleSetId).toBe(bad.ruleSetId);
    const invalidId = r.manifestId;
    expect(r.passed).toBe(false);
    const e1 = await refusal(publishManifest(t.pool, pi, { manifestId: invalidId, supersede: false }));
    expect(e1.code).toBe("validation_failed");

    const base = await one<{ status: string }>(t.pool, "SELECT status FROM spatial_manifests WHERE id = $1", [baseManifestId]);
    expect(base.status).toBe("valid");
    const e2 = await refusal(publishManifest(t.pool, pi, { manifestId: baseManifestId, supersede: false }));
    expect(e2.code).toBe("snapshot_not_published");
    const published = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM spatial_manifests WHERE status = 'published'");
    expect(published.n).toBe(0);
  }, 120_000);
});
