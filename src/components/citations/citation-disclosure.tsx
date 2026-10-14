"use client";

/**
 * CitationDisclosure: the ONE citation affordance for both learning conditions (2D pages and the
 * 3D information panel render the same component, so citation availability is equivalent).
 *
 * - Collapsed by default; a native <button> with aria-expanded/aria-controls (Enter and Space
 *   toggle it; Escape inside the details closes them and returns focus to the button).
 * - Non-modal and inline: it never covers, blocks or pauses the learning content, and opening it
 *   does not end the concept's exposure interval (the citation is part of the content).
 * - Expanded, it shows the full source details from the snapshot: title, author(s), publisher,
 *   year, locator (page/section), the verbatim quote when the claim has one, kind, reliability,
 *   and the link. Labels come from `Citation.label`, never the uuid.
 * - Telemetry: `citation_opened` / `citation_closed` (conceptId, sourceId, claimIndex, openMs)
 *   when a <TelemetryProvider> is present; works without one (CMS preview, tests).
 */
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";

import type { Citation } from "@/features/knowledge/read/view";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { cn } from "@/lib/utils";

export interface CitationDisclosureProps {
  citation: Citation;
  /** Concept whose claim cites this source (telemetry attribution). */
  conceptId: string;
  /** 0-based position of the claim within the concept (ClaimView.position). */
  claimIndex: number;
  className?: string;
}

const humanise = (code: string) => code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, " ");

export function CitationDisclosure({ citation, conceptId, claimIndex, className }: CitationDisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openedAt = useRef<number | null>(null);
  const telemetry = useOptionalTelemetry();

  const toggle = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!telemetry) return;
      const metadata = { sourceId: citation.id, claimIndex };
      if (next) {
        openedAt.current = performance.now();
        void telemetry.citationOpened({ conceptId, metadata });
      } else {
        const openMs = openedAt.current === null ? undefined : Math.max(0, Math.floor(performance.now() - openedAt.current));
        openedAt.current = null;
        void telemetry.citationClosed({ conceptId, metadata: { ...metadata, ...(openMs === undefined ? {} : { openMs }) } });
      }
    },
    [telemetry, citation.id, claimIndex, conceptId],
  );

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      toggle(false);
      buttonRef.current?.focus();
    }
  };

  const rows: [string, string | null][] = [
    ["Title", citation.title],
    ["Author", citation.author],
    ["Publisher", citation.publisher],
    ["Year", citation.year != null ? String(citation.year) : null],
    ["Locator", citation.locator],
    ["Kind of source", humanise(citation.kind)],
    ["Reliability", citation.reliability ? humanise(citation.reliability) : null],
    ["Accessed", citation.accessedOn],
  ];

  return (
    <div className={cn("text-sm", className)} data-citation-source={citation.id}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => toggle(!open)}
        className="inline-flex items-center gap-1 rounded-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        <span>Source: {citation.label}</span>
      </button>
      <div id={panelId} role="region" aria-label={`Source details: ${citation.label}`} hidden={!open} onKeyDown={onPanelKeyDown} className="mt-2 rounded-md border bg-muted/40 p-3">
        {open ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {rows
                .filter((r): r is [string, string] => !!r[1])
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
            {citation.quote ? <blockquote className="mt-2 border-l-2 pl-3 italic">“{citation.quote}”</blockquote> : null}
            {citation.url ? (
              <p className="mt-2">
                <a href={citation.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  Open the source<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
