/**
 * Media library service: upload (local or S3 presigned + finalize), metadata, review, concept
 * links and imported media candidates.
 *
 * Rules
 *  - Every stored asset has a checksum (sha256 of the exact bytes), a sniffed MIME type, and for
 *    images the pixel width/height read from the file header (the 3D condition keeps aspect).
 *  - Licence and provenance (a provenance kind plus a source URL or a cited source) are required
 *    on upload; images need alt text ("" only when explicitly marked decorative).
 *  - Review: uploaders submit (media.upload); reviewers (media.review) verify, ask for evidence or
 *    reject. Nobody verifies an asset they uploaded or last edited. Editing a verified asset sends
 *    it back to under_review (assets have no database trigger for this, unlike concepts).
 *  - Every mutation runs in `inActorTx` (verification_records get the actor) with an audit_log row.
 *  - Figure governance (DESIGN.md 9.9, 11.10, 16; DR-018, DR-020; migration 0016): images carry
 *    the licence's display cap (`maxPixels`), its expiry (`licenceExpiresOn`) and the public-plate
 *    flag. Image alt text is about 15 words and never repeats the caption; captions are at most 180
 *    characters (rules in src/features/media/contracts.ts). An `illustration` link's position is
 *    the anchor claim index, must point at an existing claim, and a concept has at most one.
 *  - The learner and public figure route (src/app/figures/[assetId]/route.ts) serves an asset
 *    only through `loadLearnerFigure`: approved, licence-valid today, and an illustration of a
 *    concept in a published release snapshot, or flagged for public plates.
 *  - First publication (DR-020 addendum, migration 0017): `stampFirstPublication` records the day
 *    an asset first becomes servable, once, and sets the expiry of a licence term counted from
 *    first publication (V&A: 60 months). It runs wherever an asset can become servable: a review
 *    that verifies it, a link to a concept, a metadata edit and a release publication
 *    (src/server/cms/release.ts). The learner route refuses a termed asset that has no stamp.
 *  - First publication (DR-020 addendum, migration 0017): `stampFirstPublication` records the day
 *    an asset first becomes servable, once, and sets the expiry of a licence term counted from
 *    first publication (V&A: 60 months). It runs wherever an asset can become servable: a review
 *    that verifies it, a link to a concept, a metadata edit and a release publication
 *    (src/server/cms/release.ts). The learner route refuses a termed asset that has no stamp.
 *
 * Not `server-only`: integration tests call it with their own pool and a local store.
 */
import { createHash } from "node:crypto";

import type { Pool } from "pg";
import { z } from "zod";

import type { IllustrationLink } from "@/features/knowledge/read/view";
import { altTextProblem, captionProblem } from "@/features/media/contracts";
import { ASSET_LINK_ROLES, PROVENANCE_KINDS, type VerificationState } from "@/lib/validation/enums";

import { audit, CmsError, ensure, inActorTx, isUuid, type Actor, type Q } from "../core";
import { ALLOWED_MEDIA, ALLOWED_MIMES, checkUpload, isAllowedMime, SNIFF_BYTES, type AllowedMime, type CheckedUpload } from "./sniff";
import { storageKeyFor, type LocalMediaStorage, type S3MediaStorage } from "./storage";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.url({ protocol: /^https?$/, error: "Use an http(s) URL" }).nullable());
const checkbox = z
  .union([z.boolean(), z.string()])
  .optional()
  .nullable()
  .transform((v) => v === true || v === "on" || v === "true");
const optionalPositiveInt = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
  .pipe(z.number().int("Use a whole number of pixels").positive("Use a positive number of pixels").max(100_000).nullable());
const optionalDay = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.iso.date({ error: "Use a date (YYYY-MM-DD)" }).nullable());

/** Descriptive metadata required for every asset (upload and edit). */
export const assetMetadataSchema = z
  .object({
    title: z.string().trim().min(1, "Give the asset a title").max(300),
    altText: z.string().trim().max(1000).optional().nullable().transform((v) => v ?? ""),
    decorative: checkbox,
    caption: optionalText(2000),
    credit: optionalText(500),
    licence: z.string().trim().min(1, "State the licence (e.g. CC BY-SA 4.0, or 'All rights reserved, used with permission')").max(200),
    licenceUrl: optionalUrl,
    sourceUrl: optionalUrl,
    sourceId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v ? v : null))
      .pipe(z.uuid({ error: "Choose a source from the list" }).nullable()),
    provenanceKind: z.enum(PROVENANCE_KINDS, { error: "Choose a provenance kind" }),
    /** Longest side the licence allows on screen (px); empty = no cap. */
    maxPixels: optionalPositiveInt,
    /** Last day the licence permits use; empty = no expiry. */
    licenceExpiresOn: optionalDay,
    publicPlate: checkbox,
    /** Licence term in months from first publication (V&A: 60); empty = none, or keep on edit. */
    licenceTermMonths: z
      .union([z.number(), z.string()])
      .optional()
      .nullable()
      .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
      .pipe(z.number().int("Use a whole number of months").positive("Use a positive number of months").max(1200).nullable()),
  })
  .superRefine((m, ctx) => {
    if (!m.sourceUrl && !m.sourceId) {
      ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Give the source URL or cite a source: provenance is required" });
    }
    if (m.title.startsWith("Demo:")) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Demo media is seeded, not uploaded" });
    }
  });
export type AssetMetadata = z.infer<typeof assetMetadataSchema>;

/**
 * Alt text and caption rules for images: alt text required (empty only when marked decorative),
 * about 15 words and different from the caption; captions at most 180 characters (DESIGN.md 9.9).
 */
