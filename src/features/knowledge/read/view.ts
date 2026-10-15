/**
 * Knowledge read view: typed, pure queries over ONE immutable knowledge bundle (the
 * `content_snapshots.payload` contract, src/features/knowledge/contracts.ts).
 *
 * Both learning conditions read knowledge only through these shapes (server side via
 * src/server/knowledge/read-model.ts, which loads the bundle by snapshot id and caches the
 * results), so the 2D pages and the 3D museum present the same claims, sources and links.
 *
 * Pure TypeScript, no I/O: safe to unit-test and to import from client code for the types.
 * Nothing here invents text: every string comes from the bundle.
 */
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { balanceDiagramSets, buildStructureDiagrams, type StructureDiagram } from "@/features/knowledge/read/diagrams";
import {
  RELATIONSHIP_SEMANTICS,
  type ConceptType,
  type KnowledgeCategoryCode,
  type ProvenanceKind,
  type RelationshipSemantics,
  type SourceReliability,
  type VerificationState,
} from "@/lib/validation/enums";

type BundleTradition = KnowledgeBundle["traditions"][number];
type BundleConcept = KnowledgeBundle["concepts"][number];
type BundleRelationship = KnowledgeBundle["relationships"][number];
type BundleSource = KnowledgeBundle["sources"][number];
type BundleType = KnowledgeBundle["relationshipTypes"][number];

/** Header facts about the snapshot every page should be able to show. */
export interface SnapshotInfo {
  versionLabel: string;
  isDemo: boolean;
  /** True for review snapshots: the content is NOT curator-verified and must be labelled so. */
  includesUnverified: boolean;
  generatedAt: string;
  counts: { traditions: number; concepts: number; relationships: number; sources: number };
}

export interface SourceView {
  id: string;
  /**
   * Human-readable short label for buttons and lists ("<author> <year>", else "<publisher> <year>",
   * else the shortened title). Derived from the bundle fields, so older bundles get it too; never
   * show the uuid `id` to learners.
   */
  label: string;
  kind: ProvenanceKind;
  title: string;
  author: string | null;
  publisher: string | null;
  year: number | null;
  url: string | null;
  accessedOn: string | null;
  reliability: SourceReliability | null;
  verificationState: VerificationState;
}

/** A located verbatim passage from a cited source that supports the claim. */
export interface EvidencePassage {
  locator: string;
  quote: string;
  /** What a curator must check by hand (e.g. a passage whose extracted text was corrupted). */
  note: string | null;
}

/** A cited source with the citation's own locator/quote and its supporting passages. */
export interface Citation extends SourceView {
  locator: string | null;
  quote: string | null;
  passages: EvidencePassage[];
}

export interface ConceptRef {
  id: string;
  key: string;
  slug: string;
  type: ConceptType;
  category: KnowledgeCategoryCode;
  title: string;
  summary: string;
  traditionId: string | null;
  traditionSlug: string | null;
  verificationState: VerificationState;
}

export interface TraditionSummary {
  id: string;
  slug: string;
  name: string;
  altNames: string[];
  summary: string | null;
  region: BundleTradition["region"];
  verificationState: VerificationState;
  conceptCount: number;
}

export interface TraditionDetail extends TraditionSummary {
  gi: { registered: boolean | null; applicationNo: string | null; year: number | null; sources: SourceView[] } | null;
  /** The tradition's own `tradition` concept (its sourced overview), if present. */
  overviewConcept: ConceptRef | null;
  /** Every concept of the tradition grouped by concept type (types with no concepts omitted). */
  conceptsByType: Partial<Record<ConceptType, ConceptRef[]>>;
}

export interface ClaimView {
  id: string;
  /** 0-based authored position. */
  position: number;
  text: string;
  quote: string | null;
  /** Resolved sources cited by this claim (the evidence). */
  evidence: Citation[];
}

