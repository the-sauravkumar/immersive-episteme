/**
 * PageHeader (DESIGN.md 10.2, DR-022): the page title block shared by every shell. Exactly one h1
 * per page.
 *
 *  - h1 in `text-title`, description in `text-body` `--ink-2` at 40rem, actions right-aligned on
 *    the title's row, wrapping under the text below 768 px;
 *  - no band, no eyebrow and no second rule: the console top bar already draws the one 1 px
 *    line, and an eyebrow that repeats the area or navigation state is a template tell. The
 *    `eyebrow`, `kicker` and `top` props are accepted for older call sites and render nothing.
 *
 * Headings pass through titleCase().
 */
import type { ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export type PageHeaderTop = "none" | "band" | "rule";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  /** @deprecated Not rendered (DR-022: no eyebrows). */
  eyebrow?: string;
  /** @deprecated Not rendered. */
  kicker?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** @deprecated Not rendered (DR-022: no band and no second rule). */
  top?: PageHeaderTop;
  className?: string;
}) {
  return (
    <header data-slot="page-header" className={cn("mb-8", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-title text-ink">{titleCase(title)}</h1>
          {description ? <div className="text-body max-w-[40rem] text-ink-2">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}
