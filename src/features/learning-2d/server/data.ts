/**
 * Data for the 2D pages. Reads ONLY the learning context (src/server/learning/context.ts) and
 * the snapshot read model (src/server/knowledge/read-model.ts) by `ctx.snapshotId`; no other
 * data access. Every concept is checked against the study's scope (../scope.ts), so a page
 * never shows or links a concept the 3D museum of the same study would not contain.
 *
 * Traditions are always returned in the canonical order (alphabetical by display name, DESIGN.md
 * 12.3 rule 12, DR-019), the order the museum's wings follow too.
 *
 * Call inside <Suspense> (the context reads cookies).
 */
import "server-only";

import type {
  ComparisonView,
  ConceptDetail,
  ConceptRef,
  KnowledgeFigureData,
  ProcessChain,
  ProcessSequence,
  RelatedConceptGroups,
  TraditionDetail,
  TraditionSummary,
} from "@/features/knowledge/read/view";
import { inCanonicalOrder, type KnowledgeLayerId } from "@/features/learning/labels";
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";
import { KNOWLEDGE_CATEGORY_CODES } from "@/lib/validation/enums";
import { figureOptionsOf, getComparisons, getConcept, getConceptFigures, getProcessChain, getRelatedConcepts, getTradition, listTraditions, search } from "@/server/knowledge/read-model";
import { getLearningContext, LearningContextUnavailableError, type LearningContext } from "@/server/learning/context";

import {
  byCanonicalTradition,
  conceptLayers,
  pagerFor,
  parentOf,
  sectionConcepts,
  sequenceOf,
  SHARED_SECTIONS,
  sharedSequenceOf,
  type Pager,
  type ParentLink,
  type RailEntry,
  type StudyBarIndex,
} from "../navigation";
import { EPISTEMIC_SECTIONS } from "../template";
import { createScopeChecker, filterAccessible, type ScopeChecker } from "../scope";

export type ContextResult = { ok: true; ctx: LearningContext } | { ok: false; reason: LearningContextUnavailableError["reason"] };

/** The 2D learning context, or the reason there is no content to show. Redirects (throws) when access is refused. */
export async function learning2dContext(): Promise<ContextResult> {
  try {
    return { ok: true, ctx: await getLearningContext("2d") };
  } catch (e) {
    if (e instanceof LearningContextUnavailableError) return { ok: false, reason: e.reason };
    throw e;
  }
}

export function scopeOf(ctx: LearningContext): ScopeChecker {
  return createScopeChecker(ctx.traditionSlugs, {
    comparesOf: async (id) => (await getConcept(ctx.snapshotId, id))?.compares ?? [],
    neighboursOf: async (id) => ((await getRelatedConcepts(ctx.snapshotId, id)) ?? []).flatMap((g) => g.relations.map((r) => r.concept)),
  }, ctx.scope);
}

const allConcepts = (t: TraditionDetail): ConceptRef[] => Object.values(t.conceptsByType).flatMap((x) => x ?? []);

/** The study's traditions, in the canonical order. */
async function studyTraditions(ctx: LearningContext): Promise<TraditionDetail[]> {
  const allowed = new Set(ctx.traditionSlugs);
  const summaries = inCanonicalOrder((await listTraditions(ctx.snapshotId)).filter((t) => allowed.has(t.slug)));
  const details = await Promise.all(summaries.map((t) => getTradition(ctx.snapshotId, t.slug)));
  return details.filter((t): t is TraditionDetail => !!t);
}

/** Figure options of the learning context: `figureOptionsOf`, the one helper the 3D payload uses too (DR-018, DR-020, parity check P14). */
const figureOptions = (ctx: LearningContext) => figureOptionsOf(ctx);

/** Comparisons whose comparison concept is in scope; compared concepts reduced to the in-scope ones, in the canonical order. */
async function scopedComparisons(ctx: LearningContext, scope: ScopeChecker, traditionSlug?: string): Promise<ComparisonView[]> {
  const views = await filterAccessible(scope, await getComparisons(ctx.snapshotId, traditionSlug ? { traditionSlug } : {}), (v) => v.concept);
  return Promise.all(
    views.map(async (v) => ({
      ...v,
      compares: byCanonicalTradition(await filterAccessible(scope, v.compares, (c) => c), (c) => c.traditionSlug),
      links: await filterAccessible(scope, v.links, (l) => [l.a, l.b]),
    })),
  );
}

export interface CatalogueData {
  traditions: TraditionSummary[];
  categories: { code: KnowledgeCategoryCode; count: number }[];
  comparisonCount: number;
}