export interface ConceptDetail extends ConceptRef {
  bodyMd: string | null;
  body: BundleConcept["body"];
  localTerms: string[];
  provenanceKind: ProvenanceKind;
  compares: ConceptRef[];
  tradition: { id: string; slug: string; name: string } | null;
  claims: ClaimView[];
  /** Distinct sources cited by any claim, in first-citation order. */
  sources: SourceView[];
  /** Evidence profile: how many claims rest on each provenance kind / reliability. */
  evidenceSummary: {
    claims: number;
    sourcedClaims: number;
    byProvenance: Partial<Record<ProvenanceKind, number>>;
    byReliability: Partial<Record<SourceReliability | "unknown", number>>;
  };
  assetIds: string[];
}

export type RelationDirection = "outgoing" | "incoming" | "undirected";

export interface RelatedConcept {
  relationshipId: string;
  type: string;
  semantics: RelationshipSemantics;
  direction: RelationDirection;
  /** Reading from the current concept: the type label (outgoing/undirected) or inverse label (incoming). */
  label: string;
  concept: ConceptRef;
  explanation: string | null;
  conditions: string | null;
  ordinal: number | null;
  strength: number | null;
  provenanceKind: ProvenanceKind;
  verificationState: VerificationState;
  evidence: Citation[];
}

/** Related concepts grouped by semantics class, in RELATIONSHIP_SEMANTICS order. */
export type RelatedConceptGroups = { semantics: RelationshipSemantics; relations: RelatedConcept[] }[];

export interface ProcessLink {
  relationshipId: string;
  from: ConceptRef;
  to: ConceptRef;
  ordinal: number | null;
  explanation: string | null;
  conditions: string | null;
  evidence: Citation[];
}

export interface ProcessSequence {
  /** Concepts in sequence order, following PRECEDES edges by ascending ordinal. */
  steps: ConceptRef[];
  /** The ordinalled PRECEDES edges of this sequence, ascending. */
  links: ProcessLink[];
  /** True when every edge starts where the previous one ended. */
  continuous: boolean;
}

export interface ProcessChain extends ProcessSequence {
  traditionSlug: string;
  /**
   * `steps`/`links` are the PROCESS: ordinalled PRECEDES edges between two process_stage
   * concepts of the tradition. Other ordinalled PRECEDES sequences (e.g. a two-step historical
   * chronology between historical_context concepts) are listed here, one per connected sequence.
   */
  otherSequences: ProcessSequence[];
  /** PRECEDES edges without an ordinal (marked repeat loops and the like); not part of any sequence. */
  unorderedLinks: ProcessLink[];
}

