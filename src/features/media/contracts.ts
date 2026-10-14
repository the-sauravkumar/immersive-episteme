/**
 * Media contracts: stored assets (checksummed, licensed, with alt text), their versions and
 * links to concepts, and media candidates imported from content/FORMAT.md awaiting review.
 */
import { z } from "zod";

import { ASSET_KINDS, ASSET_LINK_ROLES, MEDIA_CANDIDATE_STATUSES, PROVENANCE_KINDS } from "@/lib/validation/enums";
import { httpUrlSchema, nonBlank, sha256Schema, uuidSchema } from "@/lib/validation/primitives";

export const assetKindSchema = z.enum(ASSET_KINDS);
export const assetLinkRoleSchema = z.enum(ASSET_LINK_ROLES);
export const mimeTypeSchema = z.string().regex(/^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/);

/** 500 MiB upper bound for any single upload (3D models with textures included). */
export const MAX_ASSET_BYTES = 500 * 1024 * 1024;

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
  position: z.number().int().min(0).default(0),
  captionOverride: z.string().max(2000).nullish(),
});

export const mediaCandidateReviewSchema = z.object({
  candidateId: uuidSchema,
  status: z.enum(MEDIA_CANDIDATE_STATUSES),
  notes: z.string().max(2000).nullish(),
});
