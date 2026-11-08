import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CmsError, type Actor } from "../../src/server/cms/core";
import {
  countAssets,
  createAssetFromBytes,
  FIGURE_MAX_AGE,
  findAsset,
  freezeReleaseFigures,
  linkAssetToConcept,
  listAssets,
  listIllustrationLinks,
  listMediaCandidates,
  listSnapshotFigureAssets,
  listSnapshotPhotoLinks,
  loadLearnerFigure,
  MEDIA_EVIDENCE_CHECKS,
  recordCandidateImport,
  reviewAsset,
  reviewMediaCandidate,
  submitAssetForReview,
  unlinkAsset,
  updateAssetMetadata,
} from "../../src/server/cms/media/service";
import { createLocalStorage, type LocalMediaStorage } from "../../src/server/cms/media/storage";
import { TEST_URL, addSnapshotItem, createPublishedManifest, createRealGraph, createSnapshot, createStudy, createTestDatabase, createUser, one, publishSnapshot, type TestDb } from "./schema-harness";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function png(w: number, h: number, salt: number): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 73, 72, 68, 82, ...be32(w), ...be32(h), 8, 2, 0, 0, 0, 0, 0, 0, 0, salt]);
}

const META = {
  title: "Block-printed textile",
  altText: "Indigo cloth with a repeating floral block print",
  caption: "Dabu-resist printed cotton",
  credit: "Example Museum",
  licence: "CC BY-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
  provenanceKind: "historical_documentation",
};

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (err) {
    if (err instanceof CmsError) return err.code;
    if (err instanceof Error && err.name === "ZodError") return "invalid_input";
    throw err;
  }
}