export interface ComparisonView {
  concept: ConceptRef;
  compares: ConceptRef[];
  claims: ClaimView[];
  /** SIMILAR_TO / CONTRASTS_WITH links touching the comparison or the compared concepts across traditions. */
  links: { relationshipId: string; type: string; a: ConceptRef; b: ConceptRef; explanation: string | null; evidence: Citation[] }[];
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Display label of a source (see SourceView.label). Uses only fields present in the bundle. Long
 * names are cut at a word boundary (DESIGN.md 9.8: never mid-word), which fixes the 2D and 3D
 * "Stated by" lines together.
 */
export function sourceDisplayLabel(s: { author: string | null; publisher: string | null; year: number | null; title: string }): string {
  const who = s.author?.trim() || s.publisher?.trim() || null;
  const year = s.year != null ? String(s.year) : null;
  if (who) return year ? `${wordCut(who, 48)} ${year}` : wordCut(who, 48);
  return year ? `${wordCut(s.title, 56)} (${year})` : wordCut(s.title, 64);
}

/**
 * Binds a locator's abbreviation to what follows with no-break spaces, so "PDF p. 4" never breaks
 * between "PDF" and "p." or between "p." and "4"; the source line wraps only between its parts.
 */
function bindLocator(locator: string): string {
  return locator
    .replace(/\b(PDF)\s+(?=pp?\.)/g, "$1 ")
    .replace(/(\b(?:pp?|figs?|nos?|vols?|ch|chap|paras?|sec|cols?|ll?|art|pl)\.|§)\s+(?=[\dIVXLCivxlc])/g, "$1 ");
}

/** Cuts `text` to at most `max` characters at a word boundary (never mid-word), adding "…". */
function wordCut(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 3 ? cut.slice(0, at) : cut).replace(/[\s,;:·–—-]+$/u, "")}…`;
}

/** First author (or publisher) as a short name: no parenthetical, first of several, "Surname, Given" -> "Surname". */
function shortName(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.replace(/\([^)]*\)/g, " ").split(";")[0]!.split(/\s[—–]\s/)[0]!.replace(/\s+/g, " ").trim();
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) s = parts[0]!;
  s = s.replace(/[\s,;:]+$/u, "");
  return s ? wordCut(s, 48) : null;
}

/**
 * The short label of a citation under its claim (DESIGN.md 9.8): first author or publisher short
 * name, year, then the citation's own locator, e.g. "Victoria and Albert Museum, 2007 · p. 2".
 * Derived here from the bundle fields, never hand-written into content/. Every part is cut only
 * at a word boundary, so the label wraps to at most two lines at the claim measure and is never
 * truncated mid-word.
 */
export function shortCitationLabel(c: { author: string | null; publisher: string | null; year: number | null; title: string; locator?: string | null }): string {
  const who = shortName(c.author) ?? shortName(c.publisher) ?? wordCut(c.title, 56);
  const year = c.year != null && c.year > 0 ? String(c.year) : null;
  const head = year ? `${who}, ${year}` : who;
  const locator = c.locator?.trim() ? bindLocator(wordCut(c.locator, 48)) : null;
  return locator ? `${head} · ${locator}` : head;
}

// ---------------------------------------------------------------------------------------
// Knowledge figures (DESIGN.md 9.9; DR-018)
// ---------------------------------------------------------------------------------------

interface FigureBase {
  /** Stable id (the diagram id, or the asset id). */
  id: string;
  /** Concept the figure belongs to. */
  conceptId: string;
  /** Zero-based index of the anchor claim; the figure renders right after it. */
  anchorClaimIndex: number;
  /** Caption without the "Fig. n" prefix. Restates or points to the anchor claim; adds nothing. */
  caption: string;
  /** Text equivalent; never repeats the caption. */
  alt: string;
}

/** A diagram generated from the knowledge graph (DR-018, "now"). */
export interface DiagramFigure extends FigureBase {
  kind: "diagram";
  credit: string;
  diagram: StructureDiagram;
}

/** A rights-cleared photograph (DR-018, "later"), served by the learner figure route. */
export interface PhotoFigure extends FigureBase {
  kind: "photo";
  src: string;
  width: number;
  height: number;
  /** e.g. "Name, Institution". */
  credit: string;
  licence: string;
  licenceUrl: string | null;
}

export type KnowledgeFigureData = DiagramFigure | PhotoFigure;

/** One approved illustration link of a concept, as the read model loads it (role `illustration`). */
export interface IllustrationLink {
  assetId: string;
  conceptId: string;
  role: string;
  /** asset_links.position: the zero-based index of the anchor claim. */
  position: number;
  src: string;
  width: number;
  height: number;
  altText: string;
  caption: string;
  credit: string;
  licence: string;
  licenceUrl: string | null;
}

/** Photo figures of a concept: illustration links only, anchored to an existing claim, by position. */
export function photoFiguresOf(conceptId: string, claimCount: number, links: readonly IllustrationLink[]): PhotoFigure[] {
  return links
    .filter((l) => l.conceptId === conceptId && l.role === "illustration" && Number.isInteger(l.position) && l.position >= 0 && l.position < claimCount)
    .sort((a, b) => a.position - b.position || byString(a.assetId, b.assetId))
    .map((l) => ({
      kind: "photo" as const,
      id: l.assetId,
      conceptId,
      anchorClaimIndex: l.position,
      caption: l.caption,
      alt: l.altText,
      src: l.src,
      width: l.width,
      height: l.height,
      credit: l.credit,
      licence: l.licence,
      licenceUrl: l.licenceUrl,
    }));
}

/** Credit line of every graph-derived diagram (DESIGN.md 9.9). */
export function diagramCredit(snapshotLabel: string): string {
  return `Diagram generated from the project's knowledge graph (snapshot ${snapshotLabel})`;
}