function checkAlt(kind: string, m: Pick<AssetMetadata, "altText" | "decorative" | "caption">): string | null {
  if (kind !== "image" && kind !== "texture") return m.altText || null;
  const caption = captionProblem(m.caption);
  if (caption) throw new CmsError("caption_too_long", caption, 422, [{ code: "caption", message: caption }]);
  if (m.decorative) return "";
  if (!m.altText) {
    throw new CmsError("alt_required", "Images need alt text describing what they show (or mark the image as purely decorative).", 422, [
      { code: "altText", message: "Alt text is required" },
    ]);
  }
  const alt = altTextProblem(m.altText, m.caption);
  if (alt) throw new CmsError("alt_rule", alt, 422, [{ code: "altText", message: alt }]);
  return m.altText;
}

async function assertSourceExists(q: Q, sourceId: string | null): Promise<void> {
  if (!sourceId) return;
  const r = await q.query("SELECT 1 FROM sources WHERE id = $1 AND NOT is_demo", [sourceId]);
  if (!r.rows[0]) throw new CmsError("unknown_source", "The cited source does not exist.", 422);
}

async function findBySha(q: Q, sha256: string): Promise<{ id: string; title: string } | null> {
  const r = await q.query<{ id: string; title: string }>("SELECT id, title FROM assets WHERE sha256 = $1 ORDER BY created_at LIMIT 1", [sha256]);
  return r.rows[0] ?? null;
}

function declaredAllowedMime(mime: string): AllowedMime {
  const declared = mime.split(";")[0]!.trim().toLowerCase();
  if (!isAllowedMime(declared)) {
    throw new CmsError("mime_not_allowed", `Files of type "${declared || "unknown"}" are not accepted. Allowed: ${ALLOWED_MIMES.join(", ")}.`, 422);
  }
  return declared;
}

function duplicateError(existing: { id: string; title: string }): CmsError {
  return new CmsError("duplicate_asset", `This file is already in the library as "${existing.title}".`, 409, { assetId: existing.id });
}

export interface CreatedAsset {
  id: string;
  sha256: string;
  storageKey: string;
  mime: string;
  kind: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

async function insertAsset(
  pool: Pool,
  actor: Actor,
  c: { checked: CheckedUpload; sha256: string; byteSize: number; storageKey: string; meta: AssetMetadata; via: "local" | "s3" },
): Promise<CreatedAsset> {
  const alt = checkAlt(c.checked.kind, c.meta);
  return inActorTx(pool, actor, "asset uploaded", async (tx) => {
    await assertSourceExists(tx, c.meta.sourceId);
    const dup = await findBySha(tx, c.sha256);
    if (dup) throw duplicateError(dup);
    const r = await tx.query<{ id: string }>(
      `INSERT INTO assets (kind, title, storage_key, mime_type, byte_size, sha256, width, height, alt_text, caption, credit,
                           licence, licence_url, source_url, source_id, provenance_kind, verification_state, is_demo, created_by, updated_by,
                           max_pixels, licence_expires_on, public_plate, licence_term_months)
       VALUES ($1::asset_kind, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::provenance_kind, 'draft', false, $17, $17,
               $18, $19::date, $20, $21)
       RETURNING id`,
      [
        c.checked.kind, c.meta.title, c.storageKey, c.checked.mime, c.byteSize, c.sha256, c.checked.width, c.checked.height, alt,
        c.meta.caption, c.meta.credit, c.meta.licence, c.meta.licenceUrl, c.meta.sourceUrl, c.meta.sourceId, c.meta.provenanceKind, actor.userId,
        c.meta.maxPixels, c.meta.licenceExpiresOn, c.meta.publicPlate, c.meta.licenceTermMonths,
      ],
    );
    const id = r.rows[0]!.id;
    await tx.query(
      `INSERT INTO asset_versions (asset_id, version, variant, storage_key, mime_type, byte_size, sha256, width, height, created_by)
       VALUES ($1, 1, 'original', $2, $3, $4, $5, $6, $7, $8)`,
      [id, c.storageKey, c.checked.mime, c.byteSize, c.sha256, c.checked.width, c.checked.height, actor.userId],
    );
    await audit(tx, actor, {
      action: "media.asset_uploaded",
      entity: "assets",
      entityId: id,
      after: { title: c.meta.title, kind: c.checked.kind, mime: c.checked.mime, byteSize: c.byteSize, sha256: c.sha256, width: c.checked.width, height: c.checked.height, licence: c.meta.licence, maxPixels: c.meta.maxPixels, licenceExpiresOn: c.meta.licenceExpiresOn, licenceTermMonths: c.meta.licenceTermMonths, publicPlate: c.meta.publicPlate, provenanceKind: c.meta.provenanceKind, sourceUrl: c.meta.sourceUrl, sourceId: c.meta.sourceId, storage: c.via },
      reason: "asset uploaded to the media library",
    });
    return { id, sha256: c.sha256, storageKey: c.storageKey, mime: c.checked.mime, kind: c.checked.kind, byteSize: c.byteSize, width: c.checked.width, height: c.checked.height };
  });
}

/** Local store: validates and stores the bytes, then records the asset. */
export async function createAssetFromBytes(
  pool: Pool,
  actor: Actor,
  storage: LocalMediaStorage,
  input: { bytes: Uint8Array; declaredMime: string; metadata: unknown },
): Promise<CreatedAsset> {
  ensure(actor, "media.upload");
  const meta = assetMetadataSchema.parse(input.metadata);
  const checked = checkUpload({ declaredMime: input.declaredMime, byteSize: input.bytes.byteLength, head: input.bytes.subarray(0, SNIFF_BYTES) });
  checkAlt(checked.kind, meta);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const dup = await findBySha(pool, sha256);
  if (dup) throw duplicateError(dup);
  const storageKey = storageKeyFor(sha256, checked.mime);
  if (!(await storage.exists(storageKey))) await storage.put(storageKey, input.bytes);
  return insertAsset(pool, actor, { checked, sha256, byteSize: input.bytes.byteLength, storageKey, meta, via: "local" });
}

export const presignRequestSchema = z.object({
  declaredMime: z.string().min(1).max(100),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "Expected a lowercase hex SHA-256"),
});

