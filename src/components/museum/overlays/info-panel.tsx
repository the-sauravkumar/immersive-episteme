"use client";

/**
 * The exhibit's information panel (DESIGN.md 11.6, 9.11): a PLACEMENT of the shared
 * `KnowledgeSheet`, the same component, tokens and measure as the 2D concept page. Nothing here
 * restyles the sheet or its parts; this file only places it and supplies what the museum does
 * differently (12.1 rule 3): what Close does (it closes the panel), and links that walk to the
 * exhibit instead of navigating.
 *
 * Close fills the sheet's action slot, as in 2D (DR-021 decision 4): the same `SheetCloseContent`
 * in the same box, so the Tab path from the h1 to the first citation marker passes the same stops in
 * both conditions (P13, P32). Escape closes the panel from anywhere inside it.
 *
 * Placement:
 *  - 1024 px and wider: docked right through the shared `SHEET_DOCK_CLASS` (the 2D sheet column
 *    uses the same class): full height below the chrome, opaque `--ground`, a 1 px `--rule-strong`
 *    left border OUTSIDE the 39.25rem sheet, no radius, shadow or blur, internal scroll, the
 *    scrollbar added to the width (parity checks P2, P30).
 *  - Below 1024 px (and at 200% zoom): full width and full height below the chrome, covering the
 *    scene, exactly mirroring the 2D column; the museum makes the scene overlays inert meanwhile.
 *
 * Content, in the sheet's own order: the exhibit concept's header and metadata, the layers
 * (`LayerTabs`, names and order from labels.ts), the field (claims through the shared `ClaimList`
 * with its figures and numbered citation markers, then comparison blocks), the ReferenceList of the
 * claims shown, `RelatedConcepts`, and, for
 * process stations, the shared `Pager` over the sequence. Text is the read model's, unchanged.
 */
import { useMemo, useRef, type ReactNode } from "react";

import {
  ClaimList,
  KnowledgeSheet,
  Pager,
  RelatedConcepts,
  SHEET_CLOSE_CLASS,
  SHEET_DOCK_CLASS,
  SheetCloseContent,
  SheetReferences,
  sheetTitleId,
  useSheetScrollbar,
  type FieldLayer,
  type RelatedLink,
  type SheetConcept,
} from "@/components/knowledge";
import { ConceptChooser as SharedConceptChooser } from "@/components/knowledge/concept-chooser";
import { ComparisonBlocks as SharedComparisonBlocks, LayerConceptHead as SharedLayerConceptHead, SequenceList as SharedSequenceList } from "@/components/knowledge/layer-parts";
import { buildPanelModel, type PanelTab, type TabEntry } from "@/features/immersive/panel-content";
import type { SceneExhibit, SceneModel } from "@/features/immersive/scene-model";
import { claimViewsOf, type PanelConcept, type PanelRelation } from "@/features/immersive/types";
import type { KnowledgeFigureData, SourceView } from "@/features/knowledge/read/view";
import { PANEL_TEXT } from "@/features/learning/strings";
import { cn } from "@/lib/utils";


/** A manifest cue that explains a relationship and guides along a route ("explain-and-guide"). */
export interface CausalNote {
  cueId: string;
  label: string;
  conceptTitle: string;
  explanation: string | null;
  effectElementId: string;
  relationshipId: string | null;
}

