/**
 * Pager (DESIGN.md 9.11 item 6, 9.16): previous and next at the end of the knowledge sheet, the
 * same in both conditions. Two equal-width cells on --sunk in a grid, at least 64 px tall, no
 * border and no arrow glyph (DR-022): "Previous" or "Next" in `text-label`, the concept title in
 * `text-h3`, both left-aligned. An absent side keeps its empty cell, so the next cell never moves.
 *
 * How the link acts is the placement's (navigate in 2D, walk in 3D): `renderLink` receives the
 * same class names in both, so the cards look identical.
 */
import type { ReactNode } from "react";

import { SHEET_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";

export interface PagerItem {
  conceptId: string;
  title: string;
}

export const PAGER_LINK_CLASS = "flex min-h-16 h-full flex-col justify-start gap-1 bg-sunk px-4 py-3 text-left text-ink no-underline hover:bg-wash hover:underline hover:decoration-1 hover:underline-offset-[0.2em]";

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
        <span className="text-label">{dir === "prev" ? SHEET_TEXT.previous : SHEET_TEXT.next}</span>
        <span className="text-h3 min-w-0">{titleCase(item.title)}</span>
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