describe.skipIf(!TEST_URL)("cms media library", () => {
  let t: TestDb;
  let dir: string;
  let storage: LocalMediaStorage;
  let curator: Actor;
  let curator2: Actor;
  let editor: Actor;

  beforeAll(async () => {
    t = await createTestDatabase("cmsmedia");
    dir = await mkdtemp(join(tmpdir(), "ie-media-"));
    storage = createLocalStorage(dir);
    curator = { userId: await createUser(t.pool), roles: ["curator"] };
    curator2 = { userId: await createUser(t.pool), roles: ["curator"] };
    editor = { userId: await createUser(t.pool), roles: ["content_editor"] };
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("stores the bytes content-addressed and records checksum, dimensions, version and audit", async () => {
    const bytes = png(4000, 3000, 1);
    const asset = await createAssetFromBytes(t.pool, editor, storage, { bytes, declaredMime: "image/png", metadata: META });
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(asset).toMatchObject({ sha256: sha, width: 4000, height: 3000, kind: "image", mime: "image/png", byteSize: bytes.length });
    expect(asset.storageKey).toBe(`sha256/${sha.slice(0, 2)}/${sha}.png`);
    expect(new Uint8Array(await readFile(join(dir, asset.storageKey)))).toEqual(bytes);

    const row = await one<{ sha256: string; width: number; height: number; verification_state: string; licence: string; created_by: string }>(
      t.pool,
      "SELECT sha256, width, height, verification_state, licence, created_by FROM assets WHERE id = $1",
      [asset.id],
    );
    expect(row).toMatchObject({ sha256: sha, width: 4000, height: 3000, verification_state: "draft", licence: "CC BY-SA 4.0", created_by: editor.userId });
    const v = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM asset_versions WHERE asset_id = $1 AND version = 1 AND variant = 'original' AND sha256 = $2", [asset.id, sha]);
    expect(v.n).toBe(1);
    const a = await one<{ actor_id: string; action: string }>(t.pool, "SELECT actor_id, action FROM audit_log WHERE entity = 'assets' AND entity_id = $1", [asset.id]);
    expect(a).toEqual({ actor_id: editor.userId, action: "media.asset_uploaded" });

    expect(await code(createAssetFromBytes(t.pool, editor, storage, { bytes, declaredMime: "image/png", metadata: META }))).toBe("duplicate_asset");
  });

  it("refuses uploads without licence, alt text or provenance, and mismatched types", async () => {
    const up = (metadata: Record<string, unknown>, salt: number, mime = "image/png") =>
      code(createAssetFromBytes(t.pool, editor, storage, { bytes: png(10, 10, salt), declaredMime: mime, metadata }));
    expect(await up({ ...META, licence: "" }, 2)).toBe("invalid_input");
    expect(await up({ ...META, altText: "" }, 3)).toBe("alt_required");
    expect(await up({ ...META, sourceUrl: "" }, 4)).toBe("invalid_input");
    expect(await up(META, 5, "image/jpeg")).toBe("mime_mismatch");
    expect(await up(META, 6, "image/svg+xml")).toBe("mime_not_allowed");
    expect(await up({ ...META, altText: "", decorative: "on" }, 7)).toBe("ok");
    const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM assets");
    expect(n.n).toBe(2);
  });

  it("enforces the review workflow: submit, no self-verification, editors cannot review", async () => {
    const asset = await createAssetFromBytes(t.pool, curator, storage, { bytes: png(800, 600, 10), declaredMime: "image/png", metadata: META });
    await submitAssetForReview(t.pool, curator, { assetId: asset.id });
    const all = MEDIA_EVIDENCE_CHECKS;

    expect(await code(reviewAsset(t.pool, editor, { assetId: asset.id, to: "verified", evidenceChecked: [...all] }))).toBe("forbidden");
    expect(await code(reviewAsset(t.pool, curator, { assetId: asset.id, to: "verified", evidenceChecked: [...all] }))).toBe("self_verification");
    expect(await code(reviewAsset(t.pool, curator2, { assetId: asset.id, to: "verified", evidenceChecked: ["licence"] }))).toBe("invalid_input");

    await reviewAsset(t.pool, curator2, { assetId: asset.id, to: "verified", evidenceChecked: [...all] });
    const vr = await one<{ actor_id: string; to_state: string }>(
      t.pool,
      "SELECT actor_id, to_state FROM verification_records WHERE entity_kind = 'asset' AND entity_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
      [asset.id],
    );
    expect(vr).toEqual({ actor_id: curator2.userId, to_state: "verified" });
    const audit = await one<{ after: { evidenceChecked: string[] } }>(t.pool, "SELECT after FROM audit_log WHERE action = 'media.asset_reviewed' AND entity_id = $1", [asset.id]);
    expect(audit.after.evidenceChecked).toEqual([...all]);

    const r = await updateAssetMetadata(t.pool, editor, { assetId: asset.id, metadata: { ...META, caption: "Changed caption" } });
    expect(r.returnedToReview).toBe(true);
    const row = await one<{ verification_state: string; caption: string }>(t.pool, "SELECT verification_state, caption FROM assets WHERE id = $1", [asset.id]);
    expect(row).toEqual({ verification_state: "under_review", caption: "Changed caption" });
    expect(await code(reviewAsset(t.pool, curator, { assetId: asset.id, to: "verified", evidenceChecked: [...all] }))).toBe("self_verification");
  });

  it("keeps no licence cap, expiry or term, and applies the figure text rules", async () => {
    const dropped = await t.pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'assets' AND column_name IN ('max_pixels', 'licence_expires_on', 'licence_term_months', 'first_published_on')",
    );
    expect(dropped.rows).toEqual([]);

    const up = (metadata: Record<string, unknown>, salt: number) =>
      code(createAssetFromBytes(t.pool, editor, storage, { bytes: png(10, 10, salt), declaredMime: "image/png", metadata }));
    expect(await up({ ...META, altText: "Blue cloth" }, 21)).toBe("alt_rule");
    expect(await up({ ...META, caption: META.altText.toUpperCase() }, 22)).toBe("alt_rule");
    expect(await up({ ...META, caption: "x".repeat(181) }, 23)).toBe("caption_too_long");
  });

  it("verifies an image at the full size of its source", async () => {
    const asset = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(4033, 2778, 30), declaredMime: "image/png", metadata: META });
    await submitAssetForReview(t.pool, editor, { assetId: asset.id });
    expect(await code(reviewAsset(t.pool, curator2, { assetId: asset.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] }))).toBe("ok");
  });

  it("refuses to verify an image without a credit or a caption (9.9, 11.10, R-H5)", async () => {
    const noCredit = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 31), declaredMime: "image/png", metadata: { ...META, credit: "" } });
    const noCaption = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 32), declaredMime: "image/png", metadata: { ...META, caption: "" } });
    for (const a of [noCredit, noCaption]) await submitAssetForReview(t.pool, editor, { assetId: a.id });
    const verify = (assetId: string) => reviewAsset(t.pool, curator2, { assetId, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    await expect(verify(noCredit.id)).rejects.toThrow(/missing credit/);
    await expect(verify(noCaption.id)).rejects.toThrow(/missing caption/);
    expect(await code(verify(noCredit.id))).toBe("evidence_missing");
    const rows = await t.pool.query<{ verification_state: string }>("SELECT verification_state::text FROM assets WHERE id = ANY($1::uuid[])", [[noCredit.id, noCaption.id]]);
    expect(rows.rows.map((r) => r.verification_state)).toEqual(["under_review", "under_review"]);
  });

  it("anchors an illustration to an existing claim, at most one per concept", async () => {
    const g = await createRealGraph(t.pool, { prefix: "mlink" });
    const a = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 40), declaredMime: "image/png", metadata: META });
    const b = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 41), declaredMime: "image/png", metadata: META });
    expect(await code(linkAssetToConcept(t.pool, editor, { assetId: a.id, conceptId: g.conceptIds[0], role: "illustration", position: 1 }))).toBe("anchor_claim");
    expect(await code(linkAssetToConcept(t.pool, editor, { assetId: a.id, conceptId: g.conceptIds[0], role: "illustration", position: 0 }))).toBe("ok");
    expect(await code(linkAssetToConcept(t.pool, editor, { assetId: b.id, conceptId: g.conceptIds[0], role: "illustration", position: 0 }))).toBe("one_figure_per_concept");
    expect(await code(linkAssetToConcept(t.pool, editor, { assetId: b.id, conceptId: g.conceptIds[0], role: "primary", position: 0 }))).toBe("ok");
    expect(await code(linkAssetToConcept(t.pool, editor, { assetId: a.id, conceptId: g.conceptIds[0], role: "illustration", position: 0 }))).toBe("ok");
    const links = (await listIllustrationLinks(t.pool)).filter((l) => l.conceptId === g.conceptIds[0]);
    expect(links).toEqual([expect.objectContaining({ assetId: a.id, role: "illustration", position: 0, verificationState: "draft", isDemo: false })]);
    await expect(t.pool.query("UPDATE asset_links SET position = -1 WHERE asset_id = $1", [a.id])).rejects.toThrow(/asset_links_position_ck/);
  });

  it("serves learner figures only when approved and an illustration of a real concept or public", async () => {
    const g = await createRealGraph(t.pool, { prefix: "mfig", acceptBy: curator2.userId });
    const fig = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(2500, 1910, 50), declaredMime: "image/png", metadata: META });
    expect(await loadLearnerFigure(t.pool, fig.id)).toBeNull();
    await submitAssetForReview(t.pool, editor, { assetId: fig.id });
    await reviewAsset(t.pool, curator2, { assetId: fig.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    expect(await loadLearnerFigure(t.pool, fig.id)).toBeNull();
    expect(await linkAssetToConcept(t.pool, editor, { assetId: fig.id, conceptId: g.conceptIds[0], role: "illustration", position: 0 })).toEqual({ returnedToReview: true });
    expect(await loadLearnerFigure(t.pool, fig.id)).toBeNull();
    await reviewAsset(t.pool, curator2, { assetId: fig.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    expect(await loadLearnerFigure(t.pool, fig.id)).toMatchObject({ id: fig.id, mimeType: "image/png", width: 2500, height: 1910 });
    const preview = await createSnapshot(t.pool, { label: "mfig-draft-1", createdBy: curator.userId });
    expect(await listSnapshotPhotoLinks(t.pool, preview)).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: fig.id, src: `/figures/${fig.id}`, width: 2500, height: 1910 })]));
    expect(await loadLearnerFigure(t.pool, "not-a-uuid")).toBeNull();

    const [link] = (await listIllustrationLinks(t.pool)).filter((l) => l.assetId === fig.id);
    expect(link).toMatchObject({ credit: META.credit, caption: META.caption, altText: META.altText });
    await t.pool.query("UPDATE asset_links SET caption_override = 'Override caption' WHERE asset_id = $1", [fig.id]);
    expect((await listIllustrationLinks(t.pool)).find((l) => l.assetId === fig.id)?.caption).toBe("Override caption");

    for (const column of ["credit", "caption", "alt_text"]) {
      await t.pool.query(`UPDATE assets SET ${column} = '' WHERE id = $1`, [fig.id]);
      expect(await loadLearnerFigure(t.pool, fig.id)).toBeNull();
      await t.pool.query(`UPDATE assets SET ${column} = $2 WHERE id = $1`, [fig.id, column === "credit" ? META.credit : column === "caption" ? META.caption : META.altText]);
    }
    expect(await loadLearnerFigure(t.pool, fig.id)).toMatchObject({ id: fig.id });

    const unlinked = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(1600, 1000, 51), declaredMime: "image/png", metadata: META });
    await submitAssetForReview(t.pool, editor, { assetId: unlinked.id });
    await reviewAsset(t.pool, curator2, { assetId: unlinked.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    expect(await loadLearnerFigure(t.pool, unlinked.id)).toBeNull();

    expect(FIGURE_MAX_AGE).toBe(300);
  });

  it("treats a link as learner-facing text: caption rules, and a changed link on an accepted asset goes back to review (knowledge-02)", async () => {
    const g = await createRealGraph(t.pool, { prefix: "mrev", acceptBy: curator2.userId });
    await t.pool.query("INSERT INTO concept_claims (concept_id, position, text) VALUES ($1, 1, 'Second claim')", [g.conceptIds[0]]);
    const a = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 60), declaredMime: "image/png", metadata: META });
    const link = (extra: Record<string, unknown> = {}) => linkAssetToConcept(t.pool, editor, { assetId: a.id, conceptId: g.conceptIds[0], role: "illustration", position: 0, ...extra });
    expect(await code(link({ captionOverride: "x".repeat(181) }))).toBe("caption_rule");
    expect(await code(link({ captionOverride: META.altText }))).toBe("caption_rule");
    expect(await link()).toEqual({ returnedToReview: false });
    await submitAssetForReview(t.pool, editor, { assetId: a.id });
    await reviewAsset(t.pool, curator2, { assetId: a.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    const state = async () => (await one<{ s: string }>(t.pool, "SELECT verification_state::text AS s FROM assets WHERE id = $1", [a.id])).s;

    expect(await link()).toEqual({ returnedToReview: false });
    expect(await state()).toBe("verified");
    expect(await link({ captionOverride: "Points to the second claim." })).toEqual({ returnedToReview: true });
    expect(await state()).toBe("under_review");
    await reviewAsset(t.pool, curator2, { assetId: a.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    expect(await link({ position: 1, captionOverride: "Points to the second claim." })).toEqual({ returnedToReview: true });
    const audit = await one<{ before: { position: number }; reason: string }>(
      t.pool,
      "SELECT before, reason FROM audit_log WHERE action = 'media.asset_linked' AND entity_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 1",
      [a.id],
    );
    expect(audit).toEqual({ before: { position: 0, captionOverride: "Points to the second claim." }, reason: "link created or changed after acceptance: returned to review" });
  });

  it("bars every earlier author of an asset from verifying it, not only the uploader and the last editor (knowledge-10)", async () => {
    const curator3: Actor = { userId: await createUser(t.pool), roles: ["curator"] };
    const a = await createAssetFromBytes(t.pool, curator3, storage, { bytes: png(768, 512, 70), declaredMime: "image/png", metadata: META });
    await updateAssetMetadata(t.pool, curator, { assetId: a.id, metadata: { ...META, caption: "Caption written by the first curator" } });
    await updateAssetMetadata(t.pool, editor, { assetId: a.id, metadata: { ...META, caption: "Caption written by the first curator." } });
    await submitAssetForReview(t.pool, editor, { assetId: a.id });
    const verify = (actor: Actor) => code(reviewAsset(t.pool, actor, { assetId: a.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] }));
    expect(await verify(curator)).toBe("self_verification");
    expect(await verify(curator3)).toBe("self_verification");
    expect(await verify(curator2)).toBe("ok");
  });

  it("shows a released study only the figures frozen into its release; withdrawals are study deviations (knowledge-01, database-01, security-02)", async () => {
    const g = await createRealGraph(t.pool, { prefix: "mfrz", acceptBy: curator2.userId });
    const fig = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 80), declaredMime: "image/png", metadata: META });
    await linkAssetToConcept(t.pool, editor, { assetId: fig.id, conceptId: g.conceptIds[0], role: "illustration", position: 0 });
    await submitAssetForReview(t.pool, editor, { assetId: fig.id });
    await reviewAsset(t.pool, curator2, { assetId: fig.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    const late = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 81), declaredMime: "image/png", metadata: META });
    await submitAssetForReview(t.pool, editor, { assetId: late.id });
    await reviewAsset(t.pool, curator2, { assetId: late.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });

    const snap = await createSnapshot(t.pool, { label: "mfrz-release-1", createdBy: curator.userId });
    for (const id of g.conceptIds) await addSnapshotItem(t.pool, snap, "concept", id);
    expect(await freezeReleaseFigures(t.pool, snap)).toBe(1);
    await publishSnapshot(t.pool, snap, curator.userId);
    const frozen = { assetId: fig.id, conceptId: g.conceptIds[0], role: "illustration", position: 0, caption: META.caption, altText: META.altText, credit: META.credit, licence: META.licence, width: 768, height: 512 };
    expect(await listSnapshotPhotoLinks(t.pool, snap)).toEqual([expect.objectContaining(frozen)]);

    await expect(t.pool.query("UPDATE snapshot_figures SET caption = 'x' WHERE snapshot_id = $1", [snap])).rejects.toThrow(/immutable/);
    await expect(t.pool.query("DELETE FROM snapshot_figures WHERE snapshot_id = $1", [snap])).rejects.toThrow(/immutable/);
    await expect(freezeReleaseFigures(t.pool, snap)).rejects.toThrow(/draft release snapshot/);

    await linkAssetToConcept(t.pool, editor, { assetId: late.id, conceptId: g.conceptIds[1], role: "illustration", position: 0 });
    await reviewAsset(t.pool, curator2, { assetId: late.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    expect(await linkAssetToConcept(t.pool, editor, { assetId: fig.id, conceptId: g.conceptIds[0], role: "illustration", position: 0, captionOverride: "An unreviewed caption." })).toEqual({ returnedToReview: true });
    await t.pool.query("UPDATE assets SET caption = 'Changed live caption' WHERE id = $1", [fig.id]);
    expect(await listSnapshotPhotoLinks(t.pool, snap)).toEqual([expect.objectContaining(frozen)]);
    expect(await loadLearnerFigure(t.pool, fig.id)).toMatchObject({ id: fig.id });
    expect(await listSnapshotFigureAssets(t.pool, snap)).toEqual([expect.objectContaining({ assetId: fig.id, caption: META.caption, verificationState: "published" })]);
    const linkId = (await one<{ id: string }>(t.pool, "SELECT id FROM asset_links WHERE asset_id = $1", [late.id])).id;
    await unlinkAsset(t.pool, editor, { linkId });
    expect((await listSnapshotPhotoLinks(t.pool, snap)).map((l) => l.assetId)).toEqual([fig.id]);

    const study = await createStudy(t.pool, { slug: "mfrz-study", snapshotId: snap, manifestId: await createPublishedManifest(t.pool, snap, { by: curator.userId }) });
    await t.pool.query("UPDATE studies SET status = 'active' WHERE id = $1", [study.studyId]);
    await reviewAsset(t.pool, curator2, { assetId: fig.id, to: "rejected", reason: "The museum asked us to stop using this image." });
    expect(await listSnapshotPhotoLinks(t.pool, snap)).toEqual([]);
    expect(await loadLearnerFigure(t.pool, fig.id)).toBeNull();
    const dev = await one<{ category: string; severity: string; description: string; reported_by: string }>(
      t.pool,
      "SELECT category, severity, description, reported_by FROM protocol_deviations WHERE study_id = $1",
      [study.studyId],
    );
    expect(dev).toMatchObject({ category: "content", severity: "major", reported_by: curator2.userId });
    expect(dev.description).toMatch(/withdrawn during data collection.*rejected.*The museum asked us/);
    const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM protocol_deviations WHERE study_id = $1", [study.studyId]);
    expect(n.n).toBe(1);
  });

  it("records licence decisions on imported media candidates (media.review only)", async () => {
    const pkg = await one<{ id: string }>(t.pool, "INSERT INTO content_packages (slug, kind, name) VALUES ('mtest', 'tradition', 'Media test') RETURNING id");
    const c = await one<{ id: string }>(
      t.pool,
      "INSERT INTO media_candidates (package_id, url, title, licence, width, height) VALUES ($1, 'https://commons.wikimedia.org/wiki/File:A.jpg', 'A', 'CC BY 4.0', 4000, 3000) RETURNING id",
      [pkg.id],
    );
    expect(await code(reviewMediaCandidate(t.pool, editor, { candidateId: c.id, status: "approved" }))).toBe("forbidden");
    expect(await code(reviewMediaCandidate(t.pool, curator, { candidateId: c.id, status: "rejected" }))).toBe("invalid_input");
    await reviewMediaCandidate(t.pool, curator, { candidateId: c.id, status: "approved", notes: "Licence checked on the file page" });
    const row = await one<{ status: string; notes: string }>(t.pool, "SELECT status, notes FROM media_candidates WHERE id = $1", [c.id]);
    expect(row).toEqual({ status: "approved", notes: "Licence checked on the file page" });

    const pending = await one<{ id: string }>(
      t.pool,
      "INSERT INTO media_candidates (package_id, url, title, licence) VALUES ($1, 'https://commons.wikimedia.org/wiki/File:B.jpg', 'B', 'CC BY 4.0') RETURNING id",
      [pkg.id],
    );
    const asset = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(800, 600, 90), declaredMime: "image/png", metadata: META });
    expect(await code(recordCandidateImport(t.pool, { userId: editor.userId, roles: ["researcher"] }, { candidateId: c.id, assetId: asset.id }))).toBe("forbidden");
    expect(await code(recordCandidateImport(t.pool, editor, { candidateId: pending.id, assetId: asset.id }))).toBe("invalid_transition");
    await recordCandidateImport(t.pool, editor, { candidateId: c.id, assetId: asset.id });
    expect(await one(t.pool, "SELECT status::text AS status, asset_id FROM media_candidates WHERE id = $1", [c.id])).toEqual({ status: "imported", asset_id: asset.id });
    expect((await listMediaCandidates(t.pool)).find((x) => x.id === c.id)).toMatchObject({ status: "imported", assetId: asset.id, assetTitle: META.title });
    expect(await one(t.pool, "SELECT actor_id FROM audit_log WHERE action = 'media.candidate_imported' AND entity_id = $1", [c.id])).toEqual({ actor_id: editor.userId });
    expect(await code(reviewMediaCandidate(t.pool, curator, { candidateId: c.id, status: "candidate" }))).toBe("invalid_transition");
    expect(await code(recordCandidateImport(t.pool, editor, { candidateId: c.id, assetId: asset.id }))).toBe("invalid_transition");
  });

  it("pages the library and opens any asset by id, however old (DR-114)", async () => {
    const total = await countAssets(t.pool);
    expect(total).toBeGreaterThan(2);
    const first = await listAssets(t.pool, { limit: 2 });
    const second = await listAssets(t.pool, { limit: 2, offset: 2 });
    expect(first).toHaveLength(2);
    expect(second.map((a) => a.id)).not.toContain(first[0]!.id);
    const oldest = (await listAssets(t.pool, { limit: total }))[total - 1]!;
    expect(first.map((a) => a.id)).not.toContain(oldest.id);
    expect((await findAsset(t.pool, oldest.id))?.id).toBe(oldest.id);
    expect(await findAsset(t.pool, "not-a-uuid")).toBeNull();
  });

  it("lets a screen set and keep a link's caption for one concept (DR-114)", async () => {
    const g = await createRealGraph(t.pool, { prefix: "mcap" });
    const a = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(768, 512, 91), declaredMime: "image/png", metadata: META });
    const form = { assetId: a.id, conceptId: g.conceptIds[0]!, role: "illustration" as const, position: 0 };
    await linkAssetToConcept(t.pool, editor, { ...form, captionOverride: "Caption for this concept" });
    expect((await findAsset(t.pool, a.id))!.links[0]).toMatchObject({ captionOverride: "Caption for this concept" });
    await linkAssetToConcept(t.pool, editor, { ...form, captionOverride: "" });
    expect((await findAsset(t.pool, a.id))!.links[0]).toMatchObject({ captionOverride: null });
  });
});
