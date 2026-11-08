import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  conceptPhotosOf,
  createKnowledgeView,
  type ConceptPhoto,
  type KnowledgeView,
} from "@/features/knowledge/read/view";
import { listSnapshotPhotoLinks } from "@/server/cms/media/service";
import { getPool } from "@/server/db/client";

import { loadSnapshotPayload } from "./snapshot-store";

export type * from "@/features/knowledge/read/view";

const KNOWLEDGE_CACHE_TAG = "knowledge";
export const MEDIA_FIGURES_CACHE_TAG = "media-figures";
const snapshotCacheTag = (snapshotId: string) => `snapshot:${snapshotId}`;

const MAX_VIEWS = 4;
const views = new Map<string, KnowledgeView>();

async function viewFor(snapshotId: string): Promise<KnowledgeView> {
  const hit = views.get(snapshotId);
  if (hit) return hit;
  const view = createKnowledgeView(await loadSnapshotPayload(getPool(), snapshotId));
  views.set(snapshotId, view);
  while (views.size > MAX_VIEWS) views.delete(views.keys().next().value!);
  return view;
}

export async function listStudyPhotos(snapshotId: string): Promise<ConceptPhoto[]> {
  "use cache";
  cacheTag(KNOWLEDGE_CACHE_TAG, snapshotCacheTag(snapshotId), MEDIA_FIGURES_CACHE_TAG);
  cacheLife("hours");
  return conceptPhotosOf(await viewFor(snapshotId), await listSnapshotPhotoLinks(getPool(), snapshotId));
}

