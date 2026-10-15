/**
 * Concept link lists: each concept as a 44 px row with its title as an indigo, underlined link
 * (the same row style as the shared RelatedConcepts, DESIGN.md 9.12) and, when asked, its type and
 * tradition in `text-credit`. Rows carry no claim text: claims are shown only on the concept page,
 * inside its exposure region, so every moment a claim is on screen is attributed to that concept's
 * exposure (as in 3D, where an exhibit opens the information panel that holds the claims).
 */
import { RELATED_LINK_CLASS } from "@/components/knowledge/related-concepts";
import type { ConceptRef } from "@/features/knowledge/read/view";
import { CONCEPT_TYPE_LABELS } from "@/features/learning/labels";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { href2d } from "../routes";

import { TrackedLink } from "./tracked-link";

/** A concept link row: the shared RelatedConcepts link style, at least 44 x 44 (short titles such as "Tools" too). */
export const ROW_LINK_CLASS = `${RELATED_LINK_CLASS} min-w-11`;

export function ConceptCardList({
  concepts,
  pageId,
  showType = false,
  traditionNames,
  ordered = false,
  label,
  className,
}: {
  concepts: readonly ConceptRef[];
  pageId: string;
  showType?: boolean;
  /** Tradition name by slug, to label each row with its tradition. */
  traditionNames?: Readonly<Record<string, string>>;
  ordered?: boolean;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <List aria-label={label} data-slot="concept-list" className={cn("flex flex-col", className)}>
      {concepts.map((c) => {
        const tradition = traditionNames && c.traditionSlug ? traditionNames[c.traditionSlug] : undefined;
        const meta = [showType ? CONCEPT_TYPE_LABELS[c.type] : null, tradition].filter(Boolean).join(", ");
        return (
          // Every row has the same structure: the link, then (when shown) its type on its own line.
          // With a type line the link keeps a fixed 12 px above and below its text (a one-line title
          // fills the 44 px row exactly), so the type sits the same 4 px under the last line of a
          // one-line and a wrapped title alike.
          <li key={c.id} className={cn("flex flex-col items-start", meta && "pb-2")}>
            <TrackedLink
              href={href2d.concept(c.slug)}
              pageId={pageId}
              item={{ conceptId: c.id, elementKind: "concept_card" }}
              className={cn(ROW_LINK_CLASS, meta && "py-3")}
            >
              {titleCase(c.title)}
            </TrackedLink>
            {meta ? <span className="text-credit -mt-2">{meta}</span> : null}
          </li>
        );
      })}
    </List>
  );
}