/** The figure of a diagram, attached to its anchor concept and claim. */
export function diagramFigureOf(d: StructureDiagram, credit: string): DiagramFigure {
  return { kind: "diagram", id: d.id, conceptId: d.anchor.conceptId, anchorClaimIndex: d.anchor.claimIndex, caption: d.caption, alt: d.alt, credit, diagram: d };
}

/**
 * The figures of one concept view (12.3 rule 9: at most ONE figure per concept). The structure
 * diagram, when the protocol shows them, is balanced by construction and takes the slot; a
 * photograph is used otherwise. Both conditions call this with the same arguments.
 */
export function resolveConceptFigures(input: { diagrams: readonly DiagramFigure[]; photos: readonly PhotoFigure[]; structureDiagrams: boolean }): KnowledgeFigureData[] {
  const diagram = input.structureDiagrams ? input.diagrams[0] : undefined;
  if (diagram) return [diagram];
  const photo = input.photos[0];
  return photo ? [photo] : [];
}

export interface DiagramScope {
  /** Traditions in scope (the study's traditions; every tradition outside a study). */
  traditionSlugs: readonly string[];
  /** Traditions whose diagram types must be equal (the study traditions in scope, else all in scope). */
  balanceSlugs: readonly string[];
}

/**
 * Every balanced structure-diagram figure in scope, by concept id. A diagram type is kept for a
 * tradition only when every tradition in `balanceSlugs` has that type (k(section) = the minimum),
 * so the study traditions get the same types in the same sections.
 */
export function diagramFiguresByConcept(view: Pick<KnowledgeView, "info" | "structureDiagrams">, scope: DiagramScope): Map<string, DiagramFigure[]> {
  const credit = diagramCredit(view.info().versionLabel);
  const slugs = [...new Set([...scope.traditionSlugs, ...scope.balanceSlugs])];
  const all = new Map(slugs.map((slug) => [slug, view.structureDiagrams(slug)]));
  const balanced = balanceDiagramSets(all, scope.balanceSlugs);
  const allowed = new Set([...balanced.values()].flat().map((d) => d.type));
  const byConcept = new Map<string, DiagramFigure[]>();
  for (const slug of scope.traditionSlugs) {
    for (const d of all.get(slug) ?? []) {
      if (!allowed.has(d.type)) continue;
      const f = diagramFigureOf(d, credit);
      byConcept.set(f.conceptId, [...(byConcept.get(f.conceptId) ?? []), f]);
    }
  }
  return byConcept;
}

export interface KnowledgeView {
  info(): SnapshotInfo;
  listTraditions(): TraditionSummary[];
  getTradition(slug: string): TraditionDetail | null;
  /** By concept key, slug or id. */
  getConcept(keyOrSlugOrId: string): ConceptDetail | null;
  getProcessChain(traditionSlug: string): ProcessChain | null;
  getRelatedConcepts(keyOrSlugOrId: string): RelatedConceptGroups | null;
  getComparisons(opts?: { traditionSlug?: string }): ComparisonView[];
  /** Concept refs by id (search hits, telemetry, manifest elements). */
  conceptRefsById(ids: readonly string[]): ConceptRef[];
  /** The graph-derived structure diagrams of a tradition (DR-018), before balancing. */
  structureDiagrams(traditionSlug: string): StructureDiagram[];
}

