/**
 * 2D navigation, pure and client-safe:
 *
 *  - Previous / next on 2D concept pages. Process stages follow the tradition's process order
 *    (getProcessChain: PRECEDES by ordinal), and the link carries the PRECEDES relationship id so
 *    the move is logged as a typed relationship traversal, as walking a sequence path is in 3D.
 *    Other concepts have no pager, as in the 3D panel (DR-021).
 *  - The parent of a concept page, for the StudyBar's "Up to <parent>" control (DESIGN.md 9.14,
 *    section 6: concept pages have no breadcrumb): the concept's section on its tradition page,
 *    or the comparisons page for a comparison.
 *  - The StudyBar location (the current page's title) from the URL, so the bar, rendered once by
 *    the layout, names the page on the first paint.
 */
import type { ComparisonView, ConceptRef, ProcessChain, ProcessSequence, RelatedConceptGroups, TraditionDetail } from "@/features/knowledge/read/view";
import { CATEGORY_LABELS, compareTraditionSlugs, exposureLayerOf, KNOWLEDGE_LAYERS, type KnowledgeLayerId } from "@/features/learning/labels";
import { sha256Hex } from "@/features/spatial/compiler/canonical";
import { titleCase } from "@/lib/text/title-case";
import { KNOWLEDGE_CATEGORY_CODES, type ConceptType, type KnowledgeCategoryCode } from "@/lib/validation/enums";

import { href2d, LEARN_2D } from "./routes";
import { EPISTEMIC_SECTIONS, sectionOfType, type EpistemicSection } from "./template";

export interface PagerLink {
  concept: ConceptRef;
  /** PRECEDES relationship followed by this move (process stages only). */
  relationshipId: string | null;
}

export interface Pager {
  /** Only a station of an ordered sequence has a pager (as in the 3D panel). */
  kind: "process";
  prev: PagerLink | null;
  next: PagerLink | null;
  /** 1-based position and total within the sequence. */
  index: number;
  total: number;
  section: EpistemicSection;
}

/** Concepts listed under a section of a tradition page, in display order. */
export function sectionConcepts(tradition: Pick<TraditionDetail, "conceptsByType">, section: EpistemicSection): ConceptRef[] {
  return (section.types as readonly ConceptType[]).flatMap((t) => tradition.conceptsByType[t] ?? []);
}

/**
 * The ordered sequence a concept is a station of: its tradition's process, or another ordered
 * PRECEDES sequence (e.g. a chronology), exactly the sequence paths the museum compiles (a
 * station shows "Step n of N", the Process layer and the sequence pager in both conditions).
 */
export function sequenceOf(chain: ProcessChain | null, conceptId: string): ProcessSequence | null {
  if (!chain) return null;
  return [chain, ...chain.otherSequences].find((s) => s.steps.length >= 2 && s.steps.some((x) => x.id === conceptId)) ?? null;
}

/**
 * The ordered PRECEDES sequence through a concept that belongs to no tradition chain (e.g. two
 * shared scientific mechanisms in order), walked over the related-concept lookup. The museum makes
 * such a sequence a path too, so its concepts are stations in both conditions. Steps follow the
 * ordinals (as the read model orders a tradition's sequences); null without ordinalled links.
 */
export async function sharedSequenceOf(concept: ConceptRef, relatedOf: (conceptId: string) => Promise<RelatedConceptGroups | null>): Promise<ProcessSequence | null> {
  const edges = new Map<string, { relationshipId: string; from: ConceptRef; to: ConceptRef; ordinal: number }>();
  const seen = new Set([concept.id]);
  let frontier = [concept];
  while (frontier.length > 0) {
    const next: ConceptRef[] = [];
    for (const c of frontier) {
      for (const r of ((await relatedOf(c.id)) ?? []).flatMap((g) => g.relations)) {
        if (r.type !== "PRECEDES" || r.ordinal === null || r.direction === "undirected") continue;
        const [from, to] = r.direction === "outgoing" ? [c, r.concept] : [r.concept, c];
        edges.set(r.relationshipId, { relationshipId: r.relationshipId, from, to, ordinal: r.ordinal });
        if (!seen.has(r.concept.id)) {
          seen.add(r.concept.id);
          next.push(r.concept);
        }
      }
    }
    frontier = next;
  }
  const ordered = [...edges.values()].sort((a, b) => a.ordinal - b.ordinal || (a.relationshipId < b.relationshipId ? -1 : 1));
  const steps: ConceptRef[] = [];
  let continuous = true;
  for (const e of ordered) {
    const last = steps[steps.length - 1];
    if (!last) steps.push(e.from);
    else if (last.id !== e.from.id) {
      continuous = false;
      if (!steps.some((x) => x.id === e.from.id)) steps.push(e.from);
    }
    if (!steps.some((x) => x.id === e.to.id)) steps.push(e.to);
  }
  if (steps.length < 2) return null;
  return {
    steps,
    links: ordered.map((e) => ({ relationshipId: e.relationshipId, from: e.from, to: e.to, ordinal: e.ordinal, explanation: null, conditions: null, evidence: [] })),
    continuous,
  };
}

