"use client";

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
    <Heading ref={ref} id={id} tabIndex={-1} className="t-h3 mt-1 text-lime outline-offset-4">
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
      className={cn("h-0.5 w-full bg-line", className)}
    >
      <div className="h-full bg-lime" style={{ width: `${percent}%` }} />
    </div>
  );
}
