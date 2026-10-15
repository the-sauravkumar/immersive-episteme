/**
 * Editorial frame (DESIGN.md 6, 11.2, 11.4): About, Colophon, Accessibility and Privacy.
 *
 * A 34rem text column (the reading measure), a 3rem gap and a 15rem margin column for sidenotes
 * and marginal citations, so notes stay next to the text they support (R-T12). Under 1024 px the
 * margin column folds away and each sidenote follows its paragraph inline (`EditorialRow`).
 *
 * Section heads carry the public 2 px `--madder` rule above them (7.5; public pages only) and are
 * set in Title Case through `titleCase()`. They are `text-h2` (24 px) at every width: these pages'
 * h1 is the PageHeader's `text-title` (32 px), so a 40 px `text-display-2` h2 would read above it.
 * `text-display-2` stays for the home page's section heads, under the `text-display-1` h1.
 */
import type { ReactNode } from "react";

import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

/** The frame: the text column plus the margin column, left-aligned in the public grid. */
export function EditorialFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-slot="editorial-frame" className={cn("flex w-full max-w-[52rem] flex-col gap-16", className)}>
      {children}
    </div>
  );
}

/** One row: text in the measure, an optional sidenote in the margin (inline below 1024 px). */
export function EditorialRow({ children, note, className }: { children: ReactNode; note?: ReactNode; className?: string }) {
  return (
    <div data-slot="editorial-row" className={cn("lg:grid lg:grid-cols-[minmax(0,34rem)_15rem] lg:gap-x-12", className)}>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
      {note ? <div className="mt-3 lg:mt-0">{note}</div> : null}
    </div>
  );
}

/** A section with its madder-ruled head. Body rows go inside; the h2 id labels the section. */
export function EditorialSection({
  id,
  title,
  eyebrow,
  children,
  className,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} data-slot="editorial-section" className={cn("flex scroll-mt-8 flex-col gap-6", className)}>
      <header className="flex max-w-[34rem] flex-col gap-2 border-t-2 border-madder pt-4 hc:border-ink">
        {eyebrow ? <p className="text-eyebrow text-ochre hc:text-ink">{eyebrow}</p> : null}
        <h2 id={headingId} className="text-h2 text-ink">
          {titleCase(title)}
        </h2>
      </header>
      {children}
    </section>
  );
}

/** Long-form paragraph in the public reading size (DESIGN.md 5.2: public long-form uses text-reading). */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-reading text-ink", className)}>{children}</p>;
}