/** S3: checks type/size, refuses duplicates and returns a presigned PUT bound to the checksum. */
export async function presignAssetUpload(pool: Pool, actor: Actor, storage: S3MediaStorage, input: z.infer<typeof presignRequestSchema>) {
  ensure(actor, "media.upload");
  // The bytes are not here yet: check type and size now; the finalize step sniffs the stored bytes.
  const declared = declaredAllowedMime(input.declaredMime);
  const limit = ALLOWED_MEDIA[declared];
  if (input.byteSize > limit.maxBytes) {
    throw new CmsError("too_large", `${limit.label}s are limited to ${Math.round(limit.maxBytes / (1024 * 1024))} MiB.`, 422);
  }
  const dup = await findBySha(pool, input.sha256);
  if (dup) throw duplicateError(dup);
  const storageKey = storageKeyFor(input.sha256, declared);
  const upload = await storage.presignPut(storageKey, { mime: declared, byteSize: input.byteSize, sha256: input.sha256 });
  return { storageKey, upload };
}

/** S3: verifies the uploaded object (size, store checksum, sniffed bytes) and records the asset. */
export async function finalizeAssetUpload(
  pool: Pool,
  actor: Actor,
  storage: S3MediaStorage,
  input: { declaredMime: string; sha256: string; metadata: unknown },
): Promise<CreatedAsset> {
  ensure(actor, "media.upload");
  const meta = assetMetadataSchema.parse(input.metadata);
  const declared = declaredAllowedMime(input.declaredMime);
  const storageKey = storageKeyFor(input.sha256, declared);
  const info = await storage.head(storageKey);
  if (!info) throw new CmsError("upload_missing", "The upload did not reach storage. Upload the file again.", 422);
  if (info.sha256 !== input.sha256) throw new CmsError("checksum_mismatch", "Storage did not confirm the file's SHA-256 checksum.", 422);
  const head = await storage.readHead(storageKey);
  const checked = checkUpload({ declaredMime: declared, byteSize: info.byteSize, head });
  return insertAsset(pool, actor, { checked, sha256: input.sha256, byteSize: info.byteSize, storageKey, meta, via: "s3" });
}

interface AssetRow {
  id: string;
  kind: string;
  title: string;
  alt_text: string | null;
  caption: string | null;
  credit: string | null;
  licence: string | null;
  licence_url: string | null;
  source_url: string | null;
  source_id: string | null;
  max_pixels: number | null;
  licence_expires_on: string | null;
  public_plate: boolean;
  width: number | null;
  height: number | null;
  provenance_kind: string;
  verification_state: VerificationState;
  created_by: string | null;
  updated_by: string | null;
  is_demo: boolean;
}

async function lockAsset(q: Q, assetId: string): Promise<AssetRow> {
  if (!isUuid(assetId)) throw new CmsError("not_found", "Asset not found.", 404);
  const r = await q.query<AssetRow>(
    `SELECT id, kind, title, alt_text, caption, credit, licence, licence_url, source_url, source_id, max_pixels,
            licence_expires_on::text AS licence_expires_on, public_plate, width, height, provenance_kind,
            verification_state, created_by, updated_by, is_demo
       FROM assets WHERE id = $1 FOR UPDATE`,
    [assetId],
  );
  const row = r.rows[0];
  if (!row) throw new CmsError("not_found", "Asset not found.", 404);
  if (row.is_demo) throw new CmsError("demo_readonly", "Demo media is managed by the seed script.", 409);
  return row;
}

const metaOf = (a: AssetRow) => ({
  title: a.title, altText: a.alt_text, caption: a.caption, credit: a.credit, licence: a.licence, licenceUrl: a.licence_url,
  sourceUrl: a.source_url, sourceId: a.source_id, maxPixels: a.max_pixels, licenceExpiresOn: a.licence_expires_on, publicPlate: a.public_plate,
  provenanceKind: a.provenance_kind, verificationState: a.verification_state,
});

/** Edits descriptive metadata. An accepted asset returns to under_review (acceptance covered the old text). */
export async function updateAssetMetadata(pool: Pool, actor: Actor, input: { assetId: string; metadata: unknown }): Promise<{ returnedToReview: boolean }> {
  ensure(actor, "media.upload");
  const meta = assetMetadataSchema.parse(input.metadata);
  return inActorTx(pool, actor, null, async (tx) => {
    const before = await lockAsset(tx, input.assetId);
    const alt = checkAlt(before.kind, meta);
    await assertSourceExists(tx, meta.sourceId);
    const accepted = before.verification_state === "verified" || before.verification_state === "published";
    const nextState: VerificationState = accepted ? "under_review" : before.verification_state;
    if (accepted) {
      await tx.query("SELECT set_config('app.change_reason', $1, true)", ["returned to review: metadata edited after acceptance"]);
    }
    await tx.query(
      `UPDATE assets SET title = $2, alt_text = $3, caption = $4, credit = $5, licence = $6, licence_url = $7, source_url = $8,
                         source_id = $9, provenance_kind = $10::provenance_kind, verification_state = $11::verification_state, updated_by = $12,
                         max_pixels = $13, licence_expires_on = $14::date, public_plate = $15,
                         licence_term_months = COALESCE($16, licence_term_months)
        WHERE id = $1`,
      [
        before.id, meta.title, alt, meta.caption, meta.credit, meta.licence, meta.licenceUrl, meta.sourceUrl, meta.sourceId, meta.provenanceKind, nextState, actor.userId,
        meta.maxPixels, meta.licenceExpiresOn, meta.publicPlate, meta.licenceTermMonths,
      ],
    );
    // An edit never moves the expiry past the end of a term already running from first publication.
    await stampFirstPublication(tx, actor, { assetId: before.id });
    const after = await lockAsset(tx, before.id);
    await audit(tx, actor, { action: "media.asset_updated", entity: "assets", entityId: before.id, before: metaOf(before), after: metaOf(after), reason: accepted ? "edited after acceptance: returned to review" : null });
    return { returnedToReview: accepted };
  });
}

