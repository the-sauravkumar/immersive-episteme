"use client";

import { useLayoutEffect, type RefObject } from "react";

export const SHEET_DOCK_CLASS = "w-[calc(39.25rem+1px+var(--panel-sb,0px))] border-l border-lime-dim";
export const SHEET_DOCK_CLASS_LG = "lg:w-[calc(39.25rem+1px+var(--panel-sb,0px))] lg:border-l lg:border-lime-dim";

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
