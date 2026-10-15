"use client";

/**
 * The two client islands of the KnowledgeSheet (DESIGN.md 9.11):
 *
 *  - `SheetTitle`: the concept h1 (`text-title`, `tabindex="-1"`). When a concept opens, focus
 *    moves to it in BOTH conditions (2D after navigation, 3D on panel open; parity check P27), so
 *    the keyboard path from the title to the first claim and citation marker is identical (P13).
 *  - `SheetProgress`: the 2 px `--ink` on `--rule` reading-progress bar under the header row,
 *    `role="progressbar"`, no transition. It measures the sheet's own scroll container, found the
 *    same way in both placements: the nearest scrollable ancestor (the 3D panel), else the window
 *    (the 2D page). At the end of the container it reads 100 (P25).
 */
import { useEffect, useRef, useState } from "react";

import { SHEET_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export function SheetTitle({ id, title, focusKey, autoFocus = true, as: Heading = "h1" }: { id: string; title: string; focusKey: string; autoFocus?: boolean; as?: "h1" | "h2" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [focusKey, autoFocus]);
  return (
    <Heading ref={ref} id={id} tabIndex={-1} className="text-title mt-1 text-ink outline-offset-4">
      {titleCase(title)}
    </Heading>
  );
}

function scrollContainerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

export function SheetProgress({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const container = scrollContainerOf(el);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = container ? container.scrollTop : window.scrollY;
      const range = container ? container.scrollHeight - container.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      setPercent(range <= 1 ? 100 : Math.min(100, Math.max(0, Math.round((top / range) * 100))));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    const target: HTMLElement | Window = container ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    ro?.observe(container ?? document.documentElement);
    return () => {
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={SHEET_TEXT.readingProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      data-slot="reading-progress"
      className={cn("h-0.5 w-full bg-rule hc:bg-sunk", className)}
    >
      <div className="h-full bg-ink" style={{ width: `${percent}%` }} />
    </div>
  );
}