/** Uploader hands the asset to reviewers. */
export async function submitAssetForReview(pool: Pool, actor: Actor, input: { assetId: string }): Promise<void> {
  ensure(actor, "media.upload");
  await inActorTx(pool, actor, "submitted for review", async (tx) => {
    const a = await lockAsset(tx, input.assetId);
    if (!["draft", "needs_evidence", "rejected"].includes(a.verification_state)) {
      throw new CmsError("invalid_transition", `An asset in state "${a.verification_state}" cannot be submitted for review.`, 409);
    }
    await tx.query("UPDATE assets SET verification_state = 'under_review' WHERE id = $1", [a.id]);
    await audit(tx, actor, { action: "media.asset_submitted", entity: "assets", entityId: a.id, before: { verificationState: a.verification_state }, after: { verificationState: "under_review" } });
  });
}

export const MEDIA_EVIDENCE_CHECKS = ["licence", "alt_text", "provenance", "depiction", "caption"] as const;
export const MEDIA_EVIDENCE_LABELS: Record<(typeof MEDIA_EVIDENCE_CHECKS)[number], string> = {
  licence: "Licence permits use in the study and matches the source page; its display cap and expiry are recorded",
  alt_text: "Alt text describes what is visible in about 15 words and does not repeat the caption (or the image is decorative)",
  provenance: "Source URL / cited source checked and the credit matches it",
  depiction: "The asset depicts what its title and caption say",
  caption: "The caption restates or points to its anchor claim and adds no knowledge the claims do not state",
};

export const assetReviewSchema = z
  .object({
    assetId: z.uuid(),
    to: z.enum(["verified", "needs_evidence", "rejected"]),
    reason: z.string().trim().max(2000).optional().nullable().transform((v) => v ?? ""),
    evidenceChecked: z
      .union([z.array(z.enum(MEDIA_EVIDENCE_CHECKS)), z.enum(MEDIA_EVIDENCE_CHECKS)])
      .optional()
      .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
  })
  .superRefine((r, ctx) => {
    if (r.to !== "verified" && !r.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "Give a reason for this decision" });
    if (r.to === "verified" && r.evidenceChecked.length !== MEDIA_EVIDENCE_CHECKS.length) {
      ctx.addIssue({ code: "custom", path: ["evidenceChecked"], message: "Confirm every check before verifying" });
    }
  });

/** Reviewer decision on an asset under review. */
export async function reviewAsset(pool: Pool, actor: Actor, raw: z.input<typeof assetReviewSchema>): Promise<void> {
  ensure(actor, "media.review");
  const input = assetReviewSchema.parse(raw);
  const reason = input.reason || (input.to === "verified" ? "verified: licence, alt text, provenance and depiction checked" : null);
  await inActorTx(pool, actor, reason, async (tx) => {
    const a = await lockAsset(tx, input.assetId);
    if (a.verification_state !== "under_review") {
      throw new CmsError("invalid_transition", `Only assets under review can be decided (this one is "${a.verification_state}").`, 409);
    }
    if (input.to === "verified") {
      if (a.created_by === actor.userId || a.updated_by === actor.userId) {
        throw new CmsError("self_verification", "You uploaded or last edited this asset; another reviewer must verify it.", 403);
      }
      const missing: string[] = [];
      if (!a.licence) missing.push("licence");
      if ((a.kind === "image" || a.kind === "texture") && a.alt_text === null) missing.push("alt text");
      // Every figure carries a credit line and a caption (DESIGN.md 9.9, 11.10, R-H5; honesty rule 13.3).
      if ((a.kind === "image" || a.kind === "texture") && !a.credit?.trim()) missing.push("credit");
      // A decorative image (explicitly empty alt text) is never a figure, so it needs no caption.
      if (a.kind === "image" && a.alt_text !== "" && !a.caption?.trim()) missing.push("caption");
      if (!a.source_url && !a.source_id) missing.push("source URL or cited source");
      if (a.provenance_kind === "unverified") missing.push("a provenance kind other than 'unverified'");
      if (missing.length) throw new CmsError("evidence_missing", `Cannot verify: missing ${missing.join(", ")}.`, 422);
      if (a.kind === "image" || a.kind === "texture") {
        const rule = captionProblem(a.caption) ?? (a.alt_text ? altTextProblem(a.alt_text, a.caption) : null);
        if (rule) throw new CmsError("evidence_missing", `Cannot verify: ${rule}`, 422);
        const edge = a.width && a.height ? Math.max(a.width, a.height) : null;
        if (a.max_pixels && edge && edge > a.max_pixels) {
          throw new CmsError(
            "exceeds_licence_cap",
            `Cannot verify: the file is ${a.width} × ${a.height} px, but the licence allows ${a.max_pixels} px on the long edge. Upload a version at that size, so the platform never publishes more than the licence permits.`,
            422,
          );
        }
      }
    }
    await tx.query("UPDATE assets SET verification_state = $2::verification_state WHERE id = $1", [a.id, input.to]);
    await audit(tx, actor, {
      action: "media.asset_reviewed",
      entity: "assets",
      entityId: a.id,
      before: { verificationState: a.verification_state },
      after: { verificationState: input.to, evidenceChecked: input.evidenceChecked },
      reason,
    });
    if (input.to === "verified") await stampFirstPublication(tx, actor, { assetId: a.id });
  });
}

