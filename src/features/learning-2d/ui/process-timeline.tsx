/**
 * The ordered process of a tradition (getProcessChain): numbered steps in PRECEDES order, other
 * ordered sequences (e.g. a chronology) and marked repeat links. Titles link to the concept
 * pages; no claim text is shown here (see concept-list.tsx).
 *
 * Each step is a 44 px row: the step number in the 2.25rem hang (tabular, ink-3, right-aligned,
 * like the claim numbers of the KnowledgeSheet) and the title as an indigo, underlined link. The
 * `<ol>` numbers the steps for assistive technology, so the visible number is aria-hidden.
 */
import { ROW_LINK_CLASS } from "./concept-list";
import type { ProcessChain, ProcessSequence } from "@/features/knowledge/read/view";
import { titleCase } from "@/lib/text/title-case";

import { href2d } from "../routes";

import { TrackedLink } from "./tracked-link";

export function ProcessTimeline({ sequence, pageId, label }: { sequence: ProcessSequence; pageId: string; label: string }) {
  return (
    <ol aria-label={label} data-slot="process-steps" className="flex flex-col">
      {sequence.steps.map((s, i) => (
        <li key={s.id} className="grid grid-cols-[var(--hang)_minmax(0,1fr)] items-baseline">
          <span aria-hidden="true" className="text-ui pr-3 text-right text-ink-3 tabular-nums">
            {i + 1}
          </span>
          <TrackedLink href={href2d.concept(s.slug)} pageId={pageId} item={{ conceptId: s.id, elementKind: "process_step" }} className={ROW_LINK_CLASS}>
            {titleCase(s.title)}
          </TrackedLink>
        </li>
      ))}
    </ol>
  );
}

export function RepeatLinks({ chain, pageId }: { chain: ProcessChain; pageId: string }) {
  if (chain.unorderedLinks.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="text-label mb-1">{titleCase("Repeated or looping steps")}</h3>
      <ul className="flex flex-col">
        {chain.unorderedLinks.map((l) => (
          <li key={l.relationshipId} className="flex flex-wrap items-baseline gap-x-2">
            <TrackedLink href={href2d.concept(l.from.slug)} pageId={pageId} item={{ conceptId: l.from.id, elementKind: "process_step" }} className={ROW_LINK_CLASS}>
              {titleCase(l.from.title)}
            </TrackedLink>
            <span className="text-ui text-ink-3">precedes</span>
            <TrackedLink href={href2d.concept(l.to.slug)} pageId={pageId} item={{ conceptId: l.to.id, elementKind: "process_step" }} className={ROW_LINK_CLASS}>
              {titleCase(l.to.title)}
            </TrackedLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
