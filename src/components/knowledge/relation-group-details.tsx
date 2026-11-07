"use client";

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
      className="ie-disclosure mt-1"
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
      <summary className="t-label flex min-h-11 cursor-pointer items-center gap-2 text-lime-dim hover:text-lime">
        <Chevron aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
        {SHEET_TEXT.aboutLinks}
        <span aria-hidden="true" className="t-s text-lime-dim">
          <span className="ie-disclosure__show">Show</span>
          <span className="ie-disclosure__hide">Hide</span>
        </span>
      </summary>
      <div className="mb-2 ml-7">{children}</div>
    </details>
  );
}
