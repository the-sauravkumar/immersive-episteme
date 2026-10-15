/**
 * Ingests the three DR-020 study photographs through the media pipeline (the same service the CMS
 * media library uses), so they reach learners only through its governance:
 *
 *   npx tsx scripts/content/ingest-study-photos.ts --uploader <staff email> [--dry-run] [--test]
 *
 * For every image with status "proposed" in content/review/media-proposals.json (read only: one
 * V&A textile photograph per study tradition), it takes the 768 px derivative in
 * scripts/content/study-photos/<tradition>-<kind>-768.jpg (the Machilipatnam one cropped at the
 * left to remove the museum's paper tag, DR-020) and:
 *  1. uploads it (sniffed type, SHA-256, pixel size from the file) with the proposal's title,
 *     caption and alt text, the fixed V&A credit, the V&A licence, the record page as provenance,
 *     the 768 px display cap and the 60-month term counted from first publication;
 *  2. links it as the `illustration` of its concept, anchored after the claim the proposal names
 *     first (the claim that names the object);
 *  3. submits it for review.
 *
 * It never verifies anything: a second curator verifies each asset in the CMS (nobody verifies
 * their own upload). A photograph then shows, identically in both conditions, only when the asset
 * is verified, its anchor claim's concept is verified and in a published release, its licence is
 * valid, and the protocol switch `figures.photos` is on; its first-publication day is recorded the
 * moment that happens (`stampFirstPublication`). Never on the home page: no plate flag is set.
 *
 * Idempotent: a file already in the library (same SHA-256) is reused, and its link is updated.
 * The uploader must be a staff account with the media.upload permission (content editor, curator).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { altTextProblem, captionProblem } from "../../src/features/media/contracts";
import type { StaffRole } from "../../src/lib/permissions/roles";
import { CmsError, type Actor } from "../../src/server/cms/core";
import { createAssetFromBytes, finalizeAssetUpload, linkAssetToConcept, presignAssetUpload, submitAssetForReview } from "../../src/server/cms/media/service";
import { describeMediaStorage, getMediaStorage } from "../../src/server/cms/media/storage";
import { makePool, redact, resolveDatabaseUrl } from "../db/_shared";

import { arg, flag, REPO_ROOT } from "./_shared";

/** The credit the V&A requires on every image (terms section 3; reply archived in docs/research/va-image-licence-reply.md). */
export const VA_CREDIT = "© Victoria and Albert Museum, London";
export const VA_LICENCE = "V&A non-commercial terms";
export const VA_LICENCE_URL = "https://www.vam.ac.uk/info/va-websites-terms-conditions";
/** Longest side the V&A allows on screen, and the one cap for every study photo (DR-020). */
export const VA_MAX_PIXELS = 768;
/** "up to 5 years from first day of publication". */
export const VA_TERM_MONTHS = 60;

const proposalSchema = z.object({
  id: z.string(),
  status: z.string(),
  kind: z.string(),
  tradition: z.string(),
  title: z.string(),
  conceptKey: z.string(),
  claimIds: z.array(z.string()).min(1),
  pageUrl: z.url(),
  caption: z.string(),
  altText: z.string(),
  licence: z.string(),
  notes: z.array(z.string()).default([]),
});
export type PhotoProposal = z.infer<typeof proposalSchema>;

/** What the pipeline receives for one proposal: the asset metadata and the link. */
export interface PhotoIngestPlan {
  proposalId: string;
  file: string;
  conceptKey: string;
  /** Zero-based anchor claim index (the first claim the proposal names). */
  position: number;
  metadata: {
    title: string;
    altText: string;
    caption: string;
    credit: string;
    licence: string;
    licenceUrl: string;
    sourceUrl: string;
    provenanceKind: "historical_documentation";
    maxPixels: number;
    licenceTermMonths: number;
    publicPlate: false;
  };
}

/** The anchor claim index from a claim id such as "ajrakh.historical_context.x#4". */
export function anchorPosition(claimId: string, conceptKey: string): number {
  const m = /^(.+)#(\d+)$/.exec(claimId);
  if (!m || m[1] !== conceptKey) throw new Error(`Claim id ${claimId} does not name a claim of ${conceptKey}`);
  return Number(m[2]);
}

/** A crop noted in the proposal is credited (DR-020: "credited 'cropped'"). */
export function creditOf(p: Pick<PhotoProposal, "notes">): string {
  return p.notes.some((n) => /^crop/i.test(n.trim())) ? `${VA_CREDIT} (cropped)` : VA_CREDIT;
}

/** The plans of every proposed photograph, validated before anything is written. */
export function planStudyPhotos(proposalsJson: unknown): PhotoIngestPlan[] {
  const images = z.object({ images: z.array(z.unknown()) }).parse(proposalsJson).images;
  const proposed = images
    .map((raw) => proposalSchema.safeParse(raw))
    .filter((r) => r.success && r.data.status === "proposed")
    .map((r) => r.data!);
  return proposed.map((p) => {
    if (!/Victoria and Albert Museum/.test(p.licence)) throw new Error(`${p.id}: not a V&A image; this script applies the V&A terms only`);
    const caption = captionProblem(p.caption);
    if (caption) throw new Error(`${p.id}: ${caption}`);
    const alt = altTextProblem(p.altText, p.caption);
    if (alt) throw new Error(`${p.id}: ${alt}`);
    return {
      proposalId: p.id,
      file: `${p.tradition}-${p.kind}-768.jpg`,
      conceptKey: p.conceptKey,
      position: anchorPosition(p.claimIds[0]!, p.conceptKey),
      metadata: {
        title: p.title,
        altText: p.altText,
        caption: p.caption,
        credit: creditOf(p),
        licence: VA_LICENCE,
        licenceUrl: VA_LICENCE_URL,
        sourceUrl: p.pageUrl,
        provenanceKind: "historical_documentation",
        maxPixels: VA_MAX_PIXELS,
        licenceTermMonths: VA_TERM_MONTHS,
        publicPlate: false,
      },
    };
  });
}

