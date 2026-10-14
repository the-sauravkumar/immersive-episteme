/**
 * Spatial manifests for the immersive condition. `getManifest(id)` returns the stored manifest
 * (zones, rooms, exhibits, paths, traceability) that /learn/immersive renders. The id comes
 * from the learning context (a study pins one manifest id; the demo and staff preview use the
 * demo study's manifest), never from the client.
 *
 * Manifests are written once (compile inputs are unique, see ./manifest-store.ts); a published
 * one is immutable by trigger and a draft/valid one is never rewritten by the compiler, so the
 * result is cached for `cacheLife('max')`, tagged `manifest:<id>` and `spatial`.
 */
import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getPool } from "@/server/db/client";

import { loadManifest, type ManifestRecord } from "./manifest-store";

export type { ManifestRecord } from "./manifest-store";

export const SPATIAL_CACHE_TAG = "spatial";
export const manifestCacheTag = (manifestId: string) => `manifest:${manifestId}`;

/** The stored manifest record, or null when no manifest has this id. */
export async function getManifest(manifestId: string): Promise<ManifestRecord | null> {
  "use cache";
  cacheTag(SPATIAL_CACHE_TAG, manifestCacheTag(manifestId));
  cacheLife("max");
  return loadManifest(getPool(), manifestId);
}
