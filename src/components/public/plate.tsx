/**
 * Public plates (DESIGN.md 3 signature 4, 7.3, 7.8, 11.1). Public pages only; never in study.
 *
 * `Plate`: a box framed by four registration ticks (R-C9), then a caption line "Plate n." in
 * `--madder` 600 with the caption, and a credit and licence line (R-H5). The box has the given
 * aspect ratio (4:5 for Plate 1) and its content is fitted to it, so the frame stays exact at every
 * tested width (tests/e2e/public-pages.spec.ts asserts 1.25 at 390 to 1280 px). Content is never
 * clipped: below the tested widths the box grows a little rather than cut text.
 *
 * `ClaimSpecimen`: the typographic stand-in for Plate 1 until a licensed photograph is approved
 * (11.1; DR-020 keeps the V&A images off the home page). One real dataset claim from a non-study
 * tradition, numbered as in the study, with its source line, the verbatim quote at claim size
 * behind the 2 px indigo rule, a short record (Title, Year, Locator; shown when the frame is at
 * least 22rem wide inside its padding), "Open the source" directly under the record, and the claim's
 * real curator status. Under the tradition and status row, the specimen block is centred in the
 * frame, so a short claim leaves even space above and below it rather than a gap before the link. It uses the same knowledge tokens and citation strings as the
 * study's CitationRecord.
 */
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { TickedFrame } from "@/components/brand/registration-ticks";
import { plateLabel } from "@/components/brand/numbering";
import { Badge } from "@/components/ui/badge";
import { shortCitationLabel } from "@/features/knowledge/read/view";
import { humanise } from "@/features/learning/labels";
import { CITATION_TEXT } from "@/features/learning/strings";
import type { FeaturedClaim } from "@/server/public/dataset-stats";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export function Plate({
  number,
  caption,
  credit,
  aspect = "4 / 5",
  children,
  className,
}: {
  number: number;
  caption: ReactNode;
  /** Credit and licence line; required for every photograph. */
  credit: ReactNode;
  /**
   * CSS aspect ratio of the framed box. The content is fitted to it, so the box is exact; content
   * is never clipped, so on a phone narrower than tested the box grows a little rather than cut text.
   */
  aspect?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure data-slot="public-plate" className={cn("flex flex-col gap-3", className)}>
      {/* The ticks sit 6 px outside the box; the 16 px page gutter keeps them on screen. */}
      <TickedFrame className="mx-1.5">
        <div data-slot="plate-box" className="border border-rule bg-surface" style={{ aspectRatio: aspect }}>
          {children}
        </div>
      </TickedFrame>
      <figcaption className="mx-1.5 flex flex-col gap-1">
        <p className="text-caption">
          <span className="font-semibold text-madder tabular-nums hc:text-ink">{plateLabel(number)}.</span> {caption}
        </p>
        <p className="text-credit">{credit}</p>
      </figcaption>
    </figure>
  );
}

/** The specimen inside Plate 1. Server-rendered and static: the record is shown open. */
export function ClaimSpecimen({ claim }: { claim: FeaturedClaim }) {
  const { citation } = claim;
  const label = shortCitationLabel(citation);
  const quote = citation.passages[0]?.quote ?? citation.quote;
  const rows: [string, string | null][] = [
    [CITATION_TEXT.rows.title, citation.title],
    [CITATION_TEXT.rows.year, citation.year != null && citation.year > 0 ? String(citation.year) : null],
    [CITATION_TEXT.rows.locator, citation.locator],
  ];
  return (
    <div data-slot="claim-specimen" className="@container flex min-h-full flex-col gap-4 p-5 xs:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-eyebrow">{titleCase(claim.traditionShortName)}</p>
        <Badge variant="neutral">{humanise(claim.conceptState)}</Badge>
      </div>
      <div className="grid flex-1 grid-cols-[var(--hang)_minmax(0,1fr)] content-center">
        <span aria-hidden="true" className="text-claim-number pr-3">
          {claim.position + 1}
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="text-reading text-ink">
            <span className="sr-only">Claim {claim.position + 1}: </span>
            {claim.text}
          </p>
          <p className="mt-1 text-ink-3">
            <span className="text-eyebrow mr-2">{CITATION_TEXT.source}</span>
            <span className="text-source">{label}</span>
          </p>
          {quote ? <blockquote className="text-quote mt-4 border-l-2 border-indigo pl-4 text-ink">{`“${quote}”`}</blockquote> : null}
          <dl data-slot="specimen-record" className="mt-4 hidden grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 @min-[22rem]:grid">
            {rows
              .filter((r): r is [string, string] => !!r[1])
              .map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-dl-label pt-0.5">{k}</dt>
                  <dd className="text-dl-value mb-1 break-words">{v}</dd>
                </div>
              ))}
          </dl>
          {citation.url ? (
            <div className="pt-2">
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ui inline-flex min-h-11 items-center gap-2 text-indigo underline decoration-1 underline-offset-[3px] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-indigo-hover hover:decoration-2"
              >
                <ExternalLink aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
                {CITATION_TEXT.open}
                <span className="sr-only"> {CITATION_TEXT.newTab}</span>
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
