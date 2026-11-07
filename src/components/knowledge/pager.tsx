import type { ReactNode } from "react";

import { SHEET_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";

export interface PagerItem {
  conceptId: string;
  title: string;
}

export const PAGER_LINK_CLASS = "flex min-h-16 h-full flex-col justify-start gap-1 bg-vat-2 px-4 py-3 text-left text-lime no-underline hover:bg-raised-hover hover:underline hover:decoration-1 hover:underline-offset-[0.2em]";

export interface PagerProps {
  prev: PagerItem | null;
  next: PagerItem | null;
  label?: string;
  renderLink(item: PagerItem, direction: "prev" | "next", content: ReactNode, className: string): ReactNode;
}

export function Pager({ prev, next, label = SHEET_TEXT.pagerLabel, renderLink }: PagerProps) {
  if (!prev && !next) return null;
  const card = (item: PagerItem | null, dir: "prev" | "next") => {
    if (!item) return <span aria-hidden="true" />;
    const content = (
      <>
        <span className="t-label">{dir === "prev" ? SHEET_TEXT.previous : SHEET_TEXT.next}</span>
        <span className="t-label min-w-0">{titleCase(item.title)}</span>
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
