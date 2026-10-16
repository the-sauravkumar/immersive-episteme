"use client";

/**
 * The 2D placement of a concept's KnowledgeSheet WITH its layers (DESIGN.md 9.6, 9.11; DR-034):
 * the shared `KnowledgeSheet` with the shared `LayerTabs`, holding the same layer state the 3D
 * information panel holds (which layer, which concept of that layer is shown). The server page
 * pre-renders every (layer, concept) view; this component only selects one, as the panel does:
 *  - one layer's content at a time, LayerTabs to switch (names and order from labels.ts);
 *  - a layer with several concepts shows a chooser above the shown concept (the panel's
 *    `ConceptChooser`: the same rows, `aria-pressed`, check icon);
 *  - Related Concepts follows the concept shown, the pager stays the page concept's.
 * Telemetry mirrors the panel's `openPanel`, `setTab` and `closePanel`: showing the page logs
 * `information_layer_opened` for the first layer, leaving it logs `information_layer_closed` (the
 * layer shown, openMs); switching layers logs `information_layer_closed`
 * (previous layer, openMs), `information_layer_opened` and, for the artisan, process and science
 * layers, `knowledge_layer_selected`; showing another concept logs `concept_encountered`
 * ("opened"). Exposure is the shown concept's own `ExposureRegion` (inside its pre-rendered view).
 *
 * Close fills the sheet's action slot, as in the 3D panel (DR-021 decision 4): here a link back to
 * the section view (the concept's section on its tradition page), so Back works; the move is logged
 * with the navigation source "close".
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { KnowledgeSheet, SHEET_CLOSE_CLASS, SheetCloseContent, type FieldLayer, type SheetConcept } from "@/components/knowledge";
import { ConceptChooser } from "@/components/knowledge/concept-chooser";
import type { KnowledgeLayerId } from "@/features/learning/labels";
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

import { TrackedLink } from "./tracked-link";
import { useStableTracker } from "./use-stable-tracker";

export interface LayerEntryView {
  conceptId: string;
  title: string;
  category: KnowledgeCategoryCode;
  traditionId: string | null;
  /** The concept's view under this layer (head, sequence, exposure region with its claims, comparison blocks). */
  view: ReactNode;
  /** The ReferenceList of the concept's claims (`SheetReferences`), for the sheet's references slot. */
  references?: ReactNode;
}

export interface ConceptLayersSheetProps {
  concept: SheetConcept;
  step: { index: number; total: number } | null;
  layers: readonly { id: KnowledgeLayerId; entries: readonly LayerEntryView[] }[];
  /** RelatedConcepts of each concept that can be shown, by concept id. */
  relatedByConcept: Readonly<Record<string, ReactNode>>;
  pager: ReactNode;
  pageId: string;
  /** Where Close leads: the section view (null: no Close, e.g. a sheet outside the learning pages). */
  closeHref: string | null;
}

export function ConceptLayersSheet({ concept, step, layers, relatedByConcept, pager, pageId, closeHref }: ConceptLayersSheetProps) {
  const first = layers[0];
  const [state, setState] = useState<{ tab: KnowledgeLayerId; conceptId: string }>({ tab: first?.id ?? "overview", conceptId: first?.entries[0]?.conceptId ?? concept.id });
  const layerSince = useRef(0);
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

  // The sheet's own open and close, as the 3D panel logs them (openPanel / closePanel; DR-050
  // Addendum): `information_layer_opened` for the first layer when the concept page is shown, and
  // `information_layer_closed` with openMs for the layer shown when it is left. Without these, a
  // 3D panel open logged a layer pair that a 2D page visit did not (final review
  // equivalence-layer-telemetry-asymmetry).
  const shownNow = useRef(state);
  useEffect(() => {
    shownNow.current = state;
  });
  const lifecycle = useRef<{ closeTimer: ReturnType<typeof setTimeout> | null }>({ closeTimer: null });
  useEffect(() => {
    const life = lifecycle.current;
    if (life.closeTimer !== null) {
      // React Strict Mode's simulated unmount and remount: the sheet never closed.
      clearTimeout(life.closeTimer);
      life.closeTimer = null;
    } else {
      layerSince.current = performance.now();
      const s = shownNow.current;
      void tracker.informationLayerOpened({ ...where(entryOf(s.tab, s.conceptId)), metadata: { layerId: s.tab } });
    }
    return () => {
      // Deferred one task, as page_exited (page-telemetry.tsx), so a Strict Mode remount cancels it.
      life.closeTimer = setTimeout(() => {
        life.closeTimer = null;
        const s = shownNow.current;
        void tracker.informationLayerClosed({ ...where(entryOf(s.tab, s.conceptId)), metadata: { layerId: s.tab, openMs: Math.max(0, Math.floor(performance.now() - layerSince.current)) } });
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per shown sheet: the open and the close of this concept page
  }, [tracker]);

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
      references={shown?.references ?? null}
      related={shown ? relatedByConcept[shown.conceptId] : null}
      pager={pager}
      action={
        closeHref ? (
          <TrackedLink
            href={closeHref}
            pageId={pageId}
            source="close"
            className={SHEET_CLOSE_CLASS}
            data-slot="sheet-close"
          >
            <SheetCloseContent />
          </TrackedLink>
        ) : null
      }
    />
  );
}
