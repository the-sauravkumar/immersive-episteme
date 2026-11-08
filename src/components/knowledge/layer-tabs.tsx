"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { KNOWLEDGE_LAYER_LABELS, orderLayers, type KnowledgeLayerId } from "@/features/learning/labels";
import { SHEET_TEXT } from "@/features/learning/strings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { cn } from "@/lib/utils";

interface LayerTabsProps {
  layers: readonly KnowledgeLayerId[];
  value: KnowledgeLayerId;
  onValueChange(layer: KnowledgeLayerId): void;
  panelId: string;
  idBase: string;
  className?: string;
}

const layerTabId = (idBase: string, layer: KnowledgeLayerId) => `${idBase}-${layer}`;

function LayerTabs({ layers, value, onValueChange, panelId, idBase, className }: LayerTabsProps) {
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
    <div ref={listRef} role="tablist" aria-label={SHEET_TEXT.layersLabel} data-slot="layer-tabs" className={cn("flex flex-wrap border-b border-line", className)}>
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
              "t-label -mb-px inline-flex min-h-11 items-center border-b-[3px] px-4",
              selected ? "border-turmeric font-bold text-lime" : "border-transparent text-lime-dim hover:text-lime",
            )}
          >
            <span className="ie-reserve-bold" data-label={KNOWLEDGE_LAYER_LABELS[layer]}>
              {KNOWLEDGE_LAYER_LABELS[layer]}
            </span>
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
  value?: KnowledgeLayerId;
  onValueChange?(layer: KnowledgeLayerId): void;
  head?: ReactNode;
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
