/**
 * Integration: media library service against a throwaway database (schema-harness) and a local
 * store in a temp directory. Includes the figure governance of migration 0016 (DESIGN.md 9.9, 16;
 * DR-018, DR-020): the licence display cap, expiry and public-plate flag, the alt-text and caption
 * rules, illustration anchors (one per concept), and what the learner figure route may serve.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CmsError, type Actor } from "../../src/server/cms/core";
import {
  createAssetFromBytes,
  FIGURE_MAX_AGE,
  figureMaxAge,
  linkAssetToConcept,
  listIllustrationLinks,
  loadLearnerFigure,
  MEDIA_EVIDENCE_CHECKS,
  reviewAsset,
  reviewMediaCandidate,
  submitAssetForReview,
  updateAssetMetadata,
} from "../../src/server/cms/media/service";
import { createLocalStorage, type LocalMediaStorage } from "../../src/server/cms/media/storage";
import { TEST_URL, addSnapshotItem, createRealGraph, createSnapshot, createTestDatabase, createUser, one, publishSnapshot, type TestDb } from "./schema-harness";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
/** A PNG header with a given size plus `salt` bytes, so each test file has its own checksum. */
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
    // Decorative images may have empty alt text, but only explicitly.
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

    // Editing a verified asset sends it back to review.
    const r = await updateAssetMetadata(t.pool, editor, { assetId: asset.id, metadata: { ...META, caption: "Changed caption" } });
    expect(r.returnedToReview).toBe(true);
    const row = await one<{ verification_state: string; caption: string }>(t.pool, "SELECT verification_state, caption FROM assets WHERE id = $1", [asset.id]);
    expect(row).toEqual({ verification_state: "under_review", caption: "Changed caption" });
    // The editor now last edited it, so they could not verify it even with the permission; curator (uploader) still cannot.
    expect(await code(reviewAsset(t.pool, curator, { assetId: asset.id, to: "verified", evidenceChecked: [...all] }))).toBe("self_verification");
  });

  it("records the licence display cap, expiry and public-plate flag, and applies the figure text rules", async () => {
    const asset = await createAssetFromBytes(t.pool, editor, storage, {
      bytes: png(768, 512, 20),
      declaredMime: "image/png",
      metadata: { ...META, maxPixels: "768", licenceExpiresOn: "2031-10-14", publicPlate: "on" },
    });
    const row = await one<{ max_pixels: number; expires: string; public_plate: boolean }>(
      t.pool,
      "SELECT max_pixels, licence_expires_on::text AS expires, public_plate FROM assets WHERE id = $1",
      [asset.id],
    );
    expect(row).toEqual({ max_pixels: 768, expires: "2031-10-14", public_plate: true });

    const up = (metadata: Record<string, unknown>, salt: number) =>
      code(createAssetFromBytes(t.pool, editor, storage, { bytes: png(10, 10, salt), declaredMime: "image/png", metadata }));
    expect(await up({ ...META, altText: "Blue cloth" }, 21)).toBe("alt_rule");
    expect(await up({ ...META, caption: META.altText.toUpperCase() }, 22)).toBe("alt_rule");
    expect(await up({ ...META, caption: "x".repeat(181) }, 23)).toBe("caption_too_long");
    expect(await up({ ...META, maxPixels: "-3" }, 24)).toBe("invalid_input");
    expect(await up({ ...META, licenceExpiresOn: "soon" }, 25)).toBe("invalid_input");
  });

  it("refuses to verify an image stored larger than its licence allows", async () => {
    const asset = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(2000, 1000, 30), declaredMime: "image/png", metadata: { ...META, maxPixels: "768" } });
    await submitAssetForReview(t.pool, editor, { assetId: asset.id });
    expect(await code(reviewAsset(t.pool, curator2, { assetId: asset.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] }))).toBe("exceeds_licence_cap");
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
    // Other roles are not study figures; re-linking the same asset updates its anchor.
    expect(await code(linkAssetToConcept(t.pool, editor, { assetId: b.id, conceptId: g.conceptIds[0], role: "primary", position: 0 }))).toBe("ok");
    expect(await code(linkAssetToConcept(t.pool, editor, { assetId: a.id, conceptId: g.conceptIds[0], role: "illustration", position: 0 }))).toBe("ok");
    const links = (await listIllustrationLinks(t.pool)).filter((l) => l.conceptId === g.conceptIds[0]);
    expect(links).toEqual([expect.objectContaining({ assetId: a.id, role: "illustration", position: 0, verificationState: "draft", isDemo: false })]);
    await expect(t.pool.query("UPDATE asset_links SET position = -1 WHERE asset_id = $1", [a.id])).rejects.toThrow(/asset_links_position_ck/);
  });

  it("serves learner figures only when approved, licence-valid, within the cap and published or public", async () => {
    const g = await createRealGraph(t.pool, { prefix: "mfig", acceptBy: curator2.userId });
    const fig = await createAssetFromBytes(t.pool, editor, storage, {
      bytes: png(768, 512, 50),
      declaredMime: "image/png",
      metadata: { ...META, maxPixels: "768", licenceExpiresOn: "2030-12-31" },
    });
    const day = "2027-01-01";
    expect(await loadLearnerFigure(t.pool, fig.id, day)).toBeNull(); // draft
    await submitAssetForReview(t.pool, editor, { assetId: fig.id });
    await reviewAsset(t.pool, curator2, { assetId: fig.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    expect(await loadLearnerFigure(t.pool, fig.id, day)).toBeNull(); // approved but used nowhere
    await linkAssetToConcept(t.pool, editor, { assetId: fig.id, conceptId: g.conceptIds[0], role: "illustration", position: 0 });
    expect(await loadLearnerFigure(t.pool, fig.id, day)).toBeNull(); // the concept is in no published release

    const snap = await createSnapshot(t.pool, { label: "mfig-release-1", createdBy: curator.userId });
    await addSnapshotItem(t.pool, snap, "concept", g.conceptIds[0]);
    expect(await loadLearnerFigure(t.pool, fig.id, day)).toBeNull(); // a draft snapshot is not a study bundle
    await publishSnapshot(t.pool, snap, curator.userId);
    expect(await loadLearnerFigure(t.pool, fig.id, day)).toMatchObject({ id: fig.id, mimeType: "image/png", width: 768, height: 512, maxPixels: 768, licenceExpiresOn: "2030-12-31" });
    expect(await loadLearnerFigure(t.pool, fig.id, "2031-01-01")).toBeNull(); // licence expired
    expect(await loadLearnerFigure(t.pool, "not-a-uuid", day)).toBeNull();

    // The parity loader and the Figure Balance read the printed metadata; the link's caption override wins.
    const [link] = (await listIllustrationLinks(t.pool)).filter((l) => l.assetId === fig.id);
    expect(link).toMatchObject({ credit: META.credit, caption: META.caption, altText: META.altText });
    await t.pool.query("UPDATE asset_links SET caption_override = 'Override caption' WHERE asset_id = $1", [fig.id]);
    expect((await listIllustrationLinks(t.pool)).find((l) => l.assetId === fig.id)?.caption).toBe("Override caption");

    // An approved figure that lacks its credit, caption or alt text (approved before they were
    // required) is never served, so no learner sees a figure without its credit line.
    for (const column of ["credit", "caption", "alt_text"]) {
      await t.pool.query(`UPDATE assets SET ${column} = '' WHERE id = $1`, [fig.id]);
      expect(await loadLearnerFigure(t.pool, fig.id, day)).toBeNull();
      await t.pool.query(`UPDATE assets SET ${column} = $2 WHERE id = $1`, [fig.id, column === "credit" ? META.credit : column === "caption" ? META.caption : META.altText]);
    }
    expect(await loadLearnerFigure(t.pool, fig.id, day)).toMatchObject({ id: fig.id });

    // A public plate needs no study bundle, but still needs approval.
    const plate = await createAssetFromBytes(t.pool, editor, storage, { bytes: png(1600, 1000, 51), declaredMime: "image/png", metadata: { ...META, publicPlate: "on" } });
    expect(await loadLearnerFigure(t.pool, plate.id, day)).toBeNull();
    await submitAssetForReview(t.pool, editor, { assetId: plate.id });
    await reviewAsset(t.pool, curator2, { assetId: plate.id, to: "verified", evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
    expect(await loadLearnerFigure(t.pool, plate.id, day)).toMatchObject({ id: plate.id });

    // The cache lifetime never outlives the licence.
    expect(figureMaxAge(null, new Date("2027-01-01T00:00:00Z"))).toBe(FIGURE_MAX_AGE);
    expect(figureMaxAge("2030-12-31", new Date("2030-12-30T23:59:59Z"))).toBe(86_400);
    expect(figureMaxAge("2030-12-31", new Date("2031-02-01T00:00:00Z"))).toBe(0);
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
  });
});