export interface InfoPanelProps {
  model: SceneModel;
  exhibit: SceneExhibit;
  concepts: Readonly<Record<string, PanelConcept>>;
  sources: Readonly<Record<string, SourceView>>;
  traditionNames: Readonly<Record<string, string>>;
  /** Knowledge figures by concept id (the payload's, resolved as in 2D). */
  figures?: Readonly<Record<string, readonly KnowledgeFigureData[]>>;
  tab: PanelTab;
  conceptId: string;
  /**
   * Guided routes of this exhibit's relationships. A related-concept link whose relationship has
   * one walks that route (the guidance the manifest compiled), otherwise straight to the exhibit.
   */
  causal: CausalNote[];
  /** Docked at 1024 px and wider; otherwise the panel covers the scene. */
  docked: boolean;
  onTab(tab: PanelTab, conceptId: string): void;
  onFocusConcept(conceptId: string): void;
  onClose(): void;
  onWalkToConcept(conceptId: string, relationshipId: string | null): void;
  /** `source`: the sheet's pager ("pager") or another link in it ("link", the default); DR-021 navigation source. */
  onWalkToElement(elementId: string, relationshipId: string | null, source?: "link" | "pager"): void;
  onFollowCausal(note: CausalNote): void;
  placedConceptIds: ReadonlySet<string>;
}

/** Id of the panel's scroll container (the StudyBar's skip target while the panel is open). */
export const MUSEUM_PANEL_ID = "museum-panel";

/** The sheet's width (39.25rem) in CSS px at the current root font size. */
function sheetWidthPx(): number {
  if (typeof window === "undefined") return 628;
  return 39.25 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
}

let scrollbarCache: number | null = null;
/** Width of a classic (space-taking) scrollbar on this device; 0 for overlay scrollbars. */
export function scrollbarWidthPx(): number {
  if (scrollbarCache !== null) return scrollbarCache;
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  // The same overflow rule as the panel, with content that overflows.
  probe.style.cssText = "position:fixed;top:0;left:0;width:100px;height:50px;overflow-y:scroll;visibility:hidden;pointer-events:none";
  probe.innerHTML = "<div style='height:200px'></div>";
  document.body.appendChild(probe);
  scrollbarCache = Math.max(0, probe.offsetWidth - probe.clientWidth);
  probe.remove();
  return scrollbarCache;
}

/** Rendered width of the docked panel: the sheet, its 1 px left border and the scroll gutter. */
export function dockedPanelWidthPx(): number {
  return sheetWidthPx() + 1 + scrollbarWidthPx();
}

function relatedLinkOf(r: PanelRelation): RelatedLink {
  return {
    relationshipId: r.relationshipId,
    type: r.type,
    semantics: r.semantics,
    direction: r.direction,
    label: r.label,
    concept: { id: r.conceptId, title: r.conceptTitle, type: r.conceptType, traditionSlug: r.conceptTraditionSlug },
    explanation: r.explanation,
    conditions: r.conditions,
    statedBy: r.statedBy,
  };
}

function sheetConceptOf(c: PanelConcept, traditionNames: Readonly<Record<string, string>>): SheetConcept {
  return {
    id: c.id,
    title: c.title,
    type: c.type,
    category: c.category,
    localTerms: c.localTerms,
    tradition: c.traditionSlug ? { slug: c.traditionSlug, name: traditionNames[c.traditionSlug] ?? c.traditionSlug } : null,
    verificationState: c.verificationState,
  };
}

