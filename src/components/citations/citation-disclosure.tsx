"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";

import { shortCitationLabel, type Citation } from "@/features/knowledge/read/view";
import { CITATION_TEXT } from "@/features/learning/strings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { scriptRuns } from "@/lib/text/script-runs";
import { cn } from "@/lib/utils";

interface NumberedCitation {
  citation: Citation;
  number: number;
}

export interface CitedClaimProps {
  text: string;
  citations: readonly NumberedCitation[];
  conceptId: string;
  claimIndex: number;
  className?: string;
}

const CITATION_MARKER_CLASS =
  "t-label relative -my-[0.4375rem] inline-flex h-11 min-w-11 items-center justify-center px-1 align-baseline text-lime-dim tabular-nums hover:text-lime hover:underline hover:decoration-1 hover:underline-offset-[0.2em] aria-expanded:bg-vat-2 aria-expanded:text-lime";

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
      <p className={cn("t-b text-lime", className)} data-slot="claim">
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

function CitationRecord({ citation, number }: { citation: Citation; number: number }) {
  const hasQuote = citation.passages.length > 0 || !!citation.quote;
  return (
    <div className="mt-3 pb-1">
      <p className="t-s text-lime-dim text-lime-dim">
        <span className="t-label mr-2">
          {CITATION_TEXT.source} {number}
        </span>
        {shortCitationLabel(citation)}
      </p>
      {hasQuote ? <p className="t-label mt-3 mb-2">{CITATION_TEXT.verbatim}</p> : null}
      {citation.passages.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label={CITATION_TEXT.passagesLabel}>
          {citation.passages.map((p, i) => (
            <li key={i}>
              <Quote text={p.quote} />
              <p className="t-s text-lime-dim mt-1 pl-4">{p.locator}</p>
              {p.note ? (
                <p className="t-s text-lime-dim pl-4">
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
          className="t-label mt-2 inline-flex min-h-11 items-center gap-2 text-turmeric underline decoration-1 underline-offset-[0.2em] hover:text-turmeric-hi hover:decoration-2"
        >
          <ExternalLink aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
          {CITATION_TEXT.open}
          <span className="sr-only"> {CITATION_TEXT.newTab}</span>
        </a>
      ) : null}
    </div>
  );
}

function Quote({ text }: { text: string }) {
  const runs = scriptRuns(text);
  return (
    <blockquote className="t-b bg-vat-2 px-4 py-3 text-lime" data-slot="citation-quote">
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
