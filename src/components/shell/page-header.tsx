/**
 * PageHeader (DESIGN.md 9.16): the page title block shared by every shell. Exactly one h1 per page.
 *
 *  - eyebrow (`text-eyebrow`), h1 in `text-title`, description in `text-body` `--ink-2` at 40rem;
 *  - actions right-aligned on the title's baseline row, wrapping under the text below 768 px;
 *  - `top`: what sits above it. Research console pages carry the 48 px knock-out band (bled to the
 *    console main's edges), CMS and admin a plain 2 px ink rule, everything else nothing. Study
 *    pages never carry a band (DESIGN.md 3).
 *
 * Headings pass through titleCase(); the eyebrow is uppercase by its token.
 */
import type { ReactNode } from "react";

import { KnockoutBand } from "@/components/brand/knockout-band";
import { Rule } from "@/components/brand/rule";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export type PageHeaderTop = "none" | "band" | "rule";

export function PageHeader({
  title,
  eyebrow,
  kicker,
  description,
  actions,
  top = "none",
  className,
}: {
  title: string;
  eyebrow?: string;
  /** @deprecated Use `eyebrow`. */
  kicker?: string;
  description?: ReactNode;
  actions?: ReactNode;
  top?: PageHeaderTop;
  className?: string;
}) {
  const label = eyebrow ?? kicker;
  return (
    <header data-slot="page-header" className={cn("mb-8", className)}>
      {top === "band" ? (
        // Bleeds to the console main's edges (its 16/24/32 px gutters, 32 px top padding), so
        // the band meets the top bar's running-head rule like a masthead.
        <KnockoutBand size={48} hcRule={false} className="-mx-4 -mt-8 mb-8 xs:-mx-6 lg:-mx-8" />
      ) : null}
      {top === "rule" ? <Rule kind="running-head" className="mb-6" /> : null}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          {label ? <p className="text-eyebrow">{titleCase(label)}</p> : null}
          <h1 className="text-title text-ink">{titleCase(title)}</h1>
          {description ? <div className="text-body max-w-[40rem] text-ink-2">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3 md:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}
