/**
 * Information-panel content for an exhibit: which disclosure layers (tabs) it has and which
 * concept each shows. Pure (no React), so the equivalence with the 2D condition is unit-tested:
 * every block of text in a panel is a concept's claims exactly as the read model returns them
 * (tests/unit/immersive/panel-content.test.ts).
 *
 * Layers (progressive disclosure, master spec §8.3, CN-10/CN-11):
 *  - overview:   the exhibit's own concept (claims + typed connections, as the 2D concept page)
 *  - artisan:    concepts the manifest attaches as practitioner layers (PRACTITIONER_EXPLAINS)
 *  - process:    the exhibit's place in its ordered sequence path (stations only)
 *  - science:    concepts attached as science layers (SCIENTIFICALLY_EXPLAINED_BY)
 *  - comparison: cross-tradition counterparts from the manifest's compare hotspots
 * An "explanation" layer (EXPLAINS) is shown under artisan, process or science by the type of
 * the explaining concept, using the same type -> layer mapping as 2D exposure (exposureLayerOf).
 *
 * Exposure: one concept's claims are on screen at a time, so the exposure interval is
 * (that concept, exposureLayerOf(its type)), the same rule the 2D pages use.
 */
import type { ComparisonView, ConceptDetail, RelatedConceptGroups } from "@/features/knowledge/read/view";
import { byCanonicalTradition, exposureLayerOf, KNOWLEDGE_LAYERS, type KnowledgeLayerId } from "@/features/learning/labels";
import type { ExposureLayer } from "@/features/telemetry/contracts";
import type { SourceView } from "@/features/knowledge/read/view";

import type { SceneExhibit, SceneModel } from "./scene-model";
import type { PanelConcept, PanelRelation } from "./types";

/**
 * The panel's layers are the shared knowledge layers: ids, names and order come only from
 * `KNOWLEDGE_LAYERS` in src/features/learning/labels.ts (DESIGN.md 9.6, 12.1 rule 2), which the
 * shared `LayerTabs` reads in both conditions. The ids are the telemetry `layerId` values.
 */
export const PANEL_TABS: readonly KnowledgeLayerId[] = KNOWLEDGE_LAYERS.map((l) => l.id);
export type PanelTab = KnowledgeLayerId;

/** A concept shown under a tab, with the manifest element that presents it (walk target). */
export interface TabEntry {
  conceptId: string;
  /** Exhibit element presenting this concept, when it is placed in the museum. */
  elementId: string | null;
  /** Relationship that links it to the exhibit (layers, compare hotspots); null for the exhibit itself. */
  relationshipId: string | null;
}

export interface PanelModel {
  exhibitId: string;
  conceptId: string;
  tabs: { tab: PanelTab; entries: TabEntry[] }[];
  /** Stations: the ordered stops of the sequence path (exhibit element ids) and this one's index. */
  sequence: { pathId: string; stops: { elementId: string; conceptId: string }[]; index: number } | null;
}

const LAYER_TAB = { practitioner: "artisan", science: "science" } as const;

function tabForExplanation(type: string | undefined): PanelTab {
  const l = type ? exposureLayerOf(type as Parameters<typeof exposureLayerOf>[0]) : "science";
  // Only artisan, process and science are explanation tabs; anything else (overview, comparison) reads as science, as before.
  return l === "artisan" || l === "process" ? l : "science";
}