export const assetLinkSchema = z.object({
  assetId: z.uuid(),
  conceptId: z.uuid({ error: "Choose a concept" }),
  role: z.enum(ASSET_LINK_ROLES),
  position: z.coerce.number().int().min(0).max(999).default(0),
  captionOverride: optionalText(2000),
});

/**
 * Links an asset to a concept. For an `illustration`, the position is the anchor claim index: it
 * must name an existing claim of the concept, and a concept takes at most one illustration (12.3
 * rule 9), so a second one is refused until the first link is removed.
 */
export async function linkAssetToConcept(pool: Pool, actor: Actor, raw: z.input<typeof assetLinkSchema>): Promise<void> {
  ensure(actor, "media.upload");
  const input = assetLinkSchema.parse(raw);
  await inActorTx(pool, actor, null, async (tx) => {
    await lockAsset(tx, input.assetId);
    const c = await tx.query<{ key: string; claims: number }>(
      "SELECT c.key, (SELECT count(*)::int FROM concept_claims cc WHERE cc.concept_id = c.id) AS claims FROM concepts c WHERE c.id = $1 AND NOT c.is_demo FOR UPDATE",
      [input.conceptId],
    );
    if (!c.rows[0]) throw new CmsError("unknown_concept", "Concept not found.", 404);
    if (input.role === "illustration") {
      const claims = c.rows[0].claims;
      if (input.position >= claims) {
        const msg = claims === 0 ? "This concept has no claims yet, so a figure has no claim to anchor to." : `The anchor claim must be one of the concept's ${claims} claim(s): choose 1 to ${claims}.`;
        throw new CmsError("anchor_claim", msg, 422, [{ code: "position", message: msg }]);
      }
      const other = await tx.query<{ title: string }>(
        "SELECT a.title FROM asset_links l JOIN assets a ON a.id = l.asset_id WHERE l.concept_id = $1 AND l.role = 'illustration' AND l.asset_id <> $2 LIMIT 1",
        [input.conceptId, input.assetId],
      );
      if (other.rows[0]) {
        throw new CmsError("one_figure_per_concept", `This concept already has an illustration ("${other.rows[0].title}"). A study concept shows at most one figure: remove that link first.`, 409);
      }
    }
    await tx.query(
      `INSERT INTO asset_links (asset_id, concept_id, role, position, caption_override, is_demo)
       VALUES ($1, $2, $3::asset_link_role, $4, $5, false)
       ON CONFLICT (asset_id, concept_id, role) DO UPDATE SET position = EXCLUDED.position, caption_override = EXCLUDED.caption_override`,
      [input.assetId, input.conceptId, input.role, input.position, input.captionOverride],
    );
    await audit(tx, actor, { action: "media.asset_linked", entity: "asset_links", entityId: input.assetId, after: { ...input, conceptKey: c.rows[0].key } });
    await stampFirstPublication(tx, actor, { assetId: input.assetId });
  });
}

export async function unlinkAsset(pool: Pool, actor: Actor, input: { linkId: string }): Promise<void> {
  ensure(actor, "media.upload");
  if (!isUuid(input.linkId)) throw new CmsError("not_found", "Link not found.", 404);
  await inActorTx(pool, actor, null, async (tx) => {
    const r = await tx.query<{ asset_id: string; concept_id: string; role: string }>(
      "DELETE FROM asset_links WHERE id = $1 AND NOT is_demo RETURNING asset_id, concept_id, role",
      [input.linkId],
    );
    if (!r.rows[0]) throw new CmsError("not_found", "Link not found.", 404);
    await audit(tx, actor, { action: "media.asset_unlinked", entity: "asset_links", entityId: r.rows[0].asset_id, before: r.rows[0] });
  });
}

export const candidateReviewSchema = z
  .object({
    candidateId: z.uuid(),
    status: z.enum(["approved", "rejected", "candidate"]),
    notes: z.string().trim().max(2000).optional().nullable().transform((v) => (v ? v : null)),
  })
  .superRefine((r, ctx) => {
    if (r.status === "rejected" && !r.notes) ctx.addIssue({ code: "custom", path: ["notes"], message: "Say why the candidate is rejected" });
  });

/** Licence decision on an imported media candidate (the file itself is never downloaded here). */
export async function reviewMediaCandidate(pool: Pool, actor: Actor, raw: z.input<typeof candidateReviewSchema>): Promise<void> {
  ensure(actor, "media.review");
  const input = candidateReviewSchema.parse(raw);
  await inActorTx(pool, actor, input.notes, async (tx) => {
    const r = await tx.query<{ status: string; notes: string | null; is_demo: boolean; licence: string | null }>(
      "SELECT status, notes, is_demo, licence FROM media_candidates WHERE id = $1 FOR UPDATE",
      [input.candidateId],
    );
    const before = r.rows[0];
    if (!before) throw new CmsError("not_found", "Media candidate not found.", 404);
    if (before.is_demo) throw new CmsError("demo_readonly", "Demo media is managed by the seed script.", 409);
    if (before.status === "imported") throw new CmsError("invalid_transition", "This candidate is already imported as an asset.", 409);
    if (input.status === "approved" && !before.licence) throw new CmsError("evidence_missing", "A candidate without a stated licence cannot be approved.", 422);
    await tx.query("UPDATE media_candidates SET status = $2::media_candidate_status, notes = coalesce($3, notes) WHERE id = $1", [input.candidateId, input.status, input.notes]);
    await audit(tx, actor, {
      action: "media.candidate_reviewed",
      entity: "media_candidates",
      entityId: input.candidateId,
      before: { status: before.status, notes: before.notes },
      after: { status: input.status, notes: input.notes ?? before.notes },
      reason: input.notes,
    });
  });
}

// -----------------------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------------------

