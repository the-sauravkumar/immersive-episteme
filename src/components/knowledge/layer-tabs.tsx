"use client";

/**
 * LayerTabs (DESIGN.md 9.6): the ONE layer navigation of a concept in both conditions. Names and
 * order come only from `KNOWLEDGE_LAYERS` (src/features/learning/labels.ts): Overview, Artisan,
 * Process, Science, Compare. Underline tabs, each at least 44 px tall; the row wraps and never
 * scrolls sideways, so every layer name stays visible at 390 px. ARIA tabs pattern with a roving
 * tabindex: Arrow keys, Home and End move between tabs and select them (automatic activation).
 * Changes are instant (no transition).
 *
 * `LayeredField` is the stateful wrapper both placements use: the tabs plus one tabpanel that shows
 * the selected layer's content (pre-rendered nodes, so a server page can pass them). With
 * `telemetry`, it logs the same events the museum logged for its panel tabs:
 * `information_layer_opened {layerId}` on every selection and `knowledge_layer_selected {layer}`
 * for the artisan, process and science layers.
 */
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { KNOWLEDGE_LAYER_LABELS, orderLayers, type KnowledgeLayerId } from "@/features/learning/labels";
import { SHEET_TEXT } from "@/features/learning/strings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { cn } from "@/lib/utils";

export interface LayerTabsProps {
  /** Available layers (any order; rendered in the canonical order). */
  layers: readonly KnowledgeLayerId[];
  value: KnowledgeLayerId;
  onValueChange(layer: KnowledgeLayerId): void;
  /** Id of the tabpanel the tabs control. */
  panelId: string;
  /** Prefix of the tab element ids (`<idBase>-<layer>`). */
  idBase: string;
  className?: string;
}

export const layerTabId = (idBase: string, layer: KnowledgeLayerId) => `${idBase}-${layer}`;

export function LayerTabs({ layers, value, onValueChange, panelId, idBase, className }: LayerTabsProps) {
  const ordered = orderLayers(layers);
  const listRef = useRef<HTMLDivElement>(null);
  if (ordered.length < 2) return null;

  const focusTab = (layer: KnowledgeLayerId) => listRef.current?.ownerDocument.getElementById(layerTabId(idBase, layer))?.focus();
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = ordered.indexOf(value);
    let next: KnowledgeLayerId | undefined;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = ordered[(i + 1) % ordered.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = ordered[(i - 1 + ordered.length) % ordered.length];
    else if (e.key === "Home") next = ordered[0];
    else if (e.key === "End") next = ordered[ordered.length - 1];
    if (!next) return;
    e.preventDefault();
    onValueChange(next);
    focusTab(next);
  };

  return (
    <div ref={listRef} role="tablist" aria-label={SHEET_TEXT.layersLabel} data-slot="layer-tabs" className={cn("flex flex-wrap border-b border-rule", className)}>
      {ordered.map((layer) => {
        const selected = layer === value;
        return (
          <button
            key={layer}
            id={layerTabId(idBase, layer)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(layer)}
            onKeyDown={onKeyDown}
            className={cn(
              "text-ui -mb-px inline-flex min-h-11 items-center border-b-[3px] px-4",
              selected ? "border-indigo text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {KNOWLEDGE_LAYER_LABELS[layer]}
          </button>
        );
      })}
    </div>
  );
}

export interface FieldLayer {
  id: KnowledgeLayerId;
  content: ReactNode;
}

export interface LayeredFieldProps {
  layers: readonly FieldLayer[];
  /** Controlled selection (3D panel state); omit for the uncontrolled default (first layer). */
  value?: KnowledgeLayerId;
  onValueChange?(layer: KnowledgeLayerId): void;
  /** Rendered above the selected layer's content, inside the tabpanel (the "From the Sources" head). */
  head?: ReactNode;
  /** Logs layer selections (see the file comment); omit when the placement logs them itself. */
  telemetry?: { conceptId: string; roomOrPageId?: string; target?: string };
  className?: string;
}

export function LayeredField({ layers, value, onValueChange, head, telemetry, className }: LayeredFieldProps) {
  const available = orderLayers(layers.map((l) => l.id));
  const [own, setOwn] = useState<KnowledgeLayerId | undefined>(available[0]);
  const current = value ?? own ?? available[0];
  const base = `layers${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const panelId = `${base}-panel`;
  const tracker = useOptionalTelemetry();
  const select = (layer: KnowledgeLayerId) => {
    if (layer === current) return;
    setOwn(layer);
    onValueChange?.(layer);
    if (tracker && telemetry) {
      const where = { conceptId: telemetry.conceptId, ...(telemetry.roomOrPageId ? { roomOrPageId: telemetry.roomOrPageId } : {}), ...(telemetry.target ? { target: telemetry.target } : {}) };
      void tracker.informationLayerOpened({ ...where, metadata: { layerId: layer } });
      if (layer === "artisan" || layer === "process" || layer === "science") void tracker.knowledgeLayerSelected({ ...where, metadata: { layer } });
    }
  };
  const active = layers.find((l) => l.id === current) ?? layers[0];
  const tabbed = available.length > 1;
  return (
    <div className={className} data-slot="layered-field">
      {tabbed ? <LayerTabs layers={available} value={current!} onValueChange={select} panelId={panelId} idBase={base} /> : null}
      <div id={panelId} role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? layerTabId(base, current!) : undefined} className={tabbed ? "pt-6" : undefined}>
        {head}
        {active?.content}
      </div>
    </div>
  );
}