export async function loadCatalogue(ctx: LearningContext): Promise<CatalogueData> {
  const scope = scopeOf(ctx);
  const traditions = await studyTraditions(ctx);
  const comparisons = await scopedComparisons(ctx, scope);
  const counts = new Map<KnowledgeCategoryCode, number>();
  const seen = new Set<string>();
  for (const c of [...traditions.flatMap(allConcepts), ...comparisons.map((v) => v.concept)]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  }
  return {
    traditions,
    categories: KNOWLEDGE_CATEGORY_CODES.filter((code) => counts.has(code)).map((code) => ({ code, count: counts.get(code)! })),
    comparisonCount: comparisons.length,
  };
}

export interface TraditionPageData {
  tradition: TraditionDetail;
  overview: ConceptDetail | null;
  /** Figures of the overview concept, resolved as for every concept view. */
  overviewFigures: KnowledgeFigureData[];
  chain: ProcessChain | null;
  comparisons: ComparisonView[];
}

export async function loadTradition(ctx: LearningContext, slug: string): Promise<TraditionPageData | null> {
  if (!ctx.traditionSlugs.includes(slug)) return null;
  const tradition = await getTradition(ctx.snapshotId, slug);
  if (!tradition) return null;
  const scope = scopeOf(ctx);
  const [overview, overviewFigures, chain, comparisons] = await Promise.all([
    tradition.overviewConcept ? getConcept(ctx.snapshotId, tradition.overviewConcept.id) : Promise.resolve(null),
    tradition.overviewConcept ? getConceptFigures(ctx.snapshotId, tradition.overviewConcept.id, figureOptions(ctx)) : Promise.resolve([]),
    getProcessChain(ctx.snapshotId, slug),
    scopedComparisons(ctx, scope, slug),
  ]);
  return { tradition, overview, overviewFigures, chain, comparisons };
}

/** A concept shown under one of the page's layers, with what its view needs (as the 3D panel's `shown`). */
export interface LayerEntryData {
  concept: ConceptDetail;
  figures: KnowledgeFigureData[];
  /** Its related concepts, reduced to the study scope (Related Concepts follows the concept shown). */
  related: RelatedConceptGroups;
  /** Its comparison blocks, when it is a comparison concept. */
  comparison: ComparisonView | null;
  /** The relationship attaching it to the page's concept (null for the concept itself). */
  relationshipId: string | null;
}

export interface ConceptPageData {
  concept: ConceptDetail;
  /** The concept's figures (graph-derived diagrams now, photographs later), exactly as the 3D panel gets them. */
  figures: KnowledgeFigureData[];
  related: RelatedConceptGroups;
  tradition: TraditionDetail | null;
  pager: Pager | null;
  comparison: ComparisonView | null;
  /**
   * The concept's knowledge layers for the shared LayerTabs (DR-021): the same layers, concepts and
   * order as the 3D information panel for this concept (`conceptLayers`).
   */
  layers: { id: KnowledgeLayerId; entries: LayerEntryData[] }[];
  /** The ordered sequence the concept is a station of (the Process layer lists it), or null. */
  sequence: ProcessSequence | null;
  /** Names of the study's traditions by slug (labels for cross-tradition links). */
  traditionNames: Record<string, string>;
  /** The study's traditions in the canonical order (a comparison lists every one of them). */
  traditions: { slug: string; name: string }[];
  /** Where the sheet's Close leads; null for a shared concept that belongs to no tradition section. */
  parent: ParentLink | null;
}

/** Related concepts of a concept, reduced to the study scope. */
async function scopedRelated(ctx: LearningContext, scope: ScopeChecker, conceptId: string): Promise<RelatedConceptGroups> {
  const groups = await getRelatedConcepts(ctx.snapshotId, conceptId);
  return (await Promise.all((groups ?? []).map(async (g) => ({ semantics: g.semantics, relations: await filterAccessible(scope, g.relations, (r) => r.concept) })))).filter(
    (g) => g.relations.length > 0,
  );
}

