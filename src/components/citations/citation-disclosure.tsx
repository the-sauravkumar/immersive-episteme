"use client";

/**
 * CitedClaim and CitationRecord (DESIGN.md 9.9; DR-022 Addendum A): the ONE citation affordance of
 * both learning conditions. The 2D concept page and the 3D information panel render this same
 * component for every claim (through the shared ClaimList), so citation availability, wording,
 * typography and the path to the evidence are identical (DR-015 rule 3; parity checks P1, P5, P11,
 * P13).
 *
 * - The claim paragraph ends with one quiet numbered marker per citation, "[1]", in `text-ui` ink-2
 *   with tabular figures. The marker is a native `<button aria-expanded>` with a 44 x 44 px box (the
 *   hit area comes from its own padding box; negative block margins keep the 30 px reading line
 *   box, so a marker never opens up the line spacing). Its accessible name is "Source 1: <short
 *   label>", which contains the visible number (WCAG 2.5.3 label in name).
 *   The number is the source's position in the view's deduplicated reference list (`referencesOf`),
 *   so a source cited by several claims has the same number everywhere.
 * - Activating a marker expands its record IN PLACE, under the claim and at the claim measure (a
 *   disclosure, never a jump to the list, never a hover preview): the short label with the
 *   citation's own locator, the label "Verbatim from the source" with the verbatim passages on the
 *   --sunk mat, and "Open the source" as a 44 px link. Activating the marker again closes it.
 *   Each marker has its own record; several may be open. Instant: no transition.
 * - Escape inside a record closes it and returns focus to its marker. Non-modal: it never covers or
 *   pauses the learning content, and opening it does not end the concept's exposure interval.
 * - The full bibliographic details are given once, in the ReferenceList at the end of the sheet.
 * - Telemetry `citation_opened` / `citation_closed` (conceptId, sourceId, claimIndex, openMs) when
 *   a <TelemetryProvider> is present, unchanged from the earlier note; works without one (CMS
 *   proof, tests).
 */
import { ExternalLink } from "lucide-react";
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";

import { shortCitationLabel, type Citation } from "@/features/knowledge/read/view";
import { CITATION_TEXT } from "@/features/learning/strings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { scriptRuns } from "@/lib/text/script-runs";
import { cn } from "@/lib/utils";

/** One citation of a claim with its number in the view's reference list. */
export interface NumberedCitation {
  citation: Citation;
  /** 1-based position of the source in the deduplicated reference list. */
  number: number;
}

export interface CitedClaimProps {
  /** The claim text, exactly as the read model returns it. */
  text: string;
  citations: readonly NumberedCitation[];
  /** Concept whose claim cites these sources (telemetry attribution). */
  conceptId: string;
  /** 0-based position of the claim within the concept (ClaimView.position). */
  claimIndex: number;
  className?: string;
}

/**
 * The marker's class: a 44 x 44 px box (h-11, min-w-11) whose negative block margins (44 - 30 = 14
 * px, 7 px each side) keep the reading line box at 30 px. Quiet: ink-2 text, no fill until open.
 */
export const CITATION_MARKER_CLASS =
  "text-ui relative -my-[0.4375rem] inline-flex h-11 min-w-11 items-center justify-center px-1 align-baseline text-ink-2 tabular-nums hover:text-ink hover:underline hover:decoration-1 hover:underline-offset-[0.2em] aria-expanded:bg-sunk aria-expanded:text-ink";

