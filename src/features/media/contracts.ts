import { z } from "zod";

import { ASSET_KINDS, PROVENANCE_KINDS } from "@/lib/validation/enums";
import { httpUrlSchema, nonBlank, sha256Schema, uuidSchema } from "@/lib/validation/primitives";

export const assetKindSchema = z.enum(ASSET_KINDS);
export const mimeTypeSchema = z.string().regex(/^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/);

export const MAX_ASSET_BYTES = 500 * 1024 * 1024;

export const FIGURE_CAPTION_MAX = 180;
export const ALT_TARGET_WORDS = 15;
export const ALT_MIN_WORDS = 8;
export const ALT_MAX_WORDS = 30;

export const countWords = (s: string): number => s.trim().split(/\s+/u).filter(Boolean).length;
export const normaliseText = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function altTextProblem(alt: string, caption: string | null | undefined): string | null {
  const words = countWords(alt);
  if (words < ALT_MIN_WORDS) return `Alt text is ${words} word${words === 1 ? "" : "s"}; describe what is visible in about ${ALT_TARGET_WORDS} words (at least ${ALT_MIN_WORDS}).`;
  if (words > ALT_MAX_WORDS) return `Alt text is ${words} words; keep it to about ${ALT_TARGET_WORDS} (at most ${ALT_MAX_WORDS}).`;
  if (caption && normaliseText(alt) === normaliseText(caption)) return "Alt text must not repeat the caption: describe what is visible instead.";
  return null;
}

export function captionProblem(caption: string | null | undefined): string | null {
  if (caption && caption.trim().length > FIGURE_CAPTION_MAX) return `Captions are at most ${FIGURE_CAPTION_MAX} characters (this one has ${caption.trim().length}).`;
  return null;
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
    altText: z.string().max(1000).nullish(),
    caption: z.string().max(2000).nullish(),
    credit: z.string().max(500).nullish(),
    licence: z.string().max(200).nullish(),
    licenceUrl: httpUrlSchema.nullish(),
    sourceUrl: httpUrlSchema.nullish(),
    sourceId: uuidSchema.nullish(),
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

export const anchorClaimIndexOf = (l: { role: string; position: number }): number | null => (l.role === "illustration" ? l.position : null);
