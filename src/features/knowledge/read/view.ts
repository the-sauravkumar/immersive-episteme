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

interface SnapshotInfo {
  versionLabel: string;
  isDemo: boolean;
  includesUnverified: boolean;
  generatedAt: string;
  counts: { traditions: number; concepts: number; relationships: number; sources: number };
}

interface SourceView {
  id: string;
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

interface EvidencePassage {
  locator: string;
  quote: string;
  note: string | null;
}

export interface Citation extends SourceView {
  locator: string | null;
  quote: string | null;
  passages: EvidencePassage[];
}

interface ConceptRef {
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

interface TraditionSummary {
  id: string;
  slug: string;
  name: string;
  altNames: string[];
  summary: string | null;
  region: BundleTradition["region"];
  verificationState: VerificationState;
  conceptCount: number;
}

interface TraditionDetail extends TraditionSummary {
  gi: { registered: boolean | null; applicationNo: string | null; year: number | null; sources: SourceView[] } | null;
  overviewConcept: ConceptRef | null;
  conceptsByType: Partial<Record<ConceptType, ConceptRef[]>>;
}

export interface ClaimView {
  id: string;
  position: number;
  text: string;
  quote: string | null;
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
  sources: SourceView[];
  evidenceSummary: {
    claims: number;
    sourcedClaims: number;
    byProvenance: Partial<Record<ProvenanceKind, number>>;
    byReliability: Partial<Record<SourceReliability | "unknown", number>>;
  };
  assetIds: string[];
}

export type RelationDirection = "outgoing" | "incoming" | "undirected";

interface RelatedConcept {
  relationshipId: string;
  type: string;
  semantics: RelationshipSemantics;
  direction: RelationDirection;
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

export type RelatedConceptGroups = { semantics: RelationshipSemantics; relations: RelatedConcept[] }[];

interface ProcessLink {
  relationshipId: string;
  from: ConceptRef;
  to: ConceptRef;
  ordinal: number | null;
  explanation: string | null;
  conditions: string | null;
  evidence: Citation[];
}

interface ProcessSequence {
  steps: ConceptRef[];
  links: ProcessLink[];
  continuous: boolean;
}

interface ProcessChain extends ProcessSequence {
  traditionSlug: string;
  otherSequences: ProcessSequence[];
  unorderedLinks: ProcessLink[];
}

interface ComparisonView {
  concept: ConceptRef;
  compares: ConceptRef[];
  claims: ClaimView[];
  links: { relationshipId: string; type: string; a: ConceptRef; b: ConceptRef; explanation: string | null; evidence: Citation[] }[];
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function sourceDisplayLabel(s: { author: string | null; publisher: string | null; year: number | null; title: string }): string {
  const who = s.author?.trim() || s.publisher?.trim() || null;
  const year = s.year != null ? String(s.year) : null;
  if (who) return year ? `${wordCut(who, 48)} ${year}` : wordCut(who, 48);
  return year ? `${wordCut(s.title, 56)} (${year})` : wordCut(s.title, 64);
}

function bindLocator(locator: string): string {
  return locator
    .replace(/\b(PDF)\s+(?=pp?\.)/g, "$1 ")
    .replace(/(\b(?:pp?|figs?|nos?|vols?|ch|chap|paras?|sec|cols?|ll?|art|pl)\.|§)\s+(?=[\dIVXLCivxlc])/g, "$1 ");
}

function wordCut(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 3 ? cut.slice(0, at) : cut).replace(/[\s,;:·–—-]+$/u, "")}…`;
}

function shortName(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.replace(/\([^)]*\)/g, " ").split(";")[0]!.split(/\s[—–]\s/)[0]!.replace(/\s+/g, " ").trim();
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length > 1) s = parts[0]!;
  s = s.replace(/[\s,;:]+$/u, "");
  return s ? wordCut(s, 48) : null;
}

export function shortCitationLabel(c: { author: string | null; publisher: string | null; year: number | null; title: string; locator?: string | null }): string {
  const who = shortName(c.author) ?? shortName(c.publisher) ?? wordCut(c.title, 56);
  const year = c.year != null && c.year > 0 ? String(c.year) : null;
  const head = year ? `${who} (${year})` : who;
  const locator = c.locator?.trim() ? bindLocator(wordCut(c.locator, 48)) : null;
  return locator ? `${head}, ${locator}` : head;
}

export function referencesOf<C extends { id: string }>(claims: readonly { evidence: readonly C[] }[]): C[] {
  const seen = new Set<string>();
  const out: C[] = [];
  for (const claim of claims) {
    for (const c of claim.evidence) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function referenceNumbers(claims: readonly { evidence: readonly { id: string }[] }[]): Map<string, number> {
  return new Map(referencesOf(claims).map((c, i) => [c.id, i + 1]));
}

interface FigureBase {
  id: string;
  conceptId: string;
  anchorClaimIndex: number;
  caption: string;
  alt: string;
}

export interface DiagramFigure extends FigureBase {
  kind: "diagram";
  credit: string;
  diagram: StructureDiagram;
}

export interface PhotoFigure extends FigureBase {
  kind: "photo";
  src: string;
  width: number;
  height: number;
  credit: string;
  licence: string;
  licenceUrl: string | null;
}

export type KnowledgeFigureData = DiagramFigure | PhotoFigure;

export interface IllustrationLink {
  assetId: string;
  conceptId: string;
  role: string;
  position: number;
  src: string;
  width: number;
  height: number;
  altText: string;
  caption: string;
  credit: string;
  licence: string;
  licenceUrl: string | null;
  sha256: string;
  sourceUrl: string;
}

export function photoGateOpen(conceptVerificationState: string): boolean {
  return conceptVerificationState === "verified" || conceptVerificationState === "published";
}

export function photoFiguresOf(
  concept: { id: string; claimCount: number; verificationState: string },
  links: readonly IllustrationLink[],
): PhotoFigure[] {
  if (!photoGateOpen(concept.verificationState)) return [];
  const conceptId = concept.id;
  const claimCount = concept.claimCount;
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

export interface ConceptPhoto {
  tradition: string;
  conceptKey: string;
  conceptType: string;
  assetId: string;
  record: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  credit: string;
  licence: string;
  sha256: string;
}

export function conceptPhotosOf(view: Pick<KnowledgeView, "getConcept">, links: readonly IllustrationLink[]): ConceptPhoto[] {
  return [...new Set(links.map((link) => link.conceptId))].flatMap((conceptId) => {
    const concept = view.getConcept(conceptId);
    if (!concept?.traditionSlug) return [];
    const [figure] = photoFiguresOf({ id: concept.id, claimCount: concept.claims.length, verificationState: concept.verificationState }, links);
    const link = figure ? links.find((candidate) => candidate.assetId === figure.id && candidate.conceptId === concept.id) : undefined;
    if (!figure || !link) return [];
    return [
      {
        tradition: concept.traditionSlug,
        conceptKey: concept.key,
        conceptType: concept.type,
        assetId: figure.id,
        record: link.sourceUrl,
        src: figure.src,
        width: figure.width,
        height: figure.height,
        alt: figure.alt,
        caption: figure.caption,
        credit: figure.credit,
        licence: figure.licence,
        sha256: link.sha256,
      },
    ];
  });
}

export function diagramCredit(snapshotLabel: string): string {
  return `Diagram generated from the project's knowledge graph (snapshot ${snapshotLabel})`;
}

export function diagramFigureOf(d: StructureDiagram, credit: string): DiagramFigure {
  return { kind: "diagram", id: d.id, conceptId: d.anchor.conceptId, anchorClaimIndex: d.anchor.claimIndex, caption: d.caption, alt: d.alt, credit, diagram: d };
}

export function resolveConceptFigures(input: {
  diagrams: readonly DiagramFigure[];
  photos: readonly PhotoFigure[];
  structureDiagrams: boolean;
  photosOn?: boolean;
}): KnowledgeFigureData[] {
  const diagram = input.structureDiagrams ? input.diagrams[0] : undefined;
  if (diagram) return [diagram];
  const photo = input.photosOn === false ? undefined : input.photos[0];
  return photo ? [photo] : [];
}

export interface DiagramScope {
  traditionSlugs: readonly string[];
  balanceSlugs: readonly string[];
}

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
  getConcept(keyOrSlugOrId: string): ConceptDetail | null;
  getProcessChain(traditionSlug: string): ProcessChain | null;
  getRelatedConcepts(keyOrSlugOrId: string): RelatedConceptGroups | null;
  getComparisons(opts?: { traditionSlug?: string }): ComparisonView[];
  conceptRefsById(ids: readonly string[]): ConceptRef[];
  structureDiagrams(traditionSlug: string): StructureDiagram[];
}

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
