"use client";

/**
 * Section disclosure of the 2D tradition page (DESIGN.md 9.13; progressive disclosure, master spec
 * §7.2): a 56 px row within the sheet width, a 20 px chevron in a 44 px box at the left edge and
 * the section label in `text-h2`, as the heading's native button (Enter/Space; aria-expanded,
 * aria-controls). No concept count (12.3 rule 13: the museum rooms show none). Opens instantly.
 *
 * Opening and closing log `information_layer_opened/closed` with `layerId` (EVT-04) and the open
 * duration. A section opens by itself when the URL hash targets it (`#section-<id>`, used by the
 * Contents sheet and the concept page's "Up to <parent>"), and focus moves to its button.
 */
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { useStableTracker } from "./use-stable-tracker";

export function DisclosureSection({
  sectionId,
  title,
  pageId,
  traditionId,
  defaultOpen = false,
  headingLevel = 2,
  children,
}: {
  sectionId: string;
  title: string;
  pageId: string;
  traditionId?: string;
  defaultOpen?: boolean;
  headingLevel?: 2 | 3;
  children: ReactNode;
}) {
  const tracker = useStableTracker();
  const [open, setOpen] = useState(defaultOpen);
  const openedAt = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const anchor = `section-${sectionId}`;
  const layerId = `section:${sectionId}`;

  const toggle = (next: boolean) => {
    setOpen(next);
    const where = { roomOrPageId: pageId, ...(traditionId ? { traditionId } : {}) };
    if (next) {
      openedAt.current = performance.now();
      void tracker.informationLayerOpened({ ...where, metadata: { layerId } });
    } else {
      const since = openedAt.current;
      openedAt.current = null;
      const openMs = since === null ? undefined : Math.max(0, Math.floor(performance.now() - since));
      void tracker.informationLayerClosed({ ...where, metadata: { layerId, ...(openMs === undefined ? {} : { openMs }) } });
    }
  };
  const latest = useRef({ toggle, open });
  useEffect(() => {
    latest.current = { toggle, open };
  });

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash !== `#${anchor}`) return;
      if (!latest.current.open) {
        latest.current.open = true;
        latest.current.toggle(true);
      }
      buttonRef.current?.focus();
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [anchor]);

  const Heading = headingLevel === 2 ? "h2" : "h3";
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section id={anchor} aria-labelledby={`${anchor}-heading`} data-slot="section-disclosure" className="border-b border-rule">
      <Heading id={`${anchor}-heading`} className="m-0">
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => toggle(!open)}
          className={cn("flex min-h-14 w-full items-center gap-1 py-1.5 pr-2 text-left text-ink hover:bg-sunk", headingLevel === 2 ? "text-h2" : "text-h3")}
        >
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center">
            <Chevron strokeWidth={1.75} className="size-5" />
          </span>
          <span className="min-w-0 flex-1">{titleCase(title)}</span>
        </button>
      </Heading>
      <div id={panelId} hidden={!open} className="pb-8 pl-11">
        {children}
      </div>
    </section>
  );
}