export function processPager(chain: ProcessSequence, conceptId: string, section: EpistemicSection = EPISTEMIC_SECTIONS.find((s) => s.id === "process")!): Pager | null {
  const i = chain.steps.findIndex((s) => s.id === conceptId);
  if (i < 0) return null;
  const prev = chain.steps[i - 1];
  const next = chain.steps[i + 1];
  const linkBetween = (from: ConceptRef, to: ConceptRef) => chain.links.find((l) => l.from.id === from.id && l.to.id === to.id)?.relationshipId ?? null;
  return {
    kind: "process",
    prev: prev ? { concept: prev, relationshipId: linkBetween(prev, chain.steps[i]!) } : null,
    next: next ? { concept: next, relationshipId: linkBetween(chain.steps[i]!, next) } : null,
    index: i + 1,
    total: chain.steps.length,
    section,
  };
}

/**
 * The sequence pager of a station of an ordered sequence (the tradition's process, or another
 * ordered sequence), exactly where the 3D panel shows its sequence pager. A concept that is not a
 * station has NO pager in either condition (the panel renders a Pager only for sequence stops), so
 * the shared sheet has the same length, controls and tab sequence for it in both (DR-021).
 */
export function pagerFor(
  concept: ConceptRef,
  chain: ProcessChain | null,
  /** A sequence outside the tradition chain (`sharedSequenceOf`). */
  shared: ProcessSequence | null = null,
): Pager | null {
  const sequence = sequenceOf(chain, concept.id) ?? (shared?.steps.some((s) => s.id === concept.id) ? shared : null);
  if (!sequence) return null;
  return processPager(sequence, concept.id, sequence === chain ? undefined : sectionOfType(concept.type));
}

/**
 * Items in the canonical tradition order (alphabetical by display name, DESIGN.md 12.3 rule 12,
 * DR-019; slugs map to it through `compareTraditionSlugs`), tradition-less items last, stable
 * within a tradition (so a search ranking or a section order is kept).
 */
export function byCanonicalTradition<T>(items: readonly T[], slugOf: (item: T) => string | null): T[] {
  return items
    .map((item, i) => ({ item, i, slug: slugOf(item) }))
    .sort((a, b) => {
      if (a.slug === null || b.slug === null) return (a.slug === null ? 1 : 0) - (b.slug === null ? 1 : 0) || a.i - b.i;
      return compareTraditionSlugs(a.slug, b.slug) || a.i - b.i;
    })
    .map((x) => x.item);
}

// ---------------------------------------------------------------------------------------
// Knowledge layers of a concept (DESIGN.md 9.6, 9.11 item 3; DR-021)
// ---------------------------------------------------------------------------------------

/** A concept shown under a layer, with the relationship that attaches it (null for the concept itself). */
export interface LayerEntry {
  concept: ConceptRef;
  relationshipId: string | null;
}

export interface ConceptLayer {
  id: KnowledgeLayerId;
  entries: LayerEntry[];
}