/** A claim paragraph with its numbered citation markers, and the records they expand in place. */
export function CitedClaim({ text, citations, conceptId, claimIndex, className }: CitedClaimProps) {
  const [open, setOpen] = useState<readonly number[]>([]);
  const baseId = useId();
  const markers = useRef<(HTMLButtonElement | null)[]>([]);
  const openedAt = useRef<Map<number, number>>(new Map());
  const telemetry = useOptionalTelemetry();

  const toggle = useCallback(
    (j: number, next: boolean) => {
      setOpen((cur) => (next ? (cur.includes(j) ? cur : [...cur, j]) : cur.filter((x) => x !== j)));
      const c = citations[j];
      if (!telemetry || !c) return;
      const metadata = { sourceId: c.citation.id, claimIndex };
      if (next) {
        openedAt.current.set(j, performance.now());
        void telemetry.citationOpened({ conceptId, metadata });
      } else {
        const since = openedAt.current.get(j);
        openedAt.current.delete(j);
        const openMs = since === undefined ? undefined : Math.max(0, Math.floor(performance.now() - since));
        void telemetry.citationClosed({ conceptId, metadata: { ...metadata, ...(openMs === undefined ? {} : { openMs }) } });
      }
    },
    [telemetry, citations, claimIndex, conceptId],
  );

  const recordId = (j: number) => `${baseId}-record-${j}`;
  const onRecordKeyDown = (j: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    toggle(j, false);
    markers.current[j]?.focus();
  };

  return (
    <>
      <p className={cn("text-reading text-ink", className)} data-slot="claim">
        <span data-slot="claim-text">{text}</span>
        {citations.length > 0 ? (
          <>
            {" "}
            <span data-slot="citation-markers" className="whitespace-nowrap">
              {citations.map(({ citation, number }, j) => {
                const expanded = open.includes(j);
                return (
                  <button
                    key={`${citation.id}-${j}`}
                    ref={(el) => {
                      markers.current[j] = el;
                    }}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={recordId(j)}
                    aria-label={`${CITATION_TEXT.source} ${number}: ${shortCitationLabel(citation)}`}
                    data-slot="citation-marker"
                    data-citation-source={citation.id}
                    data-citation-number={number}
                    onClick={() => toggle(j, !expanded)}
                    className={CITATION_MARKER_CLASS}
                  >
                    {`[${number}]`}
                  </button>
                );
              })}
            </span>
          </>
        ) : null}
      </p>
      {citations.map(({ citation, number }, j) => {
        const expanded = open.includes(j);
        return (
          <div
            key={`${citation.id}-${j}`}
            id={recordId(j)}
            role="region"
            aria-label={`${CITATION_TEXT.source} ${number}: ${shortCitationLabel(citation)}`}
            hidden={!expanded}
            onKeyDown={onRecordKeyDown(j)}
            data-slot="citation-record"
            data-citation-source={citation.id}
          >
            {expanded ? <CitationRecord citation={citation} number={number} /> : null}
          </div>
        );
      })}
    </>
  );
}

/**
 * The record a marker expands, lean (DR-022 Addendum A): which source and where in it (the short
 * label carries the citation's own locator), the labelled verbatim evidence at claim size, and the
 * link to the source. The full bibliographic details are in the ReferenceList, once.
 */
export function CitationRecord({ citation, number }: { citation: Citation; number: number }) {
  const hasQuote = citation.passages.length > 0 || !!citation.quote;
  return (
    <div className="mt-3 pb-1">
      <p className="text-source text-ink-2">
        <span className="text-label mr-2">
          {CITATION_TEXT.source} {number}
        </span>
        {shortCitationLabel(citation)}
      </p>
      {hasQuote ? <p className="text-label mt-3 mb-2">{CITATION_TEXT.verbatim}</p> : null}
      {citation.passages.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={CITATION_TEXT.passagesLabel}>
          {citation.passages.map((p, i) => (
            <li key={i}>
              <Quote text={p.quote} />
              <p className="text-credit mt-1 pl-4">{p.locator}</p>
              {p.note ? (
                <p className="text-credit pl-4">
                  {CITATION_TEXT.note} {p.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : citation.quote ? (
        <Quote text={citation.quote} />
      ) : null}
      {citation.url ? (
        <a
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ui mt-2 inline-flex min-h-11 items-center gap-2 text-indigo underline decoration-1 underline-offset-[0.2em] hover:text-indigo-hover hover:decoration-2"
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
 * The verbatim quote: claim size, roman (no italic: dyslexia guidance), typographic quotes, on the
 * --sunk mat (18.85:1) with 12 px 16 px padding, radius 0, no border and no left bar; the opening
 * mark hangs into the padding so the text edge stays straight. An Arabic-script run (a Sindhi or
 * Persian spelling quoted by the source) is set right-to-left in its own `<span lang dir="rtl">`
 * with the system Arabic stack (DESIGN.md 5.1); the text is unchanged.
 */
function Quote({ text }: { text: string }) {
  const runs = scriptRuns(text);
  return (
    <blockquote className="text-quote bg-sunk px-4 py-3 text-ink" data-slot="citation-quote">
      <span aria-hidden="true" className="-ml-[0.42em]">
        {"“"}
      </span>
      {runs.map((r, i) =>
        r.rtl ? (
          <span key={i} lang={r.lang} dir="rtl">
            {r.text}
          </span>
        ) : (
          r.text
        ),
      )}
      <span aria-hidden="true">{"”"}</span>
    </blockquote>
  );
}