export interface AssetListItem {
  id: string;
  kind: string;
  title: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  altText: string | null;
  caption: string | null;
  credit: string | null;
  licence: string | null;
  licenceUrl: string | null;
  sourceUrl: string | null;
  sourceId: string | null;
  sourceTitle: string | null;
  maxPixels: number | null;
  licenceExpiresOn: string | null;
  publicPlate: boolean;
  provenanceKind: string;
  verificationState: VerificationState;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  createdAt: string;
  links: {
    id: string;
    conceptId: string;
    conceptKey: string;
    conceptTitle: string;
    conceptType: string;
    traditionSlug: string | null;
    traditionName: string | null;
    role: string;
    position: number;
    /** The anchor claim's text (illustrations), or null when the position names no claim. */
    anchorClaim: string | null;
  }[];
}

export async function listAssets(q: Q, opts: { state?: string | null; limit?: number } = {}): Promise<AssetListItem[]> {
  const r = await q.query<{
    id: string; kind: string; title: string; mime_type: string; byte_size: string | number; sha256: string; width: number | null; height: number | null;
    alt_text: string | null; caption: string | null; credit: string | null; licence: string | null; licence_url: string | null; source_url: string | null;
    source_id: string | null; source_title: string | null; max_pixels: number | null; licence_expires_on: string | null; public_plate: boolean;
    provenance_kind: string; verification_state: VerificationState; created_by: string | null;
    created_by_name: string | null; updated_by: string | null; created_at: Date; links: AssetListItem["links"] | null;
  }>(
    `SELECT a.id, a.kind, a.title, a.mime_type, a.byte_size, a.sha256, a.width, a.height, a.alt_text, a.caption, a.credit, a.licence, a.licence_url,
            a.source_url, a.source_id, s.title AS source_title, a.max_pixels, a.licence_expires_on::text AS licence_expires_on, a.public_plate,
            a.provenance_kind, a.verification_state, a.created_by, u.name AS created_by_name,
            a.updated_by, a.created_at,
            (SELECT json_agg(json_build_object('id', l.id, 'conceptId', c.id, 'conceptKey', c.key, 'conceptTitle', c.title, 'conceptType', c.type,
                                               'traditionSlug', t.slug, 'traditionName', t.name, 'role', l.role, 'position', l.position,
                                               'anchorClaim', CASE WHEN l.role = 'illustration' THEN cc.text END)
                             ORDER BY l.position, c.key)
               FROM asset_links l JOIN concepts c ON c.id = l.concept_id
               LEFT JOIN traditions t ON t.id = c.tradition_id
               LEFT JOIN concept_claims cc ON cc.concept_id = c.id AND cc.position = l.position
              WHERE l.asset_id = a.id) AS links
       FROM assets a
       LEFT JOIN sources s ON s.id = a.source_id
       LEFT JOIN users u ON u.id = a.created_by
      WHERE NOT a.is_demo AND ($1::verification_state IS NULL OR a.verification_state = $1::verification_state)
      ORDER BY a.created_at DESC
      LIMIT $2`,
    [opts.state ?? null, opts.limit ?? 200],
  );
  return r.rows.map((a) => ({
    id: a.id, kind: a.kind, title: a.title, mimeType: a.mime_type, byteSize: Number(a.byte_size), sha256: a.sha256, width: a.width, height: a.height,
    altText: a.alt_text, caption: a.caption, credit: a.credit, licence: a.licence, licenceUrl: a.licence_url, sourceUrl: a.source_url, sourceId: a.source_id,
    sourceTitle: a.source_title, maxPixels: a.max_pixels, licenceExpiresOn: a.licence_expires_on, publicPlate: a.public_plate,
    provenanceKind: a.provenance_kind, verificationState: a.verification_state, createdBy: a.created_by,
    createdByName: a.created_by_name, updatedBy: a.updated_by, createdAt: a.created_at.toISOString(), links: a.links ?? [],
  }));
}

export interface StoredAssetRef {
  id: string;
  kind: string;
  title: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
}

export async function loadAssetRef(q: Q, assetId: string): Promise<StoredAssetRef | null> {
  if (!isUuid(assetId)) return null;
  const r = await q.query<{ id: string; kind: string; title: string; storage_key: string; mime_type: string; byte_size: string | number }>(
    "SELECT id, kind, title, storage_key, mime_type, byte_size FROM assets WHERE id = $1",
    [assetId],
  );
  const a = r.rows[0];
  return a ? { id: a.id, kind: a.kind, title: a.title, storageKey: a.storage_key, mimeType: a.mime_type, byteSize: Number(a.byte_size) } : null;
}

export interface MediaCandidateItem {
  id: string;
  url: string;
  title: string;
  licence: string | null;
  author: string | null;
  depictsKey: string | null;
  depictsConceptId: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  dimensionsSource: string | null;
  status: string;
  notes: string | null;
  packageSlug: string | null;
}

export async function listMediaCandidates(q: Q, opts: { status?: string | null } = {}): Promise<MediaCandidateItem[]> {
  const r = await q.query<{
    id: string; url: string; title: string; licence: string | null; author: string | null; depicts_key: string | null; depicts_concept_id: string | null;
    width: number | null; height: number | null; mime_type: string | null; dimensions_source: string | null; status: string; notes: string | null; package_slug: string | null;
  }>(
    `SELECT m.id, m.url, m.title, m.licence, m.author, m.depicts_key, m.depicts_concept_id, m.width, m.height, m.mime_type, m.dimensions_source,
            m.status, m.notes, p.slug AS package_slug
       FROM media_candidates m LEFT JOIN content_packages p ON p.id = m.package_id
      WHERE NOT m.is_demo AND ($1::media_candidate_status IS NULL OR m.status = $1::media_candidate_status)
      ORDER BY p.slug NULLS LAST, m.depicts_key NULLS LAST, m.url`,
    [opts.status ?? null],
  );
  return r.rows.map((m) => ({
    id: m.id, url: m.url, title: m.title, licence: m.licence, author: m.author, depictsKey: m.depicts_key, depictsConceptId: m.depicts_concept_id,
    width: m.width, height: m.height, mimeType: m.mime_type, dimensionsSource: m.dimensions_source, status: m.status, notes: m.notes, packageSlug: m.package_slug,
  }));
}

