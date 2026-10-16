/**
 * Ingests the study photographs through the media pipeline (the same service the CMS media library
 * uses), so they reach learners only through its governance:
 *
 *   npx tsx scripts/content/ingest-study-photos.ts --uploader <staff email> [--dry-run] [--test]
 *
 * For every image with status "proposed" in content/review/media-proposals.json and, when present,
 * content/review/process-photo-proposals.json (both read only; today: one V&A textile photograph
 * per study tradition), it takes the 768 px derivative in
 * scripts/content/study-photos/<tradition>-<kind>-768.jpg (the Machilipatnam textile cropped at the
 * left to remove the museum's paper tag, DR-020) and:
 *  1. uploads it (sniffed type, SHA-256, pixel size from the file) with the proposal's title,
 *     caption and alt text, the credit and licence its source requires (`PHOTO_SOURCES`), the
 *     record page as provenance, the 768 px display cap and the 60-month term counted from first
 *     publication;
 *  2. links it as the `illustration` of its concept, anchored after the claim the proposal names
 *     first;
 *  3. submits it for review.
 *
 * Sources (DR-020 for the V&A; DR-047, number to confirm at merge, for the others):
 *  - V&A: the fixed V&A credit, "(cropped)" when a crop is noted;
 *  - Rick Bradley and Eric Parker (Flickr; CC BY 2.0 and CC BY-NC 2.0): the photographer named,
 *    a noted crop credited;
 *  - Sahapedia (CC BY-NC-SA 4.0 with written permission, docs/research/sahapedia-image-permission-reply.md):
 *    the credit names the photographer Sahapedia confirms; uncropped and unaltered only;
 *  - PARI (CC BY-NC-ND 4.0 with written permission, docs/research/pari-image-permission-reply.md):
 *    PARI's exact credit line, Rahul Maganti's photographs only; uncropped and unaltered only.
 * Every source: at most 768 px on the long edge and five years from first publication
 * (`licenceTermMonths`, from which `stampFirstPublication` sets `licenceExpiresOn`). A proposal is
 * refused when it notes a crop or edit on a no-alteration source, or when its source credits a
 * photographer and the name is missing or still a placeholder.
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
import { existsSync, readFileSync } from "node:fs";
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

/** One cap and one term for every study photo, whatever its source (DR-020; DR-047). */
export const PHOTO_MAX_PIXELS = VA_MAX_PIXELS;
/** Sahapedia and PARI: up to five years from first publication; the CC sources are held to the same term. */
export const PHOTO_TERM_MONTHS = VA_TERM_MONTHS;

export const PHOTO_SOURCE_IDS = ["vam", "rick-bradley", "sahapedia", "eric-parker", "pari"] as const;
export type PhotoSourceId = (typeof PHOTO_SOURCE_IDS)[number];

/** The exact credit line PARI confirmed in its third reply (docs/research/pari-image-permission-reply.md). */
export const PARI_CREDIT = "Photo: Rahul Maganti / People's Archive of Rural India (PARI). CC BY-NC-ND 4.0, used with permission.";

/** What a source requires of every photograph taken from it. */
export interface PhotoSource {
  id: PhotoSourceId;
  /** The proposal's licence text must match, so a mislabelled proposal is refused. */
  licencePattern: RegExp;
  /** The record page must be on the source's site (provenance). */
  pageUrlPattern: RegExp;
  licence: string;
  licenceUrl: string;
  /**
   * null: the credit names the institution, no photographer (V&A);
   * "named": any photographer, whose name must be given (Sahapedia);
   * a name: the only photographer the licence or permission covers.
   */
  photographer: null | "named" | string;
  /** Uncropped and unaltered only (a no-derivatives licence, or the permission's condition). */
  noAlteration: boolean;
  credit(p: { photographer: string; recordTitle?: string | undefined; cropped: boolean }): string;
}

