"use client";

/**
 * The docked sheet column (DR-021 7.2), SHARED by both conditions so the KnowledgeSheet sits at the
 * same x, width and top in both (P30): right-docked, the sheet's 39.25rem plus a 1 px
 * `--rule-strong` left edge plus the column's own scrollbar (always present, `overflow-y: scroll`,
 * 0 px where scrollbars overlay), so the claims keep the full measure (P2). `scrollbar-gutter:
 * stable` is NOT used: Chromium reserves a 15 px gutter with it even where scrollbars overlay.
 *
 * The 3D information panel applies `SHEET_DOCK_CLASS` while docked (1024 px and wider); the 2D
 * sheet column applies it from the same width (`lg:` classes in the 2D spread).
 */
import { useLayoutEffect, type RefObject } from "react";

/** Width and edge of the docked sheet column (the scrollbar width comes from `--panel-sb`). */
export const SHEET_DOCK_CLASS = "w-[calc(39.25rem+1px+var(--panel-sb,0px))] border-l border-rule-strong";
/**
 * The same, from 1024 px (the 2D sheet column, which is in the page flow below that width). Written
 * out literally so the class scanner sees it; tests/unit/knowledge/place-rail-and-dock.test.tsx
 * keeps it equal to `SHEET_DOCK_CLASS`.
 */
export const SHEET_DOCK_CLASS_LG = "lg:w-[calc(39.25rem+1px+var(--panel-sb,0px))] lg:border-l lg:border-rule-strong";

/**
 * Measures the column's scrollbar and stores it in `--panel-sb` on `varTarget` (default: the
 * column itself), so the width above adds it. Re-measured on resize (the column may switch between
 * docked and full width).
 */
export function useSheetScrollbar(ref: RefObject<HTMLElement | null>, varTarget?: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const st = getComputedStyle(el);
      const sb = Math.max(0, el.offsetWidth - el.clientWidth - (parseFloat(st.borderLeftWidth) || 0) - (parseFloat(st.borderRightWidth) || 0));
      (varTarget?.current ?? el).style.setProperty("--panel-sb", `${sb}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref, varTarget]);
}
