"use client";

/**
 * Time accounting for 2D pages (data-and-telemetry-layer §4c), through THE exposure rule of both
 * conditions (`useSheetTiming`, telemetry/client/sheet-timing.ts; DR-050).
 *
 * <ExposureRegion> wraps the shown concept's view inside the KnowledgeSheet of a concept page.
 * Exposure runs while it is mounted, i.e. while the concept's sheet is open, wherever the sheet is
 * scrolled, exactly as the 3D panel counts while it is open. While a StudyBar sheet (Contents,
 * Search) covers the page, the learner is navigating ("menu"), as the full Plan over the 3D panel
 * counts as navigation; <ChromeOverlayProvider> carries that state from the StudyBar to the region.
 * Tab hidden and window blur pause the open interval automatically (the tracker). A concept page
 * mounts one region at a time (the shown layer concept), so exposure is attributed to exactly one
 * concept.
 *
 * <NavigationPhase> marks pages with no concept content (catalogue, tradition and category pages,
 * the comparisons list, search results) as navigation for as long as they are shown.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { ExposureLayer, NavigationSurface } from "@/features/telemetry/contracts";
import { useNavigationPhase } from "@/features/telemetry/client/provider";
import { useSheetTiming } from "@/features/telemetry/client/sheet-timing";
import type { IntervalContext } from "@/features/telemetry/client/timing";

interface ChromeOverlay {
  /** A StudyBar sheet covers the page. */
  open: boolean;
  setOpen(open: boolean): void;
}

const ChromeOverlayContext = createContext<ChromeOverlay>({ open: false, setOpen: () => {} });

/** Holds the "a StudyBar sheet is open" state for the StudyBar and the page's exposure region. */
export function ChromeOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <ChromeOverlayContext.Provider value={value}>{children}</ChromeOverlayContext.Provider>;
}

export function useChromeOverlay(): ChromeOverlay {
  return useContext(ChromeOverlayContext);
}

export function ExposureRegion({
  conceptId,
  layer,
  context,
  navigationSurface = "menu",
  className,
  children,
}: {
  conceptId: string;
  layer: ExposureLayer;
  context: IntervalContext;
  navigationSurface?: NavigationSurface;
  className?: string;
  children: ReactNode;
}) {
  const overlay = useChromeOverlay();
  useSheetTiming({
    state: { sheetOpen: true, overlayOpen: overlay.open },
    conceptId,
    layer,
    exposureContext: context,
    navigationSurface: overlay.open ? "menu" : navigationSurface,
    navigationContext: { roomOrPageId: context.roomOrPageId, traditionId: context.traditionId },
  });
  // A plain <div>, not a labelled <section>: the region is a measuring frame, not a landmark, so
  // the sheet's accessibility tree is the 3D panel's (no extra region in one condition only).
  return (
    <div className={className} data-exposure-concept={conceptId} data-exposed={overlay.open ? "false" : "true"}>
      {children}
    </div>
  );
}

export function NavigationPhase({ surface, context }: { surface: NavigationSurface; context?: IntervalContext }) {
  useNavigationPhase(surface, { context });
  return null;
}