const cropSuffix = (cropped: boolean) => (cropped ? " (cropped)" : "");
const flickrCredit = (licence: string) => (p: { photographer: string; recordTitle?: string | undefined; cropped: boolean }) =>
  `Photo: ${p.photographer}${p.recordTitle ? `, "${p.recordTitle}"` : ""}, Flickr, ${licence}${cropSuffix(p.cropped)}`;

export const PHOTO_SOURCES: Record<PhotoSourceId, PhotoSource> = {
  vam: {
    id: "vam",
    licencePattern: /Victoria and Albert Museum/,
    pageUrlPattern: /^https:\/\/collections\.vam\.ac\.uk\/item\//,
    licence: VA_LICENCE,
    licenceUrl: VA_LICENCE_URL,
    photographer: null,
    noAlteration: false,
    credit: ({ cropped }) => `${VA_CREDIT}${cropSuffix(cropped)}`,
  },
  "rick-bradley": {
    id: "rick-bradley",
    licencePattern: /^CC BY 2\.0$/,
    pageUrlPattern: /^https:\/\/www\.flickr\.com\/photos\/89139703@N00\/\d+\/?$/,
    licence: "CC BY 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by/2.0/",
    photographer: "Rick Bradley",
    noAlteration: false,
    credit: flickrCredit("CC BY 2.0"),
  },
  sahapedia: {
    id: "sahapedia",
    licencePattern: /^CC BY-NC-SA 4\.0\b/,
    pageUrlPattern: /^https:\/\/www\.sahapedia\.org\//,
    licence: "CC BY-NC-SA 4.0, used with permission",
    licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    photographer: "named",
    noAlteration: true,
    credit: ({ photographer }) => `Photo: ${photographer} / Sahapedia, CC BY-NC-SA 4.0`,
  },
  "eric-parker": {
    id: "eric-parker",
    licencePattern: /^CC BY-NC 2\.0$/,
    pageUrlPattern: /^https:\/\/www\.flickr\.com\/photos\/ericparker\/\d+\/?$/,
    licence: "CC BY-NC 2.0",
    licenceUrl: "https://creativecommons.org/licenses/by-nc/2.0/",
    photographer: "Eric Parker",
    noAlteration: false,
    credit: flickrCredit("CC BY-NC 2.0"),
  },
  pari: {
    id: "pari",
    licencePattern: /^CC BY-NC-ND 4\.0\b/,
    pageUrlPattern: /^https:\/\/ruralindiaonline\.org\//,
    licence: "CC BY-NC-ND 4.0, used with permission",
    licenceUrl: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
    photographer: "Rahul Maganti",
    noAlteration: true,
    credit: () => PARI_CREDIT,
  },
};

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
  /** Whose terms apply; absent = the V&A (the DR-020 entries carry no source field). */
  source: z.enum(PHOTO_SOURCE_IDS).optional(),
  /** The photographer the credit names. */
  photographer: z.string().optional(),
  /** The record's own title, quoted in a Flickr credit when given. */
  recordTitle: z.string().optional(),
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

/** Is a crop noted in the proposal? */
export function cropNoted(p: Pick<PhotoProposal, "notes">): boolean {
  return p.notes.some((n) => /^crop/i.test(n.trim()));
}

/** A note that the image was cropped or otherwise altered beyond resizing. */
export function alterationNoted(p: Pick<PhotoProposal, "notes">): boolean {
  return p.notes.some((n) => /^(crop|edit|alter|retouch|recolou?r|colour[- ]correct|straighten|mirror|flip)/i.test(n.trim()));
}

/** A crop noted in the proposal is credited (DR-020: "credited 'cropped'"). The V&A credit. */
export function creditOf(p: Pick<PhotoProposal, "notes">): string {
  return PHOTO_SOURCES.vam.credit({ photographer: "", cropped: cropNoted(p) });
}