/** Width and height from a baseline or progressive JPEG's SOF marker. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  const b = Buffer.from(bytes);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

async function main() {
  const uploader = arg("uploader");
  const dryRun = flag("dry-run");
  if (!uploader && !dryRun) throw new Error("Usage: npx tsx scripts/content/ingest-study-photos.ts --uploader <staff email> [--dry-run] [--test]");
  const dir = join(REPO_ROOT, "scripts", "content", "study-photos");
  const plans = planStudyPhotos(JSON.parse(readFileSync(join(REPO_ROOT, "content", "review", "media-proposals.json"), "utf8")));
  const files = plans.map((p) => {
    const bytes = new Uint8Array(readFileSync(join(dir, p.file)));
    const size = jpegSize(bytes);
    if (!size) throw new Error(`${p.file}: not a JPEG`);
    if (Math.max(size.width, size.height) > VA_MAX_PIXELS) throw new Error(`${p.file}: ${size.width} x ${size.height} px is over the ${VA_MAX_PIXELS} px cap`);
    return { plan: p, bytes, size, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  for (const f of files) {
    console.log(`[photos] ${f.plan.proposalId}: ${f.plan.file} ${f.size.width} x ${f.size.height} px, sha256 ${f.sha256.slice(0, 12)}, ${f.plan.conceptKey} after claim ${f.plan.position + 1}, credit "${f.plan.metadata.credit}"`);
  }
  if (dryRun) return;

  const { url, label } = resolveDatabaseUrl();
  console.log(`[photos] ${label} database ${redact(url)}`);
  const pool = makePool(url);
  try {
    const u = await pool.query<{ id: string; roles: StaffRole[] }>(
      "SELECT u.id, coalesce(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles FROM users u LEFT JOIN user_roles r ON r.user_id = u.id WHERE lower(u.email) = lower($1) GROUP BY u.id",
      [uploader],
    );
    if (!u.rows[0]) throw new Error(`No account for ${uploader}`);
    const actor: Actor = { userId: u.rows[0].id, roles: u.rows[0].roles };
    const storage = getMediaStorage();
    const where = describeMediaStorage(storage);
    console.log(`[photos] storage: ${where.mode} (${where.location})`);
    for (const f of files) {
      const concept = await pool.query<{ id: string }>("SELECT id FROM concepts WHERE key = $1 AND NOT is_demo", [f.plan.conceptKey]);
      if (!concept.rows[0]) throw new Error(`${f.plan.conceptKey}: concept not in the database (run the content import first)`);
      let assetId: string;
      try {
        if (storage.mode === "local") {
          assetId = (await createAssetFromBytes(pool, actor, storage, { bytes: f.bytes, declaredMime: "image/jpeg", metadata: f.plan.metadata })).id;
        } else {
          const { upload } = await presignAssetUpload(pool, actor, storage, { declaredMime: "image/jpeg", byteSize: f.bytes.byteLength, sha256: f.sha256 });
          const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: Buffer.from(f.bytes) });
          if (!put.ok) throw new Error(`${f.plan.file}: storage refused the upload (HTTP ${put.status})`);
          assetId = (await finalizeAssetUpload(pool, actor, storage, { declaredMime: "image/jpeg", sha256: f.sha256, metadata: f.plan.metadata })).id;
        }
        console.log(`[photos] ${f.plan.proposalId}: uploaded as ${assetId}`);
      } catch (e) {
        const existing = e instanceof CmsError && e.code === "duplicate_asset" ? (e.details as { assetId?: string } | undefined)?.assetId : undefined;
        if (!existing) throw e;
        assetId = existing;
        console.log(`[photos] ${f.plan.proposalId}: already in the library as ${assetId}`);
      }
      await linkAssetToConcept(pool, actor, { assetId, conceptId: concept.rows[0].id, role: "illustration", position: f.plan.position });
      const state = (await pool.query<{ s: string }>("SELECT verification_state::text AS s FROM assets WHERE id = $1", [assetId])).rows[0]?.s;
      if (state === "draft" || state === "needs_evidence") {
        await submitAssetForReview(pool, actor, { assetId });
        console.log(`[photos] ${f.plan.proposalId}: linked and submitted for review`);
      } else {
        console.log(`[photos] ${f.plan.proposalId}: linked (state ${state})`);
      }
    }
    console.log("[photos] done. A second curator verifies each asset in the CMS media library.");
  } finally {
    await pool.end();
  }
}

// Run only as a script (the unit tests import the planning helpers).
if (process.argv[1] && /ingest-study-photos\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("[photos] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
