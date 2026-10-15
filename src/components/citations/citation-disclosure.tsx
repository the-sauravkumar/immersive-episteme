"use client";

/**
 * CitationNote and CitationRecord (DESIGN.md 9.8): the ONE citation affordance of both learning
 * conditions. The 2D concept page and the 3D information panel render this same component under
 * every claim, so citation availability, wording, typography and the path to the record are
 * identical (DR-015 rule 3; parity checks P1, P5, P11, P13).
 *
 * - Collapsed (one per citation, directly under its claim): a full-width native <button>, at least
 *   44 px tall, left-aligned and borderless: a chevron, the word "Source" (eyebrow) and the short
 *   label derived in the view layer (`shortCitationLabel`: first author or publisher, year,
 *   locator). The label wraps; it is never truncated mid-word.
 * - Expanded, inline under the note at the claim measure: the verbatim quote at claim size in
 *   Source Serif 4 with a 2 px indigo rule (each supporting passage its own block), a two-column
 *   record (Title, Author, Publisher, Year, Locator, Kind of Source, Reliability, Accessed), and
 *   "Open the source" as a 44 px link. Instant: no transition (study zero-motion rule).
 * - Escape inside the record closes it and returns focus to the note. Non-modal: it never covers
 *   or pauses the learning content, and opening it does not end the concept's exposure interval.
 * - Telemetry `citation_opened` / `citation_closed` (conceptId, sourceId, claimIndex, openMs) when
 *   a <TelemetryProvider> is present; works without one (CMS proof, tests).
 * - Every claim shows its own note, also when several claims cite the same source.
 */
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";

import { shortCitationLabel, type Citation } from "@/features/knowledge/read/view";
import { humanise } from "@/features/learning/labels";
import { CITATION_TEXT } from "@/features/learning/strings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { scriptRuns } from "@/lib/text/script-runs";
import { cn } from "@/lib/utils";

export interface CitationNoteProps {
  citation: Citation;
  /** Concept whose claim cites this source (telemetry attribution). */
  conceptId: string;
  /** 0-based position of the claim within the concept (ClaimView.position). */
  claimIndex: number;
  className?: string;
}

/** Deprecated name kept for existing call sites; identical to CitationNoteProps. */
export type CitationDisclosureProps = CitationNoteProps;

/** The collapsed note under a claim, which expands its CitationRecord inline. */
export function CitationNote({ citation, conceptId, claimIndex, className }: CitationNoteProps) {
  const [open, setOpen] = useState(false);
  const recordId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openedAt = useRef<number | null>(null);
  const telemetry = useOptionalTelemetry();
  const label = shortCitationLabel(citation);

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

  const onRecordKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      toggle(false);
      buttonRef.current?.focus();
    }
  };

  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className={cn("w-full", className)} data-slot="citation-note" data-citation-source={citation.id}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={recordId}
        aria-label={`${CITATION_TEXT.source}: ${label}`}
        onClick={() => toggle(!open)}
        className="group flex min-h-11 w-full items-start gap-2 pt-1 pb-2 text-left text-ink-3 hover:text-ink"
      >
        <Chevron aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          <span className="text-eyebrow mr-2">{CITATION_TEXT.source}</span>
          <span className="text-source underline decoration-1 underline-offset-[3px] group-hover:decoration-2">{label}</span>
        </span>
      </button>
      <div id={recordId} role="region" aria-label={`${CITATION_TEXT.detailsLabel}: ${label}`} hidden={!open} onKeyDown={onRecordKeyDown} data-slot="citation-record">
        {open ? <CitationRecord citation={citation} /> : null}
      </div>
    </div>
  );
}

/** The expanded record: verbatim evidence at claim size, then the source record and its link. */
export function CitationRecord({ citation }: { citation: Citation }) {
  const rows: [string, string | null][] = [
    [CITATION_TEXT.rows.title, citation.title],
    [CITATION_TEXT.rows.author, citation.author],
    [CITATION_TEXT.rows.publisher, citation.publisher],
    [CITATION_TEXT.rows.year, citation.year != null && citation.year > 0 ? String(citation.year) : null],
    [CITATION_TEXT.rows.locator, citation.locator],
    [CITATION_TEXT.rows.kind, humanise(citation.kind)],
    [CITATION_TEXT.rows.reliability, citation.reliability ? humanise(citation.reliability) : null],
    [CITATION_TEXT.rows.accessed, citation.accessedOn],
  ];
  return (
    <div className="pb-4 pl-6">
      {citation.passages.length > 0 ? (
        <ul className="flex flex-col gap-4" aria-label={CITATION_TEXT.passagesLabel}>
          {citation.passages.map((p, i) => (
            <li key={i}>
              <Quote text={p.quote} />
              <p className="text-credit mt-1 pl-[18px]">{p.locator}</p>
              {p.note ? (
                <p className="text-credit pl-[18px]">
                  {CITATION_TEXT.note} {p.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : citation.quote ? (
        <Quote text={citation.quote} />
      ) : null}
      <dl className="mt-4 grid grid-cols-1 gap-x-4 xs:grid-cols-[9rem_minmax(0,1fr)]">
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-dl-label pt-1 xs:pt-0.5">{k}</dt>
              <dd className="text-dl-value mb-2 break-words xs:mb-1">{v}</dd>
            </div>
          ))}
      </dl>
      {citation.url ? (
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ui mt-2 inline-flex min-h-11 items-center gap-2 text-indigo underline decoration-1 underline-offset-[3px] hover:text-indigo-hover hover:decoration-2"
        >
          <ExternalLink aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
          {CITATION_TEXT.open}
          <span className="sr-only"> {CITATION_TEXT.newTab}</span>
        </a>
      ) : null}
    </div>
  );
}

/**
 * The verbatim quote: claim size, Source Serif 4 roman, typographic quotes, 2 px indigo rule. An
 * Arabic-script run (a Sindhi or Persian spelling quoted by the source) is set right-to-left in its
 * own `<span lang dir="rtl">` with the system Arabic stack (DESIGN.md 5.1); the text is unchanged.
 */
function Quote({ text }: { text: string }) {
  const runs = scriptRuns(text);
  return (
    <blockquote className="text-quote border-l-2 border-indigo pl-4 text-ink">
      {"“"}
      {runs.map((r, i) =>
        r.rtl ? (
          <span key={i} lang={r.lang} dir="rtl">
            {r.text}
          </span>
        ) : (
          r.text
        ),
      )}
      {"”"}
    </blockquote>
  );
}

/** Deprecated alias of CitationNote (same component, same props). */
export const CitationDisclosure = CitationNote;
