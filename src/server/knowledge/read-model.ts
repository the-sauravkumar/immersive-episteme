import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  conceptPhotosOf,
  createKnowledgeView,
  type ComparisonView,
  type ConceptPhoto,
  type ConceptDetail,
  type ConceptRef,
  type KnowledgeView,
  type ProcessChain,
  type RelatedConceptGroups,
  type SnapshotInfo,
  type TraditionDetail,
  type TraditionSummary,
} from "@/features/knowledge/read/view";
import { listSnapshotPhotoLinks } from "@/server/cms/media/service";
import { getPool } from "@/server/db/client";

import { loadSnapshotPayload } from "./snapshot-store";

export type * from "@/features/knowledge/read/view";
export { SnapshotNotReadableError } from "./snapshot-store";

export const KNOWLEDGE_CACHE_TAG = "knowledge";
export const MEDIA_FIGURES_CACHE_TAG = "media-figures";
export const snapshotCacheTag = (snapshotId: string) => `snapshot:${snapshotId}`;

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

function tag(snapshotId: string): void {
  cacheTag(KNOWLEDGE_CACHE_TAG, snapshotCacheTag(snapshotId));
  cacheLife("max");
}

export async function getSnapshotInfo(snapshotId: string): Promise<SnapshotInfo> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).info();
}

export async function listTraditions(snapshotId: string): Promise<TraditionSummary[]> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).listTraditions();
}

export async function getTradition(snapshotId: string, traditionSlug: string): Promise<TraditionDetail | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getTradition(traditionSlug);
}

export async function getConcept(snapshotId: string, keyOrSlugOrId: string): Promise<ConceptDetail | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getConcept(keyOrSlugOrId);
}

export async function getProcessChain(snapshotId: string, traditionSlug: string): Promise<ProcessChain | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getProcessChain(traditionSlug);
}

export async function getRelatedConcepts(snapshotId: string, keyOrSlugOrId: string): Promise<RelatedConceptGroups | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getRelatedConcepts(keyOrSlugOrId);
}

export async function getComparisons(snapshotId: string, opts: { traditionSlug?: string } = {}): Promise<ComparisonView[]> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getComparisons(opts);
}

export async function getConceptRefs(snapshotId: string, conceptIds: readonly string[]): Promise<ConceptRef[]> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).conceptRefsById(conceptIds);
}

export async function listStudyPhotos(snapshotId: string): Promise<ConceptPhoto[]> {
  "use cache";
  cacheTag(KNOWLEDGE_CACHE_TAG, snapshotCacheTag(snapshotId), MEDIA_FIGURES_CACHE_TAG);
  cacheLife("hours");
  return conceptPhotosOf(await viewFor(snapshotId), await listSnapshotPhotoLinks(getPool(), snapshotId));
}

