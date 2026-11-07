import type { Citation } from "@/features/knowledge/read/view";
import { humanise } from "@/features/learning/labels";
import { CITATION_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export interface ReferenceListProps {
  sources: readonly Pick<Citation, "id" | "author" | "publisher" | "year" | "title" | "kind" | "reliability" | "accessedOn">[];
  headingId: string;
  className?: string;
}

const stop = (s: string) => (/[.!?…]$/u.test(s) ? s : `${s}.`);

export function referenceHead(s: ReferenceListProps["sources"][number]): string {
  const who = s.author?.trim() || s.publisher?.trim() || null;
  const year = s.year != null && s.year > 0 ? ` (${s.year})` : "";
  const parts = [who ? stop(`${who}${year}`) : year ? stop(year.trim()) : null, stop(s.title.trim()), s.author?.trim() && s.publisher?.trim() ? stop(s.publisher.trim()) : null];
  return parts.filter(Boolean).join(" ");
}

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
    <section aria-labelledby={headingId} data-slot="reference-list" className={cn("text-lime", className)}>
      <h2 id={headingId} className="t-label text-lime">
        {titleCase(CITATION_TEXT.reference.heading)}
      </h2>
      <ol aria-labelledby={headingId} className="mt-3 flex list-none flex-col gap-3">
        {sources.map((s, i) => (
          <li key={s.id} data-citation-source={s.id} className="grid grid-cols-[var(--hang)_minmax(0,1fr)]">
            <span className="t-label pr-3 text-right text-lime-dim tabular-nums">
              <span aria-hidden="true">[</span>
              {i + 1}
              <span aria-hidden="true">]</span>
            </span>
            <div className="min-w-0">
              <p className="t-s text-lime-dim break-words text-lime-dim">{referenceHead(s)}</p>
              <p className="t-s text-lime-dim break-words">{referenceDetail(s)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