export function buildPanelModel(model: Pick<SceneModel, "exhibits" | "paths">, exhibit: SceneExhibit, concepts: Readonly<Record<string, PanelConcept>>): PanelModel {
  const byElement = new Map(model.exhibits.map((e) => [e.id, e]));
  const byConcept = new Map(model.exhibits.map((e) => [e.conceptId, e]));
  const tabs = new Map<PanelTab, TabEntry[]>(PANEL_TABS.map((t) => [t, []]));
  tabs.get("overview")!.push({ conceptId: exhibit.conceptId, elementId: exhibit.id, relationshipId: null });

  for (const layer of [...exhibit.layers].sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : 1))) {
    const tab: PanelTab = layer.kind === "explanation" ? tabForExplanation(concepts[layer.conceptId]?.type) : LAYER_TAB[layer.kind];
    const list = tabs.get(tab)!;
    if (!list.some((x) => x.conceptId === layer.conceptId)) {
      list.push({ conceptId: layer.conceptId, elementId: layer.linkedElementId ?? byConcept.get(layer.conceptId)?.id ?? null, relationshipId: layer.relationshipId });
    }
  }

  for (const h of exhibit.hotspots) {
    if (h.kind !== "compare" || !h.targetElementId) continue;
    const target = byElement.get(h.targetElementId);
    if (!target) continue;
    const list = tabs.get("comparison")!;
    if (!list.some((x) => x.conceptId === target.conceptId)) list.push({ conceptId: target.conceptId, elementId: target.id, relationshipId: h.relationshipId });
  }
  // The Compare layer lists its concepts in the canonical tradition order (DESIGN.md 12.3 rule 12,
  // DR-019), stable within a tradition and untraditioned concepts last, exactly as the 2D page
  // orders them (the shared labels.ts byCanonicalTradition).
  tabs.set("comparison", byCanonicalTradition(tabs.get("comparison")!, (entry) => concepts[entry.conceptId]?.traditionSlug ?? null));

  let sequence: PanelModel["sequence"] = null;
  if (exhibit.sequence) {
    const path = model.paths.find((p) => p.id === exhibit.sequence!.pathId);
    if (path) {
      const stops = path.stops.map((id) => byElement.get(id)).filter((e): e is SceneExhibit => !!e).map((e) => ({ elementId: e.id, conceptId: e.conceptId }));
      sequence = { pathId: path.id, stops, index: stops.findIndex((s) => s.elementId === exhibit.id) };
      tabs.get("process")!.push({ conceptId: exhibit.conceptId, elementId: exhibit.id, relationshipId: null });
    }
  }

  return {
    exhibitId: exhibit.id,
    conceptId: exhibit.conceptId,
    tabs: PANEL_TABS.filter((t) => tabs.get(t)!.length > 0).map((t) => ({ tab: t, entries: tabs.get(t)! })),
    sequence,
  };
}

/** The exposure interval for showing `concept` (same mapping as the 2D condition). */
export function exposureFor(concept: Pick<PanelConcept, "type">): ExposureLayer {
  return exposureLayerOf(concept.type);
}

/**
 * Read-model concept -> panel concept. Text is copied verbatim; nothing is added or rewritten.
 * `sources` collects every cited source once.
 */
export function toPanelConcept(
  detail: ConceptDetail,
  related: RelatedConceptGroups | null,
  sources: Map<string, SourceView>,
  comparison: ComparisonView | null = null,
  /** Study scope (the manifest's placed concepts, the same scope the 2D condition serves). */
  inScope: (conceptId: string) => boolean = () => true,
): PanelConcept {
  for (const claim of detail.claims) {
    for (const c of claim.evidence) {
      if (!sources.has(c.id)) {
        const { locator: _l, quote: _q, ...s } = c;
        sources.set(c.id, s);
      }
    }
  }
  return {
    id: detail.id,
    key: detail.key,
    title: detail.title,
    type: detail.type,
    category: detail.category,
    traditionId: detail.tradition?.id ?? detail.traditionId ?? null,
    traditionSlug: detail.traditionSlug,
    localTerms: [...detail.localTerms],
    verificationState: detail.verificationState,
    claims: detail.claims.map((c) => ({
      id: c.id,
      position: c.position,
      text: c.text,
      evidence: c.evidence.map((e) => ({ sourceId: e.id, locator: e.locator, quote: e.quote, passages: e.passages })),
    })),
    comparison: comparison
      ? {
          // Canonical tradition order, as the 2D page lists them (learning-2d/server/data.ts
          // scopedComparisons); the content file's order is not used (DR-047).
          compares: byCanonicalTradition(comparison.compares.filter((c) => inScope(c.id)), (c) => c.traditionSlug).map((c) => ({ id: c.id, title: c.title, type: c.type, traditionSlug: c.traditionSlug })),
          links: comparison.links.filter((l) => inScope(l.a.id) && inScope(l.b.id)).map((l) => ({
            relationshipId: l.relationshipId,
            type: l.type,
            aTitle: l.a.title,
            bTitle: l.b.title,
            explanation: l.explanation,
            statedBy: [...new Set(l.evidence.map((e) => e.label))],
          })),
        }
      : null,
    related: (related ?? [])
      .map((g) => ({
      semantics: g.semantics,
      relations: g.relations.filter((r) => inScope(r.concept.id)).map(
        (r): PanelRelation => ({
          relationshipId: r.relationshipId,
          type: r.type,
          semantics: r.semantics,
          direction: r.direction,
          label: r.label,
          conceptId: r.concept.id,
          conceptTitle: r.concept.title,
          conceptType: r.concept.type,
          conceptTraditionSlug: r.concept.traditionSlug,
          explanation: r.explanation,
          conditions: r.conditions,
          statedBy: [...new Map(r.evidence.map((e) => [e.id, e.label])).values()],
        }),
      ),
    }))
      .filter((g) => g.relations.length > 0),
  };
}