/** Sources and concepts offered in the metadata / link forms. */
export async function listMediaFormOptions(q: Q): Promise<{ sources: { id: string; label: string }[]; concepts: { id: string; label: string }[] }> {
  const s = await q.query<{ id: string; title: string; author: string | null; year: number | null }>(
    "SELECT id, title, author, year FROM sources WHERE NOT is_demo AND verification_state NOT IN ('rejected', 'archived') ORDER BY title LIMIT 1000",
  );
  const c = await q.query<{ id: string; key: string; title: string }>(
    "SELECT id, key, title FROM concepts WHERE NOT is_demo AND verification_state NOT IN ('rejected', 'archived') ORDER BY key LIMIT 2000",
  );
  return {
    sources: s.rows.map((x) => ({ id: x.id, label: `${x.title}${x.author ? ` — ${x.author}` : ""}${x.year ? ` (${x.year})` : ""}` })),
    concepts: c.rows.map((x) => ({ id: x.id, label: `${x.title} (${x.key})` })),
  };
}

/** The caption a learner sees under an illustration: the link's override, else the asset's caption. */
export const FIGURE_CAPTION_SQL = "COALESCE(NULLIF(btrim(l.caption_override), ''), a.caption)";

/**
 * Every `illustration` link of a real concept with its asset's licence governance, in the shape the
 * content parity engine's figure check and the CMS Figure Balance matrix read (`ParityFigureAsset`).
 */
export async function listIllustrationLinks(q: Q): Promise<
  {
    assetId: string; conceptId: string; role: string; position: number; verificationState: string; isDemo: boolean; width: number | null; height: number | null; maxPixels: number | null; licenceExpiresOn: string | null;
    credit: string | null; caption: string | null; altText: string | null;
  }[]
> {
  const r = await q.query<{
    asset_id: string; concept_id: string; role: string; position: number; verification_state: string; is_demo: boolean; width: number | null; height: number | null; max_pixels: number | null; licence_expires_on: string | null;
    credit: string | null; caption: string | null; alt_text: string | null;
  }>(
    `SELECT l.asset_id, l.concept_id, l.role::text AS role, l.position, a.verification_state::text AS verification_state, a.is_demo,
            a.width, a.height, a.max_pixels, a.licence_expires_on::text AS licence_expires_on,
            a.credit, ${FIGURE_CAPTION_SQL} AS caption, a.alt_text
       FROM asset_links l JOIN assets a ON a.id = l.asset_id
      WHERE l.role = 'illustration'
      ORDER BY l.concept_id, l.position, l.asset_id`,
  );
  return r.rows.map((x) => ({
    assetId: x.asset_id, conceptId: x.concept_id, role: x.role, position: x.position, verificationState: x.verification_state, isDemo: x.is_demo,
    width: x.width, height: x.height, maxPixels: x.max_pixels, licenceExpiresOn: x.licence_expires_on,
    credit: x.credit, caption: x.caption, altText: x.alt_text,
  }));
}

export interface LearnerFigureRef extends StoredAssetRef {
  width: number | null;
  height: number | null;
  maxPixels: number | null;
  licenceExpiresOn: string | null;
}

/**
 * The asset the learner and public figure route may serve (DESIGN.md 16), or null. Served only
 * when ALL hold on `day` (YYYY-MM-DD, the request date):
 *  - a real (non-demo) image, approved (verified or published);
 *  - its licence has not expired (`licence_expires_on` empty or on/after `day`);
 *  - the stored file is no larger than the licence's display cap (`max_pixels` on the long edge;
 *    the V&A terms allow 768 px), so the platform never publishes more pixels than permitted;
 *  - it has the credit, caption and alt text every figure prints (9.9, R-H5, honesty rule 13.3),
 *    so an asset approved before those became required is never shown without its credit line;
 *  - it is an `illustration` of a concept frozen into a published release snapshot (the bundle a
 *    study pins), or it is cleared for public plates;
 *  - a licence term counted from first publication has its first-publication day recorded
 *    (`stampFirstPublication`).
 * Anything else is indistinguishable from a missing asset (the route answers 404).
 */