export function InfoPanel(props: InfoPanelProps) {
  const { model, exhibit, concepts, sources, traditionNames, figures, tab, conceptId, docked, onTab, onClose } = props;
  const panel = useMemo(() => buildPanelModel(model, exhibit, concepts), [model, exhibit, concepts]);
  const own = concepts[exhibit.conceptId];
  const shown = concepts[conceptId];
  const scrollRef = useRef<HTMLElement>(null);

  // The panel's own scrollbar width is added to the docked width (see the file comment).
  useSheetScrollbar(scrollRef);

  const entries = panel.tabs.find((t) => t.tab === tab)?.entries ?? [];
  const walkEntry = shown && shown.id !== exhibit.conceptId ? entries.find((x) => x.conceptId === shown.id) : undefined;

  const shownClaims = useMemo(() => (shown ? claimViewsOf(shown.claims, sources) : []), [shown, sources]);

  const field = (
    <div data-slot="panel-concept" data-concept-id={shown?.id ?? conceptId} data-concept-key={shown?.key}>
      {entries.length > 1 ? <ConceptChooser entries={entries} concepts={concepts} selected={conceptId} onSelect={props.onFocusConcept} /> : null}
      {tab === "process" && panel.sequence ? <SequenceList sequence={panel.sequence} concepts={concepts} /> : null}
      {shown && shown.id !== exhibit.conceptId ? <LayerConceptHead concept={shown} traditionNames={traditionNames} walk={walkEntry?.elementId ? () => props.onWalkToElement(walkEntry.elementId!, walkEntry.relationshipId) : null} /> : null}
      {shown ? (
        <ClaimList conceptId={shown.id} claims={shownClaims} figures={figures?.[shown.id] ?? []} references="sheet" />
      ) : (
        <p className="text-reading text-ink-3">{PANEL_TEXT.notInSnapshot}</p>
      )}
      {shown?.comparison ? <ComparisonBlocks comparison={shown.comparison} traditionNames={traditionNames} /> : null}
    </div>
  );
  // Only the selected layer's content is rendered; the others are reached through LayerTabs.
  const layers: FieldLayer[] = panel.tabs.map((t) => ({ id: t.tab, content: t.tab === tab ? field : null }));

  const causalByRel = new Map(props.causal.filter((c) => c.relationshipId).map((c) => [c.relationshipId!, c]));
  const related = shown && shown.related.length > 0 ? (
    <RelatedConcepts
      conceptId={shown.id}
      traditionSlug={shown.traditionSlug}
      links={shown.related.flatMap((g) => g.relations.map(relatedLinkOf))}
      traditionNames={traditionNames}
      roomOrPageId={exhibit.roomId}
      headingId={`museum-related-${shown.id}`}
      renderLink={(link, content, className) => {
        if (!props.placedConceptIds.has(link.concept.id)) return null;
        const guided = shown.id === exhibit.conceptId ? causalByRel.get(link.relationshipId) : undefined;
        return (
          <button type="button" className={className} onClick={() => (guided ? props.onFollowCausal(guided) : props.onWalkToConcept(link.concept.id, link.relationshipId))}>
            {content}
          </button>
        );
      }}
    />
  ) : null;

  const seq = panel.sequence;
  const prevStop = seq ? seq.stops[seq.index - 1] : undefined;
  const nextStop = seq ? seq.stops[seq.index + 1] : undefined;
  const pagerItem = (s: { elementId: string; conceptId: string } | undefined) => (s ? { conceptId: s.conceptId, title: concepts[s.conceptId]?.title ?? exhibit.label, elementId: s.elementId } : null);
  const prev = pagerItem(prevStop);
  const next = pagerItem(nextStop);
  const pager =
    prev || next ? (
      <Pager
        prev={prev}
        next={next}
        renderLink={(item, _dir, content, className) => {
          const stop = item.conceptId === prev?.conceptId ? prev : next;
          return (
            <button type="button" className={className} onClick={() => stop && props.onWalkToElement(stop.elementId, null, "pager")}>
              {content}
            </button>
          );
        }}
      />
    ) : null;

  return (
    <aside
      ref={scrollRef}
      id={MUSEUM_PANEL_ID}
      tabIndex={-1}
      aria-labelledby={own ? sheetTitleId(own.id) : undefined}
      aria-label={own ? undefined : PANEL_TEXT.panelLabel}
      data-museum-keys="ui"
      data-slot="museum-info-panel"
      data-placement={docked ? "docked" : "full"}
      data-concept-key={own?.key}
      className={cn(
        "pointer-events-auto absolute inset-0 z-(--z-panel) overflow-y-scroll overscroll-contain bg-ground text-ink outline-none",
        docked && cn("left-auto", SHEET_DOCK_CLASS),
      )}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Escape inside the figure lightbox or another dialog closes that, not the panel.
        if ((e.target as Element | null)?.closest?.("dialog[open], [role=dialog]")) return;
        e.stopPropagation();
        onClose();
      }}
    >
      {own ? (
        <div className="relative mx-auto w-full max-w-[39.25rem]" data-slot="panel-sheet-frame">
          <KnowledgeSheet
            placement="panel"
            concept={sheetConceptOf(own, traditionNames)}
            step={exhibit.sequence ? { index: exhibit.sequence.index + 1, total: exhibit.sequence.count } : null}
            layers={layers}
            layerValue={tab}
            onLayerChange={(layer) => {
              const first = panel.tabs.find((t) => t.tab === layer)?.entries[0];
              if (first) onTab(layer, first.conceptId);
            }}
            references={shown ? <SheetReferences conceptId={shown.id} claims={shownClaims} /> : null}
            related={related}
            pager={pager}
            action={
              <button type="button" className={SHEET_CLOSE_CLASS} onClick={onClose} data-slot="sheet-close">
                <SheetCloseContent />
              </button>
            }
          />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[39.25rem] px-4 pt-6 pb-12 xs:px-6">
          <div className="flex justify-end">
            <button type="button" className={SHEET_CLOSE_CLASS} onClick={onClose} data-slot="sheet-close">
              <SheetCloseContent />
            </button>
          </div>
          <p className="text-reading text-ink-3">{PANEL_TEXT.notInSnapshot}</p>
        </div>
      )}
    </aside>
  );
}