/**
 * The layers of a concept for the shared LayerTabs, built from the read model with the SAME
 * mapping the 3D information panel applies to the compiled manifest (buildPanelModel over the
 * default rule set's progressive layers and compare hotspots), so a concept has the same tabs, in
 * the same order, in both conditions (tests/unit/learning-2d/layers.test.ts compares them for
 * every placed concept of the curated content):
 *  - overview: the concept itself;
 *  - artisan: concepts that PRACTITIONER_EXPLAINS it;
 *  - science: concepts it is SCIENTIFICALLY_EXPLAINED_BY;
 *  - an EXPLAINS explainer goes under artisan, process or science by its type (exposureLayerOf;
 *    anything else reads as science), as in 3D;
 *  - comparison: the concepts a comparison compares, and the cross-tradition SIMILAR_TO /
 *    CONTRASTS_WITH counterparts (both endpoints in two different study traditions);
 *  - process: the concept itself, when it is a station of an ordered sequence (the museum's
 *    sequence paths: the tradition's process, or another ordered PRECEDES sequence).
 * Entries keep the 3D order within a layer, the order of the manifest's element ids (a stable,
 * content-free order); the Compare layer then lists them in the canonical tradition order. `related` and `comparison` must already be reduced to the study scope.
 */
export function conceptLayers(input: {
  concept: ConceptRef;
  related: RelatedConceptGroups;
  comparison: Pick<ComparisonView, "compares"> | null;
  /** The concept is a station of an ordered sequence (its tradition's process, or another ordered PRECEDES sequence; `sequenceOf`). */
  inSequence: boolean;
}): ConceptLayer[] {
  const { concept } = input;
  const layers = new Map<KnowledgeLayerId, LayerEntry[]>(KNOWLEDGE_LAYERS.map((l) => [l.id, []]));
  const push = (layer: KnowledgeLayerId, entry: LayerEntry) => {
    const list = layers.get(layer)!;
    if (!list.some((e) => e.concept.id === entry.concept.id)) list.push(entry);
  };
  push("overview", { concept, relationshipId: null });

  // Attached layers, in the manifest's layer order: science, then practitioner, then explanation
  // layers, each by concept key.
  const attached: { layer: KnowledgeLayerId; entry: LayerEntry; order: string }[] = [];
  for (const r of input.related.flatMap((g) => g.relations)) {
    const entry = { concept: r.concept, relationshipId: r.relationshipId };
    if (r.type === "PRACTITIONER_EXPLAINS" && r.direction === "incoming") attached.push({ layer: "artisan", entry, order: `1:${r.concept.key}` });
    else if (r.type === "SCIENTIFICALLY_EXPLAINED_BY" && r.direction === "outgoing") attached.push({ layer: "science", entry, order: `0:${r.concept.key}` });
    else if (r.type === "EXPLAINS" && r.direction === "incoming") attached.push({ layer: explanationLayerOf(r.concept.type), entry, order: `2:${r.concept.key}` });
  }
  for (const a of attached.sort(byOrder)) push(a.layer, a.entry);

  // Compare: cross-tradition counterparts, then the compared concepts of a comparison, in the
  // manifest's hotspot order ("compare:<hash of relationship id>" before "compares:<hash of key>").
  const compare: { entry: LayerEntry; order: string }[] = [];
  for (const r of input.related.flatMap((g) => g.relations)) {
    if ((r.type === "SIMILAR_TO" || r.type === "CONTRASTS_WITH") && concept.traditionSlug && r.concept.traditionSlug && r.concept.traditionSlug !== concept.traditionSlug) {
      compare.push({ entry: { concept: r.concept, relationshipId: r.relationshipId }, order: `compare:${manifestHash(r.relationshipId)}` });
    }
  }
  for (const c of input.comparison?.compares ?? []) compare.push({ entry: { concept: c, relationshipId: null }, order: `compares:${manifestHash(c.key)}` });
  // Then the canonical tradition order, as on every list (DESIGN.md 12.3 rule 12, DR-019), stable
  // within a tradition. The 3D panel's chooser must apply the same sort (requested from WP3;
  // tests/unit/learning-2d/layers.test.ts tracks it).
  for (const c of byCanonicalTradition(compare.sort(byOrder), (x) => x.entry.concept.traditionSlug)) push("comparison", c.entry);

  if (input.inSequence) push("process", { concept, relationshipId: null });

  return KNOWLEDGE_LAYERS.map((l) => ({ id: l.id as KnowledgeLayerId, entries: layers.get(l.id)! })).filter((l) => l.entries.length > 0);
}