export async function loadLearnerFigure(q: Q, assetId: string, day: string): Promise<LearnerFigureRef | null> {
  if (!isUuid(assetId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const r = await q.query<{ id: string; kind: string; title: string; storage_key: string; mime_type: string; byte_size: string | number; width: number | null; height: number | null; max_pixels: number | null; licence_expires_on: string | null }>(
    `SELECT a.id, a.kind, a.title, a.storage_key, a.mime_type, a.byte_size, a.width, a.height, a.max_pixels, a.licence_expires_on::text AS licence_expires_on
       FROM assets a
      WHERE a.id = $1
        AND ${servableSql("$2::date", { requireStamp: true })}`,
    [assetId, day],
  );
  const a = r.rows[0];
  return a
    ? { id: a.id, kind: a.kind, title: a.title, storageKey: a.storage_key, mimeType: a.mime_type, byteSize: Number(a.byte_size), width: a.width, height: a.height, maxPixels: a.max_pixels, licenceExpiresOn: a.licence_expires_on }
    : null;
}

/**
 * SQL condition: asset `a` may be shown on `day` (a SQL date expression). With `requireStamp`, an
 * asset whose licence term runs from first publication must already carry its first-publication
 * day (the learner route and the read model); without it, the condition says whether the asset is
 * visible at all (used to stamp that day).
 */
function servableSql(day: string, opts: { requireStamp: boolean }): string {
  return `NOT a.is_demo
        AND a.kind = 'image'
        AND a.verification_state IN ('verified', 'published')
        AND (a.licence_expires_on IS NULL OR a.licence_expires_on >= ${day})
        AND (a.max_pixels IS NULL OR greatest(a.width, a.height) <= a.max_pixels)
        ${opts.requireStamp ? "AND (a.licence_term_months IS NULL OR a.first_published_on IS NOT NULL)" : ""}
        AND btrim(coalesce(a.credit, '')) <> ''
        AND btrim(coalesce(a.caption, '')) <> ''
        AND btrim(coalesce(a.alt_text, '')) <> ''
        AND (
          a.public_plate
          OR EXISTS (
            SELECT 1
              FROM asset_links l
              JOIN snapshot_items si ON si.item_kind = 'concept' AND si.entity_ref = l.concept_id::text
              JOIN content_snapshots s ON s.id = si.snapshot_id
             WHERE l.asset_id = a.id AND l.role = 'illustration' AND s.kind = 'release' AND s.status = 'published' AND NOT s.is_demo
          )
        )`;
}

/** Today in UTC: the day the learner route judges licences on. */
const UTC_TODAY = "(now() AT TIME ZONE 'utc')::date";

/**
 * Records first publication (DR-020 addendum): every asset that is visible today and has no
 * first-publication day gets today, once; an asset with a licence term counted from first
 * publication then gets the expiry the term allows (the day before its anniversary), and an expiry
 * set by hand never runs past it. With `assetId`, only that asset is considered. Runs in the
 * caller's transaction; each change is audited. Returns the ids stamped now.
 */
export async function stampFirstPublication(q: Q, actor: Actor, opts: { assetId?: string } = {}): Promise<string[]> {
  const only = opts.assetId ? "AND a.id = $1" : "";
  const params = opts.assetId ? [opts.assetId] : [];
  const stamped = await q.query<{ id: string; first_published_on: string }>(
    `UPDATE assets a SET first_published_on = ${UTC_TODAY}
      WHERE a.first_published_on IS NULL ${only}
        AND ${servableSql(UTC_TODAY, { requireStamp: false })}
      RETURNING a.id, a.first_published_on::text AS first_published_on`,
    params,
  );
  const termed = await q.query<{ id: string; licence_expires_on: string }>(
    `UPDATE assets a
        SET licence_expires_on = least(coalesce(a.licence_expires_on, t.term_end), t.term_end)
       FROM (SELECT id, (first_published_on + make_interval(months => licence_term_months::int) - interval '1 day')::date AS term_end
               FROM assets WHERE licence_term_months IS NOT NULL AND first_published_on IS NOT NULL) t
      WHERE a.id = t.id ${only}
        AND a.licence_expires_on IS DISTINCT FROM least(coalesce(a.licence_expires_on, t.term_end), t.term_end)
      RETURNING a.id, a.licence_expires_on::text AS licence_expires_on`,
    params,
  );
  for (const row of stamped.rows) {
    await audit(q, actor, {
      action: "media.asset_first_published",
      entity: "assets",
      entityId: row.id,
      after: { firstPublishedOn: row.first_published_on },
      reason: "first publication recorded (a licence term counts from this day)",
    });
  }
  for (const row of termed.rows) {
    await audit(q, actor, {
      action: "media.asset_term_applied",
      entity: "assets",
      entityId: row.id,
      after: { licenceExpiresOn: row.licence_expires_on },
      reason: "licence expiry set from the term counted from first publication",
    });
  }
  return stamped.rows.map((r) => r.id);
}

/**
 * Every illustration link the learner route would serve on `day`, with what a photo figure prints,
 * for the read model (src/server/knowledge/read-model.ts). The anchor-claim gate and the protocol
 * switch are applied there, against the snapshot both conditions read.
 */
export async function listLearnerPhotoLinks(q: Q, day: string): Promise<IllustrationLink[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const r = await q.query<{
    asset_id: string; concept_id: string; role: string; position: number; width: number; height: number; alt_text: string; caption: string; credit: string; licence: string; licence_url: string | null;
  }>(
    `SELECT l.asset_id, l.concept_id, l.role::text AS role, l.position, a.width, a.height, a.alt_text, ${FIGURE_CAPTION_SQL} AS caption, a.credit, a.licence, a.licence_url
       FROM asset_links l JOIN assets a ON a.id = l.asset_id
      WHERE l.role = 'illustration' AND NOT l.is_demo AND a.width IS NOT NULL AND a.height IS NOT NULL
        AND ${servableSql("$1::date", { requireStamp: true })}
      ORDER BY l.concept_id, l.position, l.asset_id`,
    [day],
  );
  return r.rows.map((x) => ({
    assetId: x.asset_id,
    conceptId: x.concept_id,
    role: x.role,
    position: x.position,
    src: `/figures/${x.asset_id}`,
    width: x.width,
    height: x.height,
    altText: x.alt_text,
    caption: x.caption,
    credit: x.credit,
    licence: x.licence,
    licenceUrl: x.licence_url,
  }));
}

/** One year: the learner figure route's cache lifetime for content-addressed files. */
export const FIGURE_MAX_AGE = 31_536_000;

/** Seconds from `now` to the end of the licence's last day (UTC), at most FIGURE_MAX_AGE. */
export function figureMaxAge(licenceExpiresOn: string | null, now: Date): number {
  if (!licenceExpiresOn) return FIGURE_MAX_AGE;
  const end = Date.parse(`${licenceExpiresOn}T23:59:59Z`);
  return Math.max(0, Math.min(FIGURE_MAX_AGE, Math.floor((end - now.getTime()) / 1000)));
}
