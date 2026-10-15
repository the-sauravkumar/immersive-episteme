/**
 * Media contracts: stored assets (checksummed, licensed, with alt text), their versions and
 * links to concepts, and media candidates imported from content/FORMAT.md awaiting review.
 *
 * Figure governance (DESIGN.md 9.9, 11.10, 12.3; DR-018, DR-020) lives here as pure rules, so the
 * CMS forms, the media service, the learner figure route and the content parity engine apply the
 * same numbers:
 *  - a study figure caption is at most FIGURE_CAPTION_MAX characters and restates or points to its
 *    anchor claim;
 *  - image alt text is about ALT_TARGET_WORDS words (ALT_MIN_WORDS to ALT_MAX_WORDS) and never
 *    repeats the caption (R-H6);
 *  - every study figure is shown at most STUDY_FIGURE_CAP px on its long edge, and its source must
 *    reach that cap so no tradition's figures look sharper (R-C20);
 *  - an `illustration` link's `position` is the anchor claim index.
 */
import { z } from "zod";

import { ASSET_KINDS, ASSET_LINK_ROLES, MEDIA_CANDIDATE_STATUSES, PROVENANCE_KINDS } from "@/lib/validation/enums";
import { httpUrlSchema, nonBlank, sha256Schema, uuidSchema } from "@/lib/validation/primitives";

export const assetKindSchema = z.enum(ASSET_KINDS);
export const assetLinkRoleSchema = z.enum(ASSET_LINK_ROLES);
export const mimeTypeSchema = z.string().regex(/^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/);

/** 500 MiB upper bound for any single upload (3D models with textures included). */
export const MAX_ASSET_BYTES = 500 * 1024 * 1024;

/** Longest caption of a study figure (DESIGN.md 9.9: "Caption at most 180 characters (CMS-enforced)"). */
export const FIGURE_CAPTION_MAX = 180;
/** Alt text length (DESIGN.md 9.9: "required, about 15 words"). */
export const ALT_TARGET_WORDS = 15;
export const ALT_MIN_WORDS = 8;
export const ALT_MAX_WORDS = 30;
/** The lightbox long-edge cap of every study figure (DESIGN.md 9.9, 12.3 rule 10; equals LIGHTBOX_MAX_EDGE). */
export const STUDY_FIGURE_CAP = 768;

export const countWords = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length;
/** Lower-case, collapse whitespace and drop punctuation, so "Same text." and "same  text" compare equal. */
export const normaliseText = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Why an image's alt text breaks the figure rules, or null. `caption` may be empty. */
export function altTextProblem(alt: string, caption: string | null | undefined): string | null {
  const words = countWords(alt);
  if (words < ALT_MIN_WORDS) return `Alt text is ${words} word${words === 1 ? "" : "s"}; describe what is visible in about ${ALT_TARGET_WORDS} words (at least ${ALT_MIN_WORDS}).`;
  if (words > ALT_MAX_WORDS) return `Alt text is ${words} words; keep it to about ${ALT_TARGET_WORDS} (at most ${ALT_MAX_WORDS}).`;
  if (caption && normaliseText(alt) === normaliseText(caption)) return "Alt text must not repeat the caption: describe what is visible instead.";
  return null;
}

/** Why a figure caption breaks the figure rules, or null. */
export function captionProblem(caption: string | null | undefined): string | null {
  if (caption && caption.trim().length > FIGURE_CAPTION_MAX) return `Captions are at most ${FIGURE_CAPTION_MAX} characters (this one has ${caption.trim().length}).`;
  return null;
}

/** The long edge a figure can be shown at: its pixel size, limited by the licence cap. */
export function displayLongEdge(a: { width: number | null; height: number | null; maxPixels: number | null }): number | null {
  if (!a.width || !a.height) return null;
  const edge = Math.max(a.width, a.height);
  return a.maxPixels ? Math.min(edge, a.maxPixels) : edge;
}

/** Is the licence valid on `day` (YYYY-MM-DD)? NULL expiry = no expiry. */
export function licenceValidOn(expiresOn: string | null, day: string): boolean {
  return expiresOn === null || expiresOn >= day;
}

export const assetInputSchema = z
  .object({
    kind: assetKindSchema,
    title: nonBlank(300),
    storageKey: z.string().min(1).max(512),
    mimeType: mimeTypeSchema,
    byteSize: z.number().int().positive().max(MAX_ASSET_BYTES),
    sha256: sha256Schema,
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
    durationMs: z.number().int().nonnegative().nullish(),
    /** Required for images and textures; "" marks a purely decorative image. */
    altText: z.string().max(1000).nullish(),
    caption: z.string().max(2000).nullish(),
    credit: z.string().max(500).nullish(),
    licence: z.string().max(200).nullish(),
    licenceUrl: httpUrlSchema.nullish(),
    sourceUrl: httpUrlSchema.nullish(),
    sourceId: uuidSchema.nullish(),
    /** Longest side the licence allows on screen (px); null = no cap. */
    maxPixels: z.number().int().positive().nullish(),
    /** Last day the licence permits use (YYYY-MM-DD); null = no expiry. */
    licenceExpiresOn: z.iso.date().nullish(),
    publicPlate: z.boolean().default(false),
    provenanceKind: z.enum(PROVENANCE_KINDS),
    isDemo: z.boolean().default(false),
  })
  .superRefine((a, ctx) => {
    if ((a.kind === "image" || a.kind === "texture") && (a.altText === null || a.altText === undefined)) {
      ctx.addIssue({ code: "custom", path: ["altText"], message: "Images need alt text (use \"\" for decorative)" });
    }
    if (a.isDemo && !a.title.startsWith("Demo:")) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Demo assets need a 'Demo:' title" });
    }
    if (a.isDemo && a.provenanceKind !== "unverified") {
      ctx.addIssue({ code: "custom", path: ["provenanceKind"], message: "Demo assets are always 'unverified'" });
    }
  });
export type AssetInput = z.infer<typeof assetInputSchema>;

export const assetVersionInputSchema = z.object({
  assetId: uuidSchema,
  version: z.number().int().positive(),
  variant: z.string().regex(/^[a-z0-9_-]+$/).default("original"),
  storageKey: z.string().min(1).max(512),
  mimeType: mimeTypeSchema,
  byteSize: z.number().int().positive().max(MAX_ASSET_BYTES),
  sha256: sha256Schema,
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
});

export const assetLinkInputSchema = z.object({
  assetId: uuidSchema,
  conceptId: uuidSchema,
  role: assetLinkRoleSchema.default("illustration"),
  /** For `illustration`: the anchor claim index (zero-based); the figure renders after that claim. */
  position: z.number().int().min(0).default(0),
  captionOverride: z.string().max(2000).nullish(),
});

/** The anchor claim index of an illustration link (its `position`), or null for other roles. */
export const anchorClaimIndexOf = (l: { role: string; position: number }): number | null => (l.role === "illustration" ? l.position : null);

export const mediaCandidateReviewSchema = z.object({
  candidateId: uuidSchema,
  status: z.enum(MEDIA_CANDIDATE_STATUSES),
  notes: z.string().max(2000).nullish(),
});