export async function loadConcept(ctx: LearningContext, keyOrSlug: string): Promise<ConceptPageData | null> {
  const concept = await getConcept(ctx.snapshotId, keyOrSlug);
  if (!concept) return null;
  const scope = scopeOf(ctx);
  if (!(await scope.isAccessible(concept))) return null;
  const [related, tradition, chain, summaries, figures] = await Promise.all([
    scopedRelated(ctx, scope, concept.id),
    concept.traditionSlug ? getTradition(ctx.snapshotId, concept.traditionSlug) : Promise.resolve(null),
    concept.traditionSlug ? getProcessChain(ctx.snapshotId, concept.traditionSlug) : Promise.resolve(null),
    listTraditions(ctx.snapshotId),
    getConceptFigures(ctx.snapshotId, concept.id, figureOptions(ctx)),
  ]);
  const comparisons = new Map<string, ComparisonView>();
  const comparisonOf = async (c: ConceptRef) => {
    if (c.type !== "comparison") return null;
    if (comparisons.size === 0) for (const v of await scopedComparisons(ctx, scope)) comparisons.set(v.concept.id, v);
    return comparisons.get(c.id) ?? null;
  };
  const comparison = await comparisonOf(concept);
  // A sequence of the tradition's chain, else (for a shared concept) a shared ordered sequence.
  const shared = !sequenceOf(chain, concept.id) && !concept.traditionSlug ? await sharedSequenceOf(concept, (id) => scopedRelated(ctx, scope, id)) : null;
  const sequence = sequenceOf(chain, concept.id) ?? shared;

  const plan = conceptLayers({ concept, related, comparison, inSequence: sequence !== null });
  const own: LayerEntryData = { concept, figures, related, comparison, relationshipId: null };
  const others = new Map<string, Promise<Omit<LayerEntryData, "relationshipId"> | null>>();
  const entryOf = (id: string) => {
    let p = others.get(id);
    if (!p) {
      p = (async () => {
        const detail = await getConcept(ctx.snapshotId, id);
        if (!detail) return null;
        const [f, r, c] = await Promise.all([getConceptFigures(ctx.snapshotId, id, figureOptions(ctx)), scopedRelated(ctx, scope, id), comparisonOf(detail)]);
        return { concept: detail, figures: f, related: r, comparison: c };
      })();
      others.set(id, p);
    }
    return p;
  };
  const layers = await Promise.all(
    plan.map(async (l) => ({
      id: l.id,
      entries: (
        await Promise.all(
          l.entries.map(async (e) => {
            if (e.concept.id === concept.id) return own;
            const d = await entryOf(e.concept.id);
            return d ? { ...d, relationshipId: e.relationshipId } : null;
          }),
        )
      ).filter((e): e is LayerEntryData => e !== null),
    })),
  );

  const inScope = inCanonicalOrder(summaries.filter((t) => scope.traditionSlugs.has(t.slug)));
  return {
    concept,
    figures,
    related,
    tradition,
    pager: pagerFor(concept, chain, shared),
    comparison,
    layers: layers.filter((l) => l.entries.length > 0),
    sequence,
    traditionNames: Object.fromEntries(inScope.map((t) => [t.slug, t.name])),
    traditions: inScope.map((t) => ({ slug: t.slug, name: t.name })),
    parent: parentOf(concept, tradition),
  };
}

export interface CategoryPageData {
  code: KnowledgeCategoryCode;
  groups: { tradition: TraditionSummary | null; concepts: ConceptRef[] }[];
}

export async function loadCategory(ctx: LearningContext, code: KnowledgeCategoryCode): Promise<CategoryPageData> {
  const scope = scopeOf(ctx);
  const traditions = await studyTraditions(ctx);
  const groups: CategoryPageData["groups"] = traditions
    .map((t) => ({ tradition: t as TraditionSummary, concepts: allConcepts(t).filter((c) => c.category === code) }))
    .filter((g) => g.concepts.length > 0);
  const shared = (await scopedComparisons(ctx, scope)).map((v) => v.concept).filter((c) => c.traditionSlug === null && c.category === code);
  if (shared.length > 0) groups.push({ tradition: null, concepts: shared });
  return { code, groups };
}

export interface ComparisonsPageData {
  views: ComparisonView[];
  /** The study's traditions in the canonical order: every comparison block lists each of them. */
  traditions: { slug: string; name: string }[];
  /** Each compared concept's claims and figures, by id (shown per aspect through ClaimList, 11.5). */
  compared: Record<string, { concept: ConceptDetail; figures: KnowledgeFigureData[] }>;
}

export async function loadComparisons(ctx: LearningContext): Promise<ComparisonsPageData> {
  const [views, traditions] = await Promise.all([scopedComparisons(ctx, scopeOf(ctx)), studyTraditions(ctx)]);
  const ids = [...new Set(views.flatMap((v) => v.compares.map((c) => c.id)))];
  const loaded = await Promise.all(
    ids.map(async (id) => {
      const [concept, figures] = await Promise.all([getConcept(ctx.snapshotId, id), getConceptFigures(ctx.snapshotId, id, figureOptions(ctx))]);
      return concept ? ([id, { concept, figures }] as const) : null;
    }),
  );
  return {
    views,
    traditions: traditions.map((t) => ({ slug: t.slug, name: t.name })),
    compared: Object.fromEntries(loaded.filter((x) => x !== null)),
  };
}