/*
 * 3D adapters of the shared layer parts (src/components/knowledge/layer-parts.tsx and
 * concept-chooser.tsx, DESIGN.md 12.1 rule 1): they map the panel's data onto the shared
 * components' plain inputs and supply the 3D action (walk to the exhibit, 12.1 rule 3). The markup
 * exists once; the 2D concept page imports the same components (learning-2d/ui/layer-parts.tsx).
 */

/** When a layer holds several concepts: one is shown at a time (exposure is per concept). */
export function ConceptChooser({ entries, concepts, selected, onSelect }: { entries: readonly TabEntry[]; concepts: Readonly<Record<string, PanelConcept>>; selected: string; onSelect(conceptId: string): void }) {
  return <SharedConceptChooser entries={entries.map((e) => ({ conceptId: e.conceptId, title: concepts[e.conceptId]?.title ?? e.conceptId }))} selected={selected} onSelect={onSelect} />;
}

/** Process layer of a station: the ordered stops of its sequence, this one marked. */
export function SequenceList({ sequence, concepts }: { sequence: { stops: { elementId: string; conceptId: string }[]; index: number }; concepts: Readonly<Record<string, PanelConcept>> }) {
  return <SharedSequenceList steps={sequence.stops.map((s) => ({ key: s.elementId, title: concepts[s.conceptId]?.title ?? s.conceptId }))} currentIndex={sequence.index} />;
}

/**
 * Heading of a concept shown in a layer other than the exhibit's own (artisan, science, compare).
 * Its action walks to the concept's exhibit; a concept the museum does not place has none.
 */
export function LayerConceptHead({ concept, traditionNames, walk }: { concept: PanelConcept; traditionNames: Readonly<Record<string, string>>; walk: (() => void) | null }) {
  return (
    <SharedLayerConceptHead
      concept={{ id: concept.id, title: concept.title, type: concept.type, traditionSlug: concept.traditionSlug }}
      traditionNames={traditionNames}
      renderAction={
        walk
          ? (content: ReactNode, className: string) => (
              <button type="button" className={className} onClick={walk} data-slot="layer-concept-action">
                {content}
              </button>
            )
          : undefined
      }
    />
  );
}

/** "Compared Concepts" and "Similarities and Contrasts", as on the 2D concept page. */
export function ComparisonBlocks({ comparison, traditionNames }: { comparison: NonNullable<PanelConcept["comparison"]>; traditionNames: Readonly<Record<string, string>> }) {
  return <SharedComparisonBlocks compares={comparison.compares} links={comparison.links} traditionNames={traditionNames} />;
}