/** Builds the indexes once; every query is then a map lookup or a small scan. */
export function createKnowledgeView(bundle: KnowledgeBundle): KnowledgeView {
  const traditionById = new Map<string, BundleTradition>(bundle.traditions.map((t) => [t.id, t]));
  const traditionBySlug = new Map<string, BundleTradition>(bundle.traditions.map((t) => [t.slug, t]));
  const sourceById = new Map<string, BundleSource>(bundle.sources.map((s) => [s.id, s]));
  const typeByCode = new Map<string, BundleType>(bundle.relationshipTypes.map((t) => [t.code, t]));
  const conceptByKey = new Map<string, BundleConcept>();
  const conceptBySlug = new Map<string, BundleConcept>();
  const conceptById = new Map<string, BundleConcept>();
  for (const c of bundle.concepts) {
    conceptByKey.set(c.key, c);
    conceptBySlug.set(c.slug, c);
    conceptById.set(c.id, c);
  }
  const relsByConcept = new Map<string, BundleRelationship[]>();
  for (const r of bundle.relationships) {
    for (const k of new Set([r.source, r.target])) relsByConcept.set(k, [...(relsByConcept.get(k) ?? []), r]);
  }

  const find = (x: string) => conceptByKey.get(x) ?? conceptBySlug.get(x) ?? conceptById.get(x) ?? null;
  const diagramsBySlug = new Map<string, StructureDiagram[]>();

  const sourceView = (s: BundleSource): SourceView => ({
    id: s.id,
    label: sourceDisplayLabel(s),
    kind: s.kind,
    title: s.title,
    author: s.author,
    publisher: s.publisher,
    year: s.year,
    url: s.url,
    accessedOn: s.accessedOn,
    reliability: s.reliability,
    verificationState: s.verificationState,
  });
  const cite = (sourceId: string, locator: string | null | undefined, quote: string | null | undefined, passages: EvidencePassage[] = []): Citation | null => {
    const s = sourceById.get(sourceId);
    return s ? { ...sourceView(s), locator: locator ?? null, quote: quote ?? null, passages } : null;
  };

  const ref = (c: BundleConcept): ConceptRef => ({
    id: c.id,
    key: c.key,
    slug: c.slug,
    type: c.type,
    category: c.category,
    title: c.title,
    summary: c.summary,
    traditionId: c.traditionId,
    traditionSlug: c.traditionId ? (traditionById.get(c.traditionId)?.slug ?? null) : null,
    verificationState: c.verificationState,
  });

  const claimViews = (c: BundleConcept): ClaimView[] =>
    c.claims.map((cl, position) => ({
      id: cl.id,
      position,
      text: cl.text,
      quote: cl.quote,
      // Each citation carries its own located passages (content/FORMAT.md "Claim evidence"); its
      // quote is the first passage. Without passages, the claim's own quote is attached only when
      // the claim cites exactly one source (otherwise it is unknown which source it comes from).
      evidence: cl.sources
        .map((s) => {
          const passages = (s.evidence ?? []).map((e) => ({ locator: e.locator, quote: e.quote, note: e.note }));
          const first = passages[0];
          return first ? cite(s.sourceId, s.locator ?? first.locator, first.quote, passages) : cite(s.sourceId, s.locator, cl.sources.length === 1 ? cl.quote : null);
        })
        .filter((x): x is Citation => !!x),
    }));

  const conceptsOfTradition = (traditionId: string) => bundle.concepts.filter((c) => c.traditionId === traditionId);

  const summary = (t: BundleTradition): TraditionSummary => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    altNames: t.altNames,
    summary: t.summary,
    region: t.region,
    verificationState: t.verificationState,
    conceptCount: conceptsOfTradition(t.id).length,
  });

  const relEvidence = (r: BundleRelationship) =>
    r.sources.map((s) => cite(s.sourceId, s.locator, s.quote)).filter((x): x is Citation => !!x);

  const processLink = (r: BundleRelationship): ProcessLink => ({
    relationshipId: r.id,
    from: ref(conceptByKey.get(r.source)!),
    to: ref(conceptByKey.get(r.target)!),
    ordinal: r.ordinal,
    explanation: r.explanation,
    conditions: r.conditions,
    evidence: relEvidence(r),
  });

  const sequenceOf = (edges: readonly BundleRelationship[]): ProcessSequence => {
    const ordered = [...edges].sort((a, b) => a.ordinal! - b.ordinal! || byString(a.id, b.id));
    const steps: BundleConcept[] = [];
    let continuous = true;
    for (const r of ordered) {
      const from = conceptByKey.get(r.source)!;
      const to = conceptByKey.get(r.target)!;
      const last = steps[steps.length - 1];
      if (!last) steps.push(from);
      else if (last.key !== from.key) {
        continuous = false;
        if (!steps.some((x) => x.key === from.key)) steps.push(from);
      }
      if (!steps.some((x) => x.key === to.key)) steps.push(to);
    }
    return { steps: steps.map(ref), links: ordered.map(processLink), continuous };
  };

  return {
    info: () => ({
      versionLabel: bundle.versionLabel,
      isDemo: bundle.isDemo,
      includesUnverified: bundle.includesUnverified,
      generatedAt: bundle.generatedAt,
      counts: { traditions: bundle.traditions.length, concepts: bundle.concepts.length, relationships: bundle.relationships.length, sources: bundle.sources.length },
    }),

    listTraditions: () => bundle.traditions.map(summary).sort((a, b) => byString(a.slug, b.slug)),

    getTradition: (slug) => {
      const t = traditionBySlug.get(slug);
      if (!t) return null;
      const concepts = conceptsOfTradition(t.id).sort((a, b) => byString(a.key, b.key));
      const conceptsByType: Partial<Record<ConceptType, ConceptRef[]>> = {};
      for (const c of concepts) (conceptsByType[c.type] ??= []).push(ref(c));
      const overview = concepts.find((c) => c.type === "tradition");
      return {
        ...summary(t),
        gi: t.gi
          ? {
              registered: t.gi.registered,
              applicationNo: t.gi.applicationNo,
              year: t.gi.year,
              sources: t.gi.sourceIds.map((id) => sourceById.get(id)).filter((s): s is BundleSource => !!s).map(sourceView),
            }
          : null,
        overviewConcept: overview ? ref(overview) : null,
        conceptsByType,
      };
    },

    getConcept: (x) => {
      const c = find(x);
      if (!c) return null;
      const claims = claimViews(c);
      const seen = new Set<string>();
      const sources: SourceView[] = [];
      const byProvenance: ConceptDetail["evidenceSummary"]["byProvenance"] = {};
      const byReliability: ConceptDetail["evidenceSummary"]["byReliability"] = {};
      for (const cl of claims) {
        for (const e of cl.evidence) {
          if (!seen.has(e.id)) {
            seen.add(e.id);
            const { locator: _l, quote: _q, passages: _p, ...s } = e;
            sources.push(s);
          }
        }
        for (const kind of new Set(cl.evidence.map((e) => e.kind))) byProvenance[kind] = (byProvenance[kind] ?? 0) + 1;
        for (const rel of new Set(cl.evidence.map((e) => e.reliability ?? "unknown"))) byReliability[rel] = (byReliability[rel] ?? 0) + 1;
      }
      const t = c.traditionId ? traditionById.get(c.traditionId) : undefined;
      return {
        ...ref(c),
        bodyMd: c.bodyMd,
        body: c.body,
        localTerms: c.localTerms,
        provenanceKind: c.provenanceKind,
        compares: c.compares.map((k) => conceptByKey.get(k)).filter((x): x is BundleConcept => !!x).map(ref),
        tradition: t ? { id: t.id, slug: t.slug, name: t.name } : null,
        claims,
        sources,
        evidenceSummary: { claims: claims.length, sourcedClaims: claims.filter((cl) => cl.evidence.length > 0).length, byProvenance, byReliability },
        assetIds: c.assetIds,
      };
    },

    getProcessChain: (traditionSlug) => {
      const t = traditionBySlug.get(traditionSlug);
      if (!t) return null;
      const concept = (k: string) => conceptByKey.get(k);
      const inTradition = (k: string) => concept(k)?.traditionId === t.id;
      const precedes = bundle.relationships.filter((r) => r.type === "PRECEDES" && inTradition(r.source) && inTradition(r.target));
      const ordinalled = precedes.filter((r) => r.ordinal != null);
      const isStageEdge = (r: BundleRelationship) => concept(r.source)?.type === "process_stage" && concept(r.target)?.type === "process_stage";

      // Connected components of the non-process ordinalled edges (union-find over concept keys).
      const others = ordinalled.filter((r) => !isStageEdge(r));
      const parent = new Map<string, string>();
      const root = (k: string): string => {
        const p = parent.get(k) ?? k;
        if (p === k) return k;
        const r = root(p);
        parent.set(k, r);
        return r;
      };
      for (const r of others) parent.set(root(r.source), root(r.target));
      const components = new Map<string, BundleRelationship[]>();
      for (const r of others) components.set(root(r.source), [...(components.get(root(r.source)) ?? []), r]);

      const process = sequenceOf(ordinalled.filter(isStageEdge));
      return {
        traditionSlug,
        ...process,
        otherSequences: [...components.values()].map(sequenceOf).sort((a, b) => byString(a.steps[0]?.key ?? "", b.steps[0]?.key ?? "")),
        unorderedLinks: precedes.filter((r) => r.ordinal == null).sort((a, b) => byString(a.id, b.id)).map(processLink),
      };
    },

    getRelatedConcepts: (x) => {
      const c = find(x);
      if (!c) return null;
      const groups = new Map<RelationshipSemantics, RelatedConcept[]>();
      for (const r of relsByConcept.get(c.key) ?? []) {
        const type = typeByCode.get(r.type);
        if (!type) continue;
        const outgoing = r.source === c.key;
        const other = conceptByKey.get(outgoing ? r.target : r.source);
        if (!other) continue;
        const direction: RelationDirection = !type.directed ? "undirected" : outgoing ? "outgoing" : "incoming";
        const item: RelatedConcept = {
          relationshipId: r.id,
          type: r.type,
          semantics: type.semantics,
          direction,
          label: direction === "incoming" ? (type.inverseLabel ?? type.label) : type.label,
          concept: ref(other),
          explanation: r.explanation,
          conditions: r.conditions,
          ordinal: r.ordinal,
          strength: r.strength,
          provenanceKind: r.provenanceKind,
          verificationState: r.verificationState,
          evidence: relEvidence(r),
        };
        groups.set(type.semantics, [...(groups.get(type.semantics) ?? []), item]);
      }
      return RELATIONSHIP_SEMANTICS.filter((s) => groups.has(s)).map((semantics) => ({
        semantics,
        relations: groups
          .get(semantics)!
          .sort((a, b) => byString(a.type, b.type) || (a.ordinal ?? 0) - (b.ordinal ?? 0) || byString(a.concept.key, b.concept.key)),
      }));
    },

    getComparisons: (opts = {}) => {
      const t = opts.traditionSlug ? traditionBySlug.get(opts.traditionSlug) : undefined;
      if (opts.traditionSlug && !t) return [];
      return bundle.concepts
        .filter((c) => c.type === "comparison")
        .map((c) => {
          const compared = c.compares.map((k) => conceptByKey.get(k)).filter((x): x is BundleConcept => !!x);
          const keys = new Set([c.key, ...compared.map((x) => x.key)]);
          const links = bundle.relationships
            .filter((r) => (r.type === "SIMILAR_TO" || r.type === "CONTRASTS_WITH") && (keys.has(r.source) || keys.has(r.target)))
            .filter((r) => conceptByKey.has(r.source) && conceptByKey.has(r.target))
            .sort((a, b) => byString(a.id, b.id))
            .map((r) => ({ relationshipId: r.id, type: r.type, a: ref(conceptByKey.get(r.source)!), b: ref(conceptByKey.get(r.target)!), explanation: r.explanation, evidence: relEvidence(r) }));
          return { concept: ref(c), compares: compared.map(ref), claims: claimViews(c), links };
        })
        .filter((v) => !t || v.compares.some((x) => x.traditionId === t.id))
        .sort((a, b) => byString(a.concept.key, b.concept.key));
    },

    conceptRefsById: (ids) => ids.map((id) => conceptById.get(id)).filter((c): c is BundleConcept => !!c).map(ref),

    structureDiagrams: (slug) => {
      const hit = diagramsBySlug.get(slug);
      if (hit) return hit;
      const built = buildStructureDiagrams(bundle, slug);
      diagramsBySlug.set(slug, built);
      return built;
    },
  };
}