export interface SearchPageData {
  query: string;
  hits: ConceptRef[];
}

/** Null when the study disables search (then the search page does not exist). */
export async function runSearch(ctx: LearningContext, query: string): Promise<SearchPageData | null> {
  if (!ctx.features.search) return null;
  const q = query.trim();
  if (q.length < 2) return { query: q, hits: [] };
  const result = await search(ctx.snapshotId, q, { enabled: ctx.features.search });
  if (!result.enabled) return null;
  const hits = await filterAccessible(scopeOf(ctx), result.hits, (h) => h.concept);
  // Grouped by tradition in the canonical order, as on the index and the comparisons page; the
  // search ranking is kept within each tradition.
  return { query: result.query, hits: byCanonicalTradition(hits.map((h) => h.concept), (c) => c.traditionSlug) };
}

/**
 * What the StudyBar needs to name the current page and its parent from the URL alone, so its
 * location text is right on the first paint (the bar is rendered by the layout, which does not
 * see the page's data): the study's traditions, and every in-scope tradition concept and
 * comparison by slug with its title and parent. A shared concept reached through a link names
 * itself from its page (`StudyBarLocation`).
 */
export async function loadStudyBarIndex(ctx: LearningContext): Promise<StudyBarIndex> {
  const [traditions, comparisons] = await Promise.all([studyTraditions(ctx), scopedComparisons(ctx, scopeOf(ctx))]);
  const parents: ParentLink[] = [];
  const parentIndex = new Map<string, number>();
  const indexOf = (p: ParentLink | null) => {
    if (!p) return -1;
    const key = `${p.href}|${p.label}`;
    let i = parentIndex.get(key);
    if (i === undefined) {
      i = parents.push(p) - 1;
      parentIndex.set(key, i);
    }
    return i;
  };
  const concepts: StudyBarIndex["concepts"] = {};
  for (const t of traditions) {
    for (const c of allConcepts(t)) concepts[c.slug] = [c.title, indexOf(parentOf(c, t))];
  }
  for (const v of comparisons) concepts[v.concept.slug] = [v.concept.title, indexOf(parentOf(v.concept, null))];

  // The rail and index rows (DR-021): each section's concepts in the tradition page's order (the
  // process in sequence order), with the step of every station of an ordered sequence.
  const chains = await Promise.all(traditions.map((t) => getProcessChain(ctx.snapshotId, t.slug)));
  const sections: NonNullable<StudyBarIndex["sections"]> = {};
  traditions.forEach((t, i) => {
    const chain = chains[i] ?? null;
    const entry = (c: ConceptRef): RailEntry => {
      const seq = sequenceOf(chain, c.id);
      const at = seq ? seq.steps.findIndex((x) => x.id === c.id) : -1;
      return { slug: c.slug, key: c.key, title: c.title, type: c.type, step: seq && at >= 0 ? [at + 1, seq.steps.length] : null };
    };
    const own: NonNullable<StudyBarIndex["sections"]>[string] = {};
    for (const section of EPISTEMIC_SECTIONS) {
      let list = sectionConcepts(t, section);
      if (section.id === "process" && chain) {
        const ordered = chain.steps.filter((s) => list.some((c) => c.id === s.id));
        list = [...ordered, ...list.filter((c) => !ordered.some((s) => s.id === c.id))];
      }
      if (section.id === "comparisons") {
        const scoped = comparisons.filter((v) => v.compares.some((c) => c.traditionSlug === t.slug)).map((v) => v.concept);
        list = [...new Map([...list, ...scoped].map((c) => [c.id, c])).values()];
      }
      if (list.length > 0) own[section.id] = list.map(entry);
    }
    sections[t.slug] = own;
  });
  const shared = comparisons.map((v) => v.concept).filter((c) => c.traditionSlug === null);
  if (shared.length > 0) sections[SHARED_SECTIONS] = { comparisons: shared.map((c) => ({ slug: c.slug, key: c.key, title: c.title, type: c.type, step: null })) };

  return { traditions: traditions.map((t) => ({ slug: t.slug, name: t.name })), concepts, parents, sections };
}

export const isCategoryCode = (x: string): x is KnowledgeCategoryCode => (KNOWLEDGE_CATEGORY_CODES as readonly string[]).includes(x);
