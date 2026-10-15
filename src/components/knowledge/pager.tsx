/**
 * Pager (DESIGN.md 9.11 item 6, 9.16): previous and next at the end of the knowledge sheet, the
 * same in both conditions. Two equal-width cards in a grid, at least 64 px tall: "Previous" or
 * "Next" in `text-eyebrow`, the concept title in `text-h3`, both left-aligned; the next card
 * carries a right arrow. An absent side keeps its empty cell, so the next card never moves.
 *
 * How the link acts is the placement's (navigate in 2D, walk in 3D): `renderLink` receives the
 * same class names in both, so the cards look identical.
 */
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { SHEET_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";

export interface PagerItem {
  conceptId: string;
  title: string;
}

export const PAGER_LINK_CLASS = "flex min-h-16 h-full flex-col justify-start gap-1 border border-rule-strong bg-ground px-4 py-3 text-left text-ink no-underline hover:bg-sunk";

export interface PagerProps {
  prev: PagerItem | null;
  next: PagerItem | null;
  /** Accessible name of the navigation landmark. */
  label?: string;
  renderLink(item: PagerItem, direction: "prev" | "next", content: ReactNode, className: string): ReactNode;
}

export function Pager({ prev, next, label = SHEET_TEXT.pagerLabel, renderLink }: PagerProps) {
  if (!prev && !next) return null;
  const card = (item: PagerItem | null, dir: "prev" | "next") => {
    if (!item) return <span aria-hidden="true" />;
    const content = (
      <>
        <span className="text-eyebrow">{dir === "prev" ? SHEET_TEXT.previous : SHEET_TEXT.next}</span>
        <span className="text-h3 flex items-start justify-between gap-2">
          <span className="min-w-0">{titleCase(item.title)}</span>
          {dir === "next" ? <ArrowRight aria-hidden="true" strokeWidth={1.75} className="mt-1 size-5 shrink-0" /> : null}
        </span>
      </>
    );
    return renderLink(item, dir, content, PAGER_LINK_CLASS);
  };
  return (
    <nav aria-label={label} data-slot="pager" className="grid grid-cols-2 gap-3">
      {card(prev, "prev")}
      {card(next, "next")}
    </nav>
  );
}
