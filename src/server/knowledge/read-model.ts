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
  photoFiguresOf,
  resolveConceptFigures,
  type ComparisonView,
  type DiagramScope,
  type KnowledgeFigureData,
  type ConceptDetail,
  type ConceptRef,
  type KnowledgeView,
  type PhotoFigure,
  type ProcessChain,
  type RelatedConceptGroups,
  type SnapshotInfo,
  type TraditionDetail,
  type TraditionSummary,
} from "@/features/knowledge/read/view";
import { STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { listLearnerPhotoLinks } from "@/server/cms/media/service";
import { getPool } from "@/server/db/client";

import { loadSnapshotPayload, searchSnapshotConcepts, MAX_QUERY_LENGTH } from "./snapshot-store";

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
  /**
   * The protocol switch `settings.figures.photos` (DR-020, default on), identical in both
   * conditions. Optional only until the 3D payload passes it (contract with the 3D track); an
   * absent value is read as the protocol default, so pass `figureOptionsOf(ctx)` everywhere.
   */
  photos?: boolean;
}

/**
 * The figure options of a learning context: the ONE place both conditions take them from (the 2D
 * pages and the 3D payload), so the two can never pass different switches (parity check P14).
 */
export function figureOptionsOf(ctx: { traditionSlugs?: readonly string[] | null; settings: { figures: { structureDiagrams: boolean; photos: boolean } } }): Required<FigureOptions> {
  return { traditionSlugs: ctx.traditionSlugs ?? null, structureDiagrams: ctx.settings.figures.structureDiagrams, photos: ctx.settings.figures.photos };
}

/** The protocol default of `figures.photos` (on), used when a caller passes no value. */
const PHOTOS_BY_DEFAULT = true;

/**
 * The study photographs servable today, by concept id, gated by the anchor claim's verification in
 * THIS snapshot (`photoFiguresOf`). Live media rows, so the cache entry lives for an hour (tag
 * `media-figures`, dropped by the media actions) rather than for the snapshot's lifetime, and the
 * learner route re-checks every request (licence expiry, approval) on its own.
 */
async function photoFiguresByConcept(snapshotId: string, day: string): Promise<Map<string, PhotoFigure[]>> {
  "use cache";
  cacheTag(KNOWLEDGE_CACHE_TAG, snapshotCacheTag(snapshotId), MEDIA_FIGURES_CACHE_TAG);
  cacheLife("hours");
  const view = await viewFor(snapshotId);
  const links = await listLearnerPhotoLinks(getPool(), day);
  const byConcept = new Map<string, PhotoFigure[]>();
  for (const conceptId of new Set(links.map((l) => l.conceptId))) {
    const concept = view.getConcept(conceptId);
    if (!concept) continue;
    const photos = photoFiguresOf({ id: concept.id, claimCount: concept.claims.length, verificationState: concept.verificationState }, links);
    if (photos.length > 0) byConcept.set(concept.id, photos);
  }
  return byConcept;
}

function diagramScope(view: KnowledgeView, opts: FigureOptions): DiagramScope {
  const traditionSlugs = opts.traditionSlugs ? [...opts.traditionSlugs] : view.listTraditions().map((t) => t.slug);
  const study = traditionSlugs.filter((s) => (STUDY_TRADITION_SLUGS as readonly string[]).includes(s));
  return { traditionSlugs, balanceSlugs: study.length > 0 ? study : traditionSlugs };
}

/**
 * Every concept's figures in scope, by concept id (the 3D payload reads this once; the 2D concept
 * page reads one entry through `getConceptFigures`). Graph-derived diagrams are balanced across the
 * study traditions; at most one figure per concept. Study photographs (DR-020) join through the
 * same `resolveConceptFigures`: only while the protocol shows them (`photos`), only for concepts in
 * scope, and only once the anchor claim is verified and the learner route would serve the file.
 */
export async function getFiguresByConcept(snapshotId: string, opts: FigureOptions): Promise<Record<string, KnowledgeFigureData[]>> {
  "use cache";
  const photosOn = opts.photos ?? PHOTOS_BY_DEFAULT;
  // An explicit outer lifetime wins over nested ones (Next cacheLife, "Nested caching behavior"),
  // so with photographs on this entry lives as long as the photo list (an hour), else forever.
  cacheTag(KNOWLEDGE_CACHE_TAG, snapshotCacheTag(snapshotId), MEDIA_FIGURES_CACHE_TAG);
  cacheLife(photosOn ? "hours" : "max");
  const view = await viewFor(snapshotId);
  const scope = diagramScope(view, opts);
  const diagrams = diagramFiguresByConcept(view, scope);
  // The request day in UTC, as the learner route judges licences (the entry is at most an hour old).
  const photos = photosOn ? await photoFiguresByConcept(snapshotId, new Date().toISOString().slice(0, 10)) : new Map<string, PhotoFigure[]>();
  const inScope = new Set(scope.traditionSlugs);
  const out: Record<string, KnowledgeFigureData[]> = {};
  for (const conceptId of new Set([...diagrams.keys(), ...photos.keys()])) {
    const slug = view.getConcept(conceptId)?.tradition?.slug;
    if (!diagrams.has(conceptId) && (!slug || !inScope.has(slug))) continue;
    const figures = resolveConceptFigures({ diagrams: diagrams.get(conceptId) ?? [], photos: photos.get(conceptId) ?? [], structureDiagrams: opts.structureDiagrams, photosOn });
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