/** Whose terms apply: the proposal's `source`, else the V&A when its licence names the museum. */
export function sourceOf(p: Pick<PhotoProposal, "id" | "licence" | "source">): PhotoSource {
  if (p.source) return PHOTO_SOURCES[p.source];
  if (PHOTO_SOURCES.vam.licencePattern.test(p.licence)) return PHOTO_SOURCES.vam;
  throw new Error(`${p.id}: no "source" given and not a V&A image; set "source" to one of ${PHOTO_SOURCE_IDS.join(", ")}`);
}

/** A photographer name that is missing, blank or still a placeholder such as "[Photographer's Name]". */
export function missingPhotographer(name: string | undefined): boolean {
  const n = (name ?? "").trim();
  return !n || /[[\]<>{}]/.test(n) || /^(the )?photographer('?s)?( name)?$/i.test(n) || /^(unknown|anonymous|tbc|tbd|n\/?a|none|-+|\?+)$/i.test(n);
}

/** The ingest plan of one proposal, refused when its source's terms are not met. */
export function planPhoto(p: PhotoProposal): PhotoIngestPlan {
  const src = sourceOf(p);
  if (!src.licencePattern.test(p.licence)) throw new Error(`${p.id}: licence "${p.licence}" is not the ${src.id} licence (${src.licence})`);
  if (!src.pageUrlPattern.test(p.pageUrl)) throw new Error(`${p.id}: ${p.pageUrl} is not a ${src.id} record page`);
  let photographer = "";
  if (src.photographer !== null) {
    if (missingPhotographer(p.photographer)) throw new Error(`${p.id}: no photographer named; the ${src.id} credit must name one`);
    photographer = p.photographer!.trim();
    if (src.photographer !== "named" && photographer !== src.photographer) {
      throw new Error(`${p.id}: photographer "${photographer}" is not ${src.photographer}, the only one the ${src.id} licence or permission covers`);
    }
  }
  if (src.noAlteration && alterationNoted(p)) throw new Error(`${p.id}: ${src.id} images are shown uncropped and unaltered; a crop or edit is noted`);
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
      credit: src.credit({ photographer, recordTitle: p.recordTitle, cropped: cropNoted(p) }),
      licence: src.licence,
      licenceUrl: src.licenceUrl,
      sourceUrl: p.pageUrl,
      provenanceKind: "historical_documentation",
      maxPixels: PHOTO_MAX_PIXELS,
      licenceTermMonths: PHOTO_TERM_MONTHS,
      publicPlate: false,
    },
  };
}

/** Parses one proposal entry (the format of content/review/*-proposals.json `images`). */
export function parsePhotoProposal(raw: unknown): PhotoProposal {
  return proposalSchema.parse(raw);
}

/**
 * The plans of every proposed photograph, validated before anything is written. Entries with any
 * other status ("held", "reserve", "rejected") are skipped. Takes one or more proposal files.
 */
export function planStudyPhotos(...proposalsJson: unknown[]): PhotoIngestPlan[] {
  const images = proposalsJson.flatMap((j) => z.object({ images: z.array(z.unknown()) }).parse(j).images);
  const proposed = images
    .map((raw) => proposalSchema.safeParse(raw))
    .filter((r) => r.success && r.data.status === "proposed")
    .map((r) => r.data!);
  return proposed.map(planPhoto);
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
  const review = join(REPO_ROOT, "content", "review");
  const proposalFiles = ["media-proposals.json", "process-photo-proposals.json"].map((f) => join(review, f)).filter((f) => existsSync(f));
  const plans = planStudyPhotos(...proposalFiles.map((f) => JSON.parse(readFileSync(f, "utf8")) as unknown));
  const files = plans.map((p) => {
    const bytes = new Uint8Array(readFileSync(join(dir, p.file)));
    const size = jpegSize(bytes);
    if (!size) throw new Error(`${p.file}: not a JPEG`);
    if (Math.max(size.width, size.height) > p.metadata.maxPixels) throw new Error(`${p.file}: ${size.width} x ${size.height} px is over the ${p.metadata.maxPixels} px cap`);
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
