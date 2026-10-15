/**
 * ReferenceList (DESIGN.md 9.9; DR-022 Addendum A): the ONE deduplicated, numbered list of the
 * sources cited by the claims shown, at the end of the KnowledgeSheet's field in both conditions
 * (and after a standalone ClaimList, e.g. the 2D comparisons page). Each source is listed once,
 * with its full details, under the number its claim markers carry ("[1]"); the per-claim record
 * keeps only the locator, the verbatim evidence and the link.
 *
 * Quiet by design (cognitive load, Mayer's coherence principle): an h2 set as `text-h3`, the items
 * in `text-source` (16/24, ink-2), the number hanging in the claims' 2.25rem hang so the list lines
 * up with the claims above it. No links here (the record carries "Open the source"), so the list
 * adds no Tab stops between the claims and Related Concepts. Server-safe; no state.
 *
 * Each item reads, with absent parts left out and no middle dots:
 *   "<Author or publisher> (<year>). <Title>. <Publisher, when an author leads>."
 *   "Kind of source: <kind>. Reliability: <reliability>. Accessed <date>."
 */
import type { Citation } from "@/features/knowledge/read/view";
import { humanise } from "@/features/learning/labels";
import { CITATION_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export interface ReferenceListProps {
  /** The deduplicated sources in marker order (`referencesOf`). */
  sources: readonly Pick<Citation, "id" | "author" | "publisher" | "year" | "title" | "kind" | "reliability" | "accessedOn">[];
  /** Id of the list's heading (unique within the page). */
  headingId: string;
  className?: string;
}

const stop = (s: string) => (/[.!?…]$/u.test(s) ? s : `${s}.`);

/** The first line of a reference: who, when, what, and the publisher when an author leads. */
export function referenceHead(s: ReferenceListProps["sources"][number]): string {
  const who = s.author?.trim() || s.publisher?.trim() || null;
  const year = s.year != null && s.year > 0 ? ` (${s.year})` : "";
  const parts = [who ? stop(`${who}${year}`) : year ? stop(year.trim()) : null, stop(s.title.trim()), s.author?.trim() && s.publisher?.trim() ? stop(s.publisher.trim()) : null];
  return parts.filter(Boolean).join(" ");
}

/** The second line: the kind of source, its reliability and the access date. */
export function referenceDetail(s: ReferenceListProps["sources"][number]): string {
  const parts = [
    `${CITATION_TEXT.reference.kind} ${humanise(s.kind).toLowerCase()}.`,
    s.reliability ? `${CITATION_TEXT.reference.reliability} ${humanise(s.reliability).toLowerCase()}.` : null,
    s.accessedOn ? `${CITATION_TEXT.reference.accessed} ${s.accessedOn}.` : null,
  ];
  return parts.filter(Boolean).join(" ");
}

export function ReferenceList({ sources, headingId, className }: ReferenceListProps) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby={headingId} data-slot="reference-list" className={cn("text-ink", className)}>
      <h2 id={headingId} className="text-h3 text-ink">
        {titleCase(CITATION_TEXT.reference.heading)}
      </h2>
      <ol aria-labelledby={headingId} className="mt-3 flex list-none flex-col gap-3">
        {sources.map((s, i) => (
          <li key={s.id} data-citation-source={s.id} className="grid grid-cols-[var(--hang)_minmax(0,1fr)]">
            <span className="text-ui pr-3 text-right text-ink-2 tabular-nums">
              <span aria-hidden="true">[</span>
              {i + 1}
              <span aria-hidden="true">]</span>
            </span>
            <div className="min-w-0">
              <p className="text-source break-words text-ink-2">{referenceHead(s)}</p>
              <p className="text-source break-words">{referenceDetail(s)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
