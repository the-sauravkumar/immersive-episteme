"use client";

/**
 * Time accounting for 2D pages (data-and-telemetry-layer §4c; lead decision "content in view").
 *
 * <ExposureRegion> wraps a concept's content area (its claims). Exposure runs while the region
 * is IN VIEW: at least half of the region is inside the viewport, or (for a region taller than
 * the viewport) the region fills at least half of the viewport. While it is out of view the page
 * is a navigation surface ("menu": related links, pager, breadcrumbs). Tab hidden and window blur
 * pause the open interval automatically (the tracker). Only one interval is ever open, and a
 * page has at most one exposure region, so exposure is attributed to exactly one concept. A page
 * that shows several concepts' claims (the comparisons page) puts its regions in an
 * <ExposureGroup>, which lets exactly ONE of them count at a time: the in-view region with the
 * most visible height (the first in the page on a tie); with none in view, the page is navigation.
 *
 * <NavigationPhase> marks pages with no concept content (catalogue, categories, comparison
 * index, search results) as navigation for as long as they are shown.
 *
 * While a StudyBar sheet (Contents, Search) covers the page, the learner is navigating, not
 * reading: <ChromeOverlayProvider> carries that state from the StudyBar to the region, which then
 * counts navigation ("menu") instead of exposure, and resumes exposure when the sheet closes.
 */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";

import type { ExposureLayer, NavigationSurface } from "@/features/telemetry/contracts";
import { useContentExposure, useNavigationPhase } from "@/features/telemetry/client/provider";
import type { IntervalContext } from "@/features/telemetry/client/timing";

/** Fraction of the region (or of the viewport, for tall regions) that must be visible. */
export const IN_VIEW_FRACTION = 0.5;
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20);

/** The in-view rule for one IntersectionObserver entry. */
export function isInView(entry: Pick<IntersectionObserverEntry, "isIntersecting" | "intersectionRatio" | "intersectionRect" | "rootBounds">): boolean {
  if (!entry.isIntersecting) return false;
  if (entry.intersectionRatio >= IN_VIEW_FRACTION) return true;
  const viewport = entry.rootBounds?.height ?? (typeof window === "undefined" ? 0 : window.innerHeight);
  return viewport > 0 && entry.intersectionRect.height >= viewport * IN_VIEW_FRACTION;
}

/** The in-view rule for a measured rectangle (scroll updates). */
export function rectInView(rect: { top: number; bottom: number; height: number }, viewportHeight: number): boolean {
  const visible = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  if (visible <= 0 || rect.height <= 0) return false;
  return visible >= rect.height * IN_VIEW_FRACTION || visible >= viewportHeight * IN_VIEW_FRACTION;
}

/**
 * True while the element meets the in-view rule. IntersectionObserver reports entering and
 * leaving; while the element intersects, scroll and resize re-measure it, so regions taller than
 * the viewport are judged exactly (observer thresholds alone are too coarse for them). Without
 * IntersectionObserver the region counts as in view.
 */
export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    let intersecting = false;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (intersecting) setInView(rectInView(el.getBoundingClientRect(), window.innerHeight));
    };
    const onScroll = () => {
      if (intersecting && frame === 0) frame = requestAnimationFrame(measure);
    };
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        intersecting = last.isIntersecting;
        setInView(isInView(last));
      },
      { threshold: THRESHOLDS },
    );
    io.observe(el);
    // Capture: the sheet column scrolls internally from 1024 px (DR-021); its scroll events do not bubble.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
      setInView(false);
    };
  }, []);
  const observable = useSyncExternalStore(noSubscription, hasIntersectionObserver, () => true);
  return [ref, observable ? inView : true];
}

const noSubscription = () => () => {};
const hasIntersectionObserver = () => typeof IntersectionObserver !== "undefined";

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

// ---------------------------------------------------------------------------------------
// Several regions on one page: exactly one counts at a time
// ---------------------------------------------------------------------------------------

interface ExposureGroupValue {
  /** The region that counts now (its registration id), or null. */
  active: string | null;
  register(id: string, el: HTMLElement): () => void;
}

const ExposureGroupContext = createContext<ExposureGroupValue | null>(null);

/** The region that counts among measured rectangles (in document order): the in-view one with the most visible height. */
export function pickActiveRegion(rects: readonly { id: string; top: number; bottom: number; height: number }[], viewportHeight: number): string | null {
  let best: string | null = null;
  let bestVisible = 0;
  for (const r of rects) {
    if (!rectInView(r, viewportHeight)) continue;
    const visible = Math.min(r.bottom, viewportHeight) - Math.max(r.top, 0);
    if (visible > bestVisible) {
      best = r.id;
      bestVisible = visible;
    }
  }
  return best;
}

export function ExposureGroup({
  navigationSurface = "catalogue",
  context,
  children,
}: {
  navigationSurface?: NavigationSurface;
  /** Page context of the navigation interval while no region counts. */
  context: Pick<IntervalContext, "roomOrPageId" | "traditionId" | "category">;
  children: ReactNode;
}) {
  const regions = useRef(new Map<string, HTMLElement>());
  const [active, setActive] = useState<string | null>(null);
  const frame = useRef(0);
  const measure = useCallback(() => {
    frame.current = 0;
    const rects = [...regions.current.entries()]
      .sort(([, a], [, b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map(([id, el]) => {
        const r = el.getBoundingClientRect();
        return { id, top: r.top, bottom: r.bottom, height: r.height };
      });
    setActive(pickActiveRegion(rects, window.innerHeight));
  }, []);
  const schedule = useCallback(() => {
    if (frame.current === 0) frame.current = requestAnimationFrame(measure);
  }, [measure]);
  useEffect(() => {
    schedule();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    ro?.observe(document.documentElement);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [schedule]);
  const register = useCallback(
    (id: string, el: HTMLElement) => {
      regions.current.set(id, el);
      schedule();
      return () => {
        regions.current.delete(id);
        schedule();
      };
    },
    [schedule],
  );
  const value = useMemo(() => ({ active, register }), [active, register]);
  const overlay = useChromeOverlay();
  useNavigationPhase(overlay.open ? "menu" : navigationSurface, { active: overlay.open || active === null, context });
  return <ExposureGroupContext.Provider value={value}>{children}</ExposureGroupContext.Provider>;
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
  const [ref, ownInView] = useInView<HTMLDivElement>();
  const overlay = useChromeOverlay();
  const group = useContext(ExposureGroupContext);
  const groupId = useId();
  const register = group?.register;
  useEffect(() => {
    if (register && ref.current) return register(groupId, ref.current);
  }, [register, groupId, ref]);
  // In a group, the group decides which ONE region counts and owns the navigation interval.
  const inView = group ? group.active === groupId : ownInView;
  const exposed = inView && !overlay.open;
  useContentExposure(conceptId, layer, { active: exposed, context });
  useNavigationPhase(overlay.open ? "menu" : navigationSurface, { active: !group && !exposed, context: { roomOrPageId: context.roomOrPageId, traditionId: context.traditionId } });
  // A plain <div>, not a labelled <section>: the region is a measuring frame, not a landmark, so
  // the sheet's accessibility tree is the 3D panel's (no extra region in one condition only).
  return (
    <div ref={ref} className={className} data-exposure-concept={conceptId} data-in-view={inView ? "true" : "false"}>
      {children}
    </div>
  );
}

export function NavigationPhase({ surface, context }: { surface: NavigationSurface; context?: IntervalContext }) {
  useNavigationPhase(surface, { context });
  return null;
}
