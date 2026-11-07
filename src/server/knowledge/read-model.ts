/**
 * Knowledge read model: what the learning pages (2D and immersive), the study pages and the
 * research console use to read craft knowledge. Every function takes the SNAPSHOT ID the caller
 * got from the learning context (src/server/learning/context.ts), never "the latest content",
 * so both conditions of a study provably read the same immutable bundle.
 *
 * Caching: published and review snapshots never change (see ./snapshot-store.ts), so every
 * function is a `'use cache'` function keyed by its arguments, tagged `snapshot:<id>` (and
 * `knowledge`) and kept for `cacheLife('max')`. `revalidateTag(snapshotCacheTag(id))` drops
 * one snapshot's entries; nothing needs to call it in normal operation.
 *
 * Errors: an unknown, draft-release or malformed snapshot throws SnapshotNotReadableError.
 * Unknown slugs/keys return null (render notFound()).
 *
 * The pure query logic lives in src/features/knowledge/read/view.ts; this file only adds I/O
 * and caching. Request-time APIs (cookies, headers) are never read here.
 */
import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  createKnowledgeView,
  type ComparisonView,
  type ConceptDetail,
  type ConceptRef,
  type KnowledgeView,
  type ProcessChain,
  type RelatedConceptGroups,
  type SnapshotInfo,
  type TraditionDetail,
  type TraditionSummary,
} from "@/features/knowledge/read/view";
import { getPool } from "@/server/db/client";

import { loadSnapshotPayload } from "./snapshot-store";

export type * from "@/features/knowledge/read/view";
export { SnapshotNotReadableError } from "./snapshot-store";

export const KNOWLEDGE_CACHE_TAG = "knowledge";
/** Tag of the cached study-photo lists; the media actions drop it when an asset or link changes. */
export const MEDIA_FIGURES_CACHE_TAG = "media-figures";
export const snapshotCacheTag = (snapshotId: string) => `snapshot:${snapshotId}`;

// In-process memo of built views (indexes over the payload). Snapshots are immutable, so a
// view never goes stale; the cap only bounds memory. Only resolved views are shared, never
// pending promises (a promise created in one cache scope and awaited in another can hang a
// prerender; see the "use cache" troubleshooting notes in the Next docs).
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

/** Label, demo/unverified flags and counts. Show `includesUnverified` as an "unverified content" notice. */
export async function getSnapshotInfo(snapshotId: string): Promise<SnapshotInfo> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).info();
}

/** All traditions in the snapshot, by slug. */
export async function listTraditions(snapshotId: string): Promise<TraditionSummary[]> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).listTraditions();
}

/** One tradition with GI record sources, its overview concept and its concepts grouped by type. */
export async function getTradition(snapshotId: string, traditionSlug: string): Promise<TraditionDetail | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getTradition(traditionSlug);
}

/** A concept (by key, slug or id) with its claims, each claim's evidence (sources) and an evidence summary. */
export async function getConcept(snapshotId: string, keyOrSlugOrId: string): Promise<ConceptDetail | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getConcept(keyOrSlugOrId);
}

/** The tradition's process: process_stage concepts in PRECEDES ordinal order (+ other sequences, loops). */
export async function getProcessChain(snapshotId: string, traditionSlug: string): Promise<ProcessChain | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getProcessChain(traditionSlug);
}

/** Typed, directed relations of a concept grouped by semantics class (causal, sequential, ...). */
export async function getRelatedConcepts(snapshotId: string, keyOrSlugOrId: string): Promise<RelatedConceptGroups | null> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getRelatedConcepts(keyOrSlugOrId);
}

/** Comparison concepts with the concepts they compare and their SIMILAR_TO / CONTRASTS_WITH links. */
export async function getComparisons(snapshotId: string, opts: { traditionSlug?: string } = {}): Promise<ComparisonView[]> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).getComparisons(opts);
}

/** Concept refs by id, in input order (unknown ids are skipped). */
export async function getConceptRefs(snapshotId: string, conceptIds: readonly string[]): Promise<ConceptRef[]> {
  "use cache";
  tag(snapshotId);
  return (await viewFor(snapshotId)).conceptRefsById(conceptIds);
}

// ---------------------------------------------------------------------------------------
// Knowledge figures (DESIGN.md 9.9, 12.3; DR-018)
// ---------------------------------------------------------------------------------------