/** The 10-character hash the spatial compiler puts at the end of layer and hotspot element ids. */
const manifestHash = (value: string) => sha256Hex(value).slice(0, 10);
const byOrder = (a: { order: string }, b: { order: string }) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

/** The layer an EXPLAINS explainer is shown under (as the 3D panel: artisan or process by type, else science). */
function explanationLayerOf(type: ConceptType): KnowledgeLayerId {
  const l = exposureLayerOf(type);
  return l === "artisan" || l === "process" ? l : "science";
}

// ---------------------------------------------------------------------------------------
// Page titles and parents (StudyBar location and "Up to <parent>")
// ---------------------------------------------------------------------------------------

/** Titles of the 2D pages that are not a tradition or a concept (interface words). */
export const PAGE_TITLES = {
  catalogue: "Craft traditions",
  categories: "Knowledge categories",
  comparisons: "Comparisons",
  search: "Search",
  practice: "Practice page",
} as const;

/** Where "Up to <parent>" leads: a label (a page or section title) and the href. */
export interface ParentLink {
  label: string;
  href: string;
}

/**
 * The parent of a concept page: its section on its tradition page (the section disclosure opens
 * from the URL hash), or the comparisons page for a comparison. Null for a shared concept that
 * belongs to no tradition section.
 */
export function parentOf(concept: Pick<ConceptRef, "type" | "traditionSlug">, tradition: Pick<TraditionDetail, "slug"> | null): ParentLink | null {
  if (concept.type === "comparison" && !concept.traditionSlug) return { label: titleCase(PAGE_TITLES.comparisons), href: href2d.comparisons() };
  if (!tradition || concept.traditionSlug !== tradition.slug) return null;
  const section = sectionOfType(concept.type);
  return { label: titleCase(section.title), href: href2d.traditionSection(tradition.slug, section.id) };
}

/**
 * Built on the server by the layout (data.ts `loadStudyBarIndex`) and read by the StudyBar on the
 * client: the study's traditions (canonical order) for the Contents sheet, and the in-scope
 * concepts by slug as `[title, index into parents or -1]` (compact: it travels with the layout).
 */
export interface StudyBarIndex {
  traditions: { slug: string; name: string }[];
  concepts: Record<string, [title: string, parent: number]>;
  parents: ParentLink[];
}

export interface StudyBarPlace {
  /** The current page's title, as the StudyBar shows it (empty when unknown). */
  location: string;
  /** Concept pages: where "Up to <parent>" leads. */
  parent: ParentLink | null;
  /** The URL is a concept page (its title may come from the page itself). */
  conceptPage: boolean;
}

const segment = (s: string | undefined) => {
  if (!s) return "";
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** The StudyBar location and parent for a 2D pathname. */
export function studyBarPlace(pathname: string, index: StudyBarIndex): StudyBarPlace {
  const none: StudyBarPlace = { location: "", parent: null, conceptPage: false };
  if (pathname !== LEARN_2D && !pathname.startsWith(`${LEARN_2D}/`)) return none;
  const [kind, key] = pathname.slice(LEARN_2D.length).split("/").filter(Boolean);
  switch (kind) {
    case undefined:
      return { ...none, location: PAGE_TITLES.catalogue };
    case "traditions":
      return { ...none, location: index.traditions.find((t) => t.slug === segment(key))?.name ?? "" };
    case "concepts": {
      const entry = index.concepts[segment(key)];
      return { location: entry?.[0] ?? "", parent: entry && entry[1] >= 0 ? (index.parents[entry[1]] ?? null) : null, conceptPage: true };
    }
    case "categories": {
      const code = segment(key);
      if (!code) return { ...none, location: PAGE_TITLES.categories };
      return { ...none, location: (KNOWLEDGE_CATEGORY_CODES as readonly string[]).includes(code) ? CATEGORY_LABELS[code as KnowledgeCategoryCode] : "" };
    }
    case "comparisons":
      return { ...none, location: PAGE_TITLES.comparisons };
    case "search":
      return { ...none, location: PAGE_TITLES.search };
    case "practice":
      return { ...none, location: PAGE_TITLES.practice };
    default:
      return none;
  }
}
