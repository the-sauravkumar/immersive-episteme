"use client";

/**
 * The 2D placement of a concept's KnowledgeSheet WITH its layers (DESIGN.md 9.6, 9.11; DR-021):
 * the shared `KnowledgeSheet` with the shared `LayerTabs`, holding the same layer state the 3D
 * information panel holds (which layer, which concept of that layer is shown). The server page
 * pre-renders every (layer, concept) view; this component only selects one, as the panel does:
 *  - one layer's content at a time, LayerTabs to switch (names and order from labels.ts);
 *  - a layer with several concepts shows a chooser above the shown concept (the panel's
 *    `ConceptChooser`: the same rows, `aria-pressed`, check icon);
 *  - Related Concepts follows the concept shown, the pager stays the page concept's.
 * Telemetry mirrors the panel's `setTab`: switching layers logs `information_layer_closed`
 * (previous layer, openMs), `information_layer_opened` and, for the artisan, process and science
 * layers, `knowledge_layer_selected`; showing another concept logs `concept_encountered`
 * ("opened"). Exposure is the shown concept's own `ExposureRegion` (inside its pre-rendered view).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { KnowledgeSheet, type FieldLayer, type SheetConcept } from "@/components/knowledge";
import { ConceptChooser } from "@/components/knowledge/concept-chooser";
import type { KnowledgeLayerId } from "@/features/learning/labels";
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

import { useStableTracker } from "./use-stable-tracker";

export interface LayerEntryView {
  conceptId: string;
  title: string;
  category: KnowledgeCategoryCode;
  traditionId: string | null;
  /** The concept's view under this layer (head, sequence, exposure region with its claims, comparison blocks). */
  view: ReactNode;
}

export interface ConceptLayersSheetProps {
  concept: SheetConcept;
  step: { index: number; total: number } | null;
  layers: readonly { id: KnowledgeLayerId; entries: readonly LayerEntryView[] }[];
  /** RelatedConcepts of each concept that can be shown, by concept id. */
  relatedByConcept: Readonly<Record<string, ReactNode>>;
  pager: ReactNode;
  pageId: string;
}

export function ConceptLayersSheet({ concept, step, layers, relatedByConcept, pager, pageId }: ConceptLayersSheetProps) {
  const first = layers[0];
  const [state, setState] = useState<{ tab: KnowledgeLayerId; conceptId: string }>({ tab: first?.id ?? "overview", conceptId: first?.entries[0]?.conceptId ?? concept.id });
  const layerSince = useRef(0);
  useEffect(() => {
    layerSince.current = performance.now();
  }, []);
  const tracker = useStableTracker();

  const entryOf = (tab: KnowledgeLayerId, conceptId: string) => layers.find((l) => l.id === tab)?.entries.find((e) => e.conceptId === conceptId);
  const where = (e: LayerEntryView | undefined) => ({
    roomOrPageId: pageId,
    ...(e ? { conceptId: e.conceptId, category: e.category, ...(e.traditionId ? { traditionId: e.traditionId } : {}) } : {}),
  });

  const select = (tab: KnowledgeLayerId, conceptId: string) => {
    if (tab === state.tab && conceptId === state.conceptId) return;
    const now = performance.now();
    const next = entryOf(tab, conceptId);
    if (tab !== state.tab) {
      void tracker.informationLayerClosed({ ...where(entryOf(state.tab, state.conceptId)), metadata: { layerId: state.tab, openMs: Math.max(0, Math.floor(now - layerSince.current)) } });
      layerSince.current = now;
      void tracker.informationLayerOpened({ ...where(next), metadata: { layerId: tab } });
      if (tab === "artisan" || tab === "process" || tab === "science") void tracker.knowledgeLayerSelected({ ...where(next), metadata: { layer: tab } });
    }
    if (conceptId !== state.conceptId) void tracker.conceptEncountered({ ...where(next), metadata: { mode: "opened" } });
    setState({ tab, conceptId });
  };

  const current = layers.find((l) => l.id === state.tab) ?? first;
  const shown = current?.entries.find((e) => e.conceptId === state.conceptId) ?? current?.entries[0];
  const field = current && shown ? (
    <div data-slot="panel-concept" data-concept-id={shown.conceptId}>
      {current.entries.length > 1 ? <ConceptChooser entries={current.entries.map((e) => ({ conceptId: e.conceptId, title: e.title }))} selected={shown.conceptId} onSelect={(id) => select(current.id, id)} /> : null}
      {shown.view}
    </div>
  ) : null;
  const fieldLayers: FieldLayer[] = layers.map((l) => ({ id: l.id, content: l.id === current?.id ? field : null }));

  return (
    <KnowledgeSheet
      placement="page"
      concept={concept}
      step={step}
      layers={fieldLayers}
      layerValue={current?.id}
      onLayerChange={(layer) => {
        const entry = layers.find((l) => l.id === layer)?.entries[0];
        if (entry) select(layer, entry.conceptId);
      }}
      related={shown ? relatedByConcept[shown.conceptId] : null}
      pager={pager}
    />
  );
}
