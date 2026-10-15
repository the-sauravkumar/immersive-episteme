"use server";

/**
 * Media library server actions. Each: assertPermission -> Zod -> service (ensure + audit in one
 * transaction) -> refresh(), via runAction. The local-disk upload itself goes through the route
 * handler src/app/(cms)/cms/media/upload/route.ts (multipart body).
 */
import { z } from "zod";

import type { ActionState } from "@/components/cms/action-state";

import { CmsError } from "../core";
import { formObject, runAction } from "../run-action";
import {
  assetLinkSchema,
  assetMetadataSchema,
  assetReviewSchema,
  candidateReviewSchema,
  finalizeAssetUpload,
  linkAssetToConcept,
  presignAssetUpload,
  presignRequestSchema,
  reviewAsset,
  reviewMediaCandidate,
  submitAssetForReview,
  unlinkAsset,
  updateAssetMetadata,
} from "./service";
import { getMediaStorage } from "./storage";

function s3Storage() {
  const storage = getMediaStorage();
  if (storage.mode !== "s3") throw new CmsError("wrong_storage_mode", "Direct uploads need S3 storage; this server stores media on local disk.", 409);
  return storage;
}

/** S3 mode, step 1: presigned PUT for a file with this type, size and SHA-256. */
export async function presignUploadAction(input: { declaredMime: string; byteSize: number; sha256: string }): Promise<ActionState> {
  return runAction("media.upload", presignRequestSchema, input, async ({ actor, pool }, data) => {
    const { storageKey, upload } = await presignAssetUpload(pool, actor, s3Storage(), data);
    return { message: "Upload authorised", data: { storageKey, url: upload.url, headers: upload.headers } };
  });
}

const finalizeSchema = z.object({
  declaredMime: z.string().min(1).max(100),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  metadata: assetMetadataSchema,
});

/** S3 mode, step 2: verify the stored object and record the asset. */
export async function finalizeUploadAction(input: { declaredMime: string; sha256: string; metadata: Record<string, unknown> }): Promise<ActionState> {
  return runAction("media.upload", finalizeSchema, input, async ({ actor, pool }, data) => {
    const asset = await finalizeAssetUpload(pool, actor, s3Storage(), { declaredMime: data.declaredMime, sha256: data.sha256, metadata: input.metadata });
    return { message: "Uploaded. Submit it for review when the metadata is complete.", data: { assetId: asset.id } };
  });
}

const updateSchema = z.object({ assetId: z.uuid() }).and(assetMetadataSchema);

export async function updateAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formObject(fd);
  return runAction("media.upload", updateSchema, raw, async ({ actor, pool }, data) => {
    const r = await updateAssetMetadata(pool, actor, { assetId: data.assetId, metadata: raw });
    return r.returnedToReview ? "Saved. The asset was verified, so it is back under review." : "Saved.";
  });
}

export async function submitAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("media.upload", z.object({ assetId: z.uuid() }), formObject(fd), async ({ actor, pool }, data) => {
    await submitAssetForReview(pool, actor, data);
    return "Submitted for review.";
  });
}

export async function reviewAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("media.review", assetReviewSchema, formObject(fd), async ({ actor, pool }, data) => {
    await reviewAsset(pool, actor, data);
    return data.to === "verified" ? "Verified." : data.to === "rejected" ? "Rejected." : "Marked as needing evidence.";
  });
}

/**
 * The form asks for the anchor claim by its number as curators see it (1, 2, 3 ...: the claim
 * numbers of the proof and of both conditions); the stored `position` is zero-based.
 */
function linkInputFromForm(raw: Record<string, unknown>): Record<string, unknown> | null {
  if (!("anchorClaim" in raw)) return raw;
  const { anchorClaim, ...rest } = raw;
  const n = typeof anchorClaim === "string" && /^\s*\d+\s*$/.test(anchorClaim) ? Number(anchorClaim) : NaN;
  return Number.isInteger(n) && n >= 1 ? { ...rest, position: n - 1 } : null;
}

export async function linkAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const input = linkInputFromForm(formObject(fd));
  if (!input) {
    const msg = "Give the claim number the figure follows: 1 for the first claim.";
    return { ok: false, error: msg, code: "anchor_claim", fieldErrors: { position: [msg] } };
  }
  return runAction("media.upload", assetLinkSchema, input, async ({ actor, pool }, data) => {
    await linkAssetToConcept(pool, actor, data);
    return "Linked to the concept.";
  });
}

export async function unlinkAssetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("media.upload", z.object({ linkId: z.uuid() }), formObject(fd), async ({ actor, pool }, data) => {
    await unlinkAsset(pool, actor, data);
    return "Link removed.";
  });
}

export async function reviewCandidateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction("media.review", candidateReviewSchema, formObject(fd), async ({ actor, pool }, data) => {
    await reviewMediaCandidate(pool, actor, data);
    return `Candidate marked ${data.status}.`;
  });
}
