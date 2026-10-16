"use client";

/**
 * THE exposure rule of both learning conditions (DR-050; data-and-telemetry-layer §4c;
 * condition-equivalence E3). One rule, one implementation, defined on the shared KnowledgeSheet:
 *
 *   content exposure runs while a concept's KnowledgeSheet is OPEN and no navigation overlay
 *   covers it; at every other moment of the learning phase the learner is navigating.
 *
 *  - 2D: the sheet is open while the concept page is shown; the overlays are the StudyBar's
 *    Contents and Search sheets.
 *  - 3D: the sheet is open while the information panel is open; the overlay is the full Plan
 *    dialog (the minimap beside the panel is not an overlay, as the 2D rail and index beside the
 *    sheet are not).
 *
 * Where the sheet is scrolled does not matter in either condition: the title, metadata, layer
 * tabs, sequence list, claims, figures, references and related concepts are all the sheet's
 * content, the same in both (the earlier 2D-only "half of the claims region in view" rule counted
 * the first claims of a just-opened 2D concept as navigation, and the reference list as navigation
 * in 2D but as exposure in 3D). Tab hidden and window blur pause the open interval in both (the
 * tracker), and modal screens pause it (usePauseWhile).
 */
import type { ExposureLayer, NavigationSurface } from "@/features/telemetry/contracts";

import { useContentExposure, useNavigationPhase } from "./provider";
import type { IntervalContext } from "./timing";

export interface SheetTimingState {
  /** A concept's KnowledgeSheet is open (2D: the concept page is shown; 3D: the panel is open). */
  sheetOpen: boolean;
  /** A navigation overlay covers the sheet (2D: Contents or Search; 3D: the full Plan). */
  overlayOpen: boolean;
}

/** What the time counts as now: exposure of the open sheet's concept, or navigation. */
export function sheetTimingKind(s: SheetTimingState): "exposure" | "navigation" {
  return s.sheetOpen && !s.overlayOpen ? "exposure" : "navigation";
}

/**
 * Applies the rule: an exposure interval for `conceptId` while `sheetTimingKind` is "exposure",
 * a navigation interval on `navigationSurface` otherwise. `enabled` false (3D: not exploring) runs
 * neither. Only one interval is ever open (the tracker).
 */
export function useSheetTiming(opts: {
  enabled?: boolean;
  state: SheetTimingState;
  conceptId: string | null;
  layer: ExposureLayer;
  exposureContext?: IntervalContext;
  navigationSurface: NavigationSurface;
  navigationContext?: IntervalContext;
}): void {
  const enabled = opts.enabled ?? true;
  const kind = sheetTimingKind(opts.state);
  const exposed = enabled && kind === "exposure" && !!opts.conceptId;
  useContentExposure(opts.conceptId, opts.layer, { active: exposed, context: opts.exposureContext });
  useNavigationPhase(opts.navigationSurface, { active: enabled && !exposed, context: opts.navigationContext });
}
