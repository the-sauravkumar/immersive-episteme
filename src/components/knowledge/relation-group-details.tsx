"use client";

/**
 * "About these links" (DESIGN.md 9.12): ONE 44 px native disclosure per relation-verb group in
 * `RelatedConcepts`, holding each link's own explanation, conditions and the sources that state
 * it. Opening and closing are logged as an information layer when a telemetry provider is present
 * (`layerId: rels:<TYPE>:<direction>`), identically in both conditions. Instant (no transition).
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { SHEET_TEXT } from "@/features/learning/strings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";

export function RelationGroupDetails({ layerId, conceptId, roomOrPageId, children }: { layerId: string; conceptId: string; roomOrPageId?: string; children: ReactNode }) {
  const tracker = useOptionalTelemetry();
  const openedAt = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <details
      data-slot="relation-group-details"
      className="mt-1"
      onToggle={(e) => {
        const isOpen = e.currentTarget.open;
        setOpen(isOpen);
        if (!tracker) return;
        const where = { conceptId, ...(roomOrPageId ? { roomOrPageId } : {}) };
        if (isOpen) {
          openedAt.current = performance.now();
          void tracker.informationLayerOpened({ ...where, metadata: { layerId } });
        } else {
          const since = openedAt.current;
          openedAt.current = null;
          const openMs = since === null ? undefined : Math.max(0, Math.floor(performance.now() - since));
          void tracker.informationLayerClosed({ ...where, metadata: { layerId, ...(openMs === undefined ? {} : { openMs }) } });
        }
      }}
    >
      <summary className="text-ui flex min-h-11 cursor-pointer list-none items-center gap-2 text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        <Chevron aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />
        {SHEET_TEXT.aboutLinks}
      </summary>
      <div className="mb-2 ml-6 border-l-2 border-rule pl-4">{children}</div>
    </details>
  );
}
