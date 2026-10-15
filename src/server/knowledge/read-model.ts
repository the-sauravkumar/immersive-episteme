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
 * Unknown slugs/keys return null (render notFound()). Search returns `{ enabled: false }`
 * when the caller's context disables it (study config `searchEnabled`).
 *
 * The pure query logic lives in src/features/knowledge/read/view.ts; this file only adds I/O
 * and caching. Request-time APIs (cookies, headers) are never read here.
 */
import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  createKnowledgeView,
  diagramFiguresByConcept,
  resolveConceptFigures,
  type ComparisonView,
  type DiagramScope,
  type KnowledgeFigureData,
  type ConceptDetail,
  type ConceptRef,
  type KnowledgeView,
  type ProcessChain,
  type RelatedConceptGroups,
  type SnapshotInfo,
  type TraditionDetail,
  type TraditionSummary,
} from "@/features/knowledge/read/view";
import { STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { getPool } from "@/server/db/client";

import { loadSnapshotPayload, searchSnapshotConcepts, MAX_QUERY_LENGTH } from "./snapshot-store";

export type * from "@/features/knowledge/read/view";
export { SnapshotNotReadableError } from "./snapshot-store";

export const KNOWLEDGE_CACHE_TAG = "knowledge";
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

export interface SearchHit {
  concept: ConceptRef;
  score: number;
}

export type SearchResult = { enabled: false } | { enabled: true; query: string; hits: SearchHit[] };

export interface SearchRequest {
  /** Pass `context.features.search` from the learning context. False short-circuits to `{ enabled: false }`. */
  enabled: boolean;
  limit?: number;
  traditionSlug?: string;
}

/**
 * Full-text plus trigram search over the snapshot's concepts (ranking in ./snapshot-store.ts).
 * Queries shorter than 2 characters return no hits; longer than 200 are truncated.
 */
export async function search(snapshotId: string, query: string, request: SearchRequest): Promise<SearchResult> {
  if (!request.enabled) return { enabled: false };
  return searchCached(snapshotId, query.trim().slice(0, MAX_QUERY_LENGTH), request.limit ?? 20, request.traditionSlug ?? null);
}

async function searchCached(snapshotId: string, query: string, limit: number, traditionSlug: string | null): Promise<SearchResult> {
  "use cache";
  tag(snapshotId);
  const view = await viewFor(snapshotId);
  const traditionId = traditionSlug ? view.getTradition(traditionSlug)?.id : undefined;
  if (traditionSlug && !traditionId) return { enabled: true, query, hits: [] };
  const rows = await searchSnapshotConcepts(getPool(), snapshotId, query, { limit, traditionId });
  const refs = new Map(view.conceptRefsById(rows.map((r) => r.conceptId)).map((c) => [c.id, c]));
  return {
    enabled: true,
    query,
    hits: rows.filter((r) => refs.has(r.conceptId)).map((r) => ({ concept: refs.get(r.conceptId)!, score: r.score })),
  };
}

// ---------------------------------------------------------------------------------------
// Knowledge figures (DESIGN.md 9.9, 12.3; DR-018)
// ---------------------------------------------------------------------------------------

export interface FigureOptions {
  /**
   * Traditions in scope: the learning context's `traditionSlugs` (a study's traditions), or null
   * for every tradition in the snapshot. Pass the SAME value in both conditions.
   */
  traditionSlugs: readonly string[] | null;
  /** The protocol switch `settings.figures.structureDiagrams` (default on), identical in both conditions. */
  structureDiagrams: boolean;
}

function diagramScope(view: KnowledgeView, opts: FigureOptions): DiagramScope {
  const traditionSlugs = opts.traditionSlugs ? [...opts.traditionSlugs] : view.listTraditions().map((t) => t.slug);
  const study = traditionSlugs.filter((s) => (STUDY_TRADITION_SLUGS as readonly string[]).includes(s));
  return { traditionSlugs, balanceSlugs: study.length > 0 ? study : traditionSlugs };
}

/**
 * Every concept's figures in scope, by concept id (the 3D payload reads this once; the 2D concept
 * page reads one entry through `getConceptFigures`). Graph-derived diagrams are balanced across the
 * study traditions; at most one figure per concept. Photographs join through the same
 * `resolveConceptFigures` once the learner figure route and licence governance exist (WP6); until
 * then no photograph is served to learners.
 */
export async function getFiguresByConcept(snapshotId: string, opts: FigureOptions): Promise<Record<string, KnowledgeFigureData[]>> {
  "use cache";
  tag(snapshotId);
  const view = await viewFor(snapshotId);
  const diagrams = diagramFiguresByConcept(view, diagramScope(view, opts));
  const out: Record<string, KnowledgeFigureData[]> = {};
  for (const [conceptId, list] of diagrams) {
    const figures = resolveConceptFigures({ diagrams: list, photos: [], structureDiagrams: opts.structureDiagrams });
    if (figures.length > 0) out[conceptId] = figures;
  }
  return out;
}

/** The figures of one concept (by key, slug or id), resolved exactly as `getFiguresByConcept`. */
export async function getConceptFigures(snapshotId: string, keyOrSlugOrId: string, opts: FigureOptions): Promise<KnowledgeFigureData[]> {
  const view = await viewFor(snapshotId);
  const concept = view.getConcept(keyOrSlugOrId);
  if (!concept) return [];
  return (await getFiguresByConcept(snapshotId, opts))[concept.id] ?? [];
}
