/**
 * Layout primitives of the 2D pages (DESIGN.md 6, 11.5): every 2D page is one centred column at
 * the KnowledgeSheet's width, `min(39.25rem, 100%)` with the sheet's own 16/24 px padding as the
 * gutter, on `--ground`, so index, tradition, category and comparison pages share the concept
 * page's measure and nothing sits in an empty side area. Loading is a static `--sunk` block.
 */
import type { ReactNode } from "react";

import { KNOWLEDGE_CATEGORIES } from "@db/seeds/reference-data";

import { ROW_LINK_CLASS } from "./concept-list";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABELS } from "@/features/learning/labels";
import { titleCase, titleCaseNode } from "@/lib/text/title-case";
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";
import { cn } from "@/lib/utils";

import { TrackedLink } from "./tracked-link";

/** The sheet-width column (the concept page places the KnowledgeSheet itself, which has the same box). */
export const COLUMN_CLASS = "mx-auto w-full max-w-[39.25rem] px-4 xs:px-6";

export function PageColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(COLUMN_CLASS, "pt-6 pb-16", className)}>{children}</div>;
}

export function PageSkeleton() {
  return (
    <PageColumn>
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-5 w-40" aria-hidden="true" />
        <Skeleton className="h-10 w-80 max-w-full" aria-hidden="true" />
        <Skeleton className="mt-4 h-7 w-full" aria-hidden="true" />
        <Skeleton className="h-7 w-full" aria-hidden="true" />
        <Skeleton className="h-7 w-2/3" aria-hidden="true" />
      </div>
    </PageColumn>
  );
}

/**
 * The page's header: eyebrow, the h1 (pass a `PageHeading`), an optional labelled metadata list
 * (`meta`, a `<dl>` from `PageMeta`) and an optional lead in `text-reading` ink-2.
 */
export function PageIntro({ eyebrow, title, lead, meta }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-10 flex flex-col">
      {eyebrow ? <p className="text-eyebrow">{eyebrow}</p> : null}
      <div className="mt-1">{title}</div>
      {meta ? <div className="mt-6">{meta}</div> : null}
      {lead ? <div className="text-reading mt-4 text-ink-2">{lead}</div> : null}
    </header>
  );
}

/**
 * A labelled metadata list (Also Known As, Region, GI Status ...): the same two-column `<dl>` as
 * the KnowledgeSheet's metadata (9rem label column, stacking under 520 px), one value per line.
 */
export function PageMeta({ label, rows }: { label: string; rows: readonly { label: string; values: readonly ReactNode[] }[] }) {
  const shown = rows.filter((r) => r.values.length > 0);
  if (shown.length === 0) return null;
  return (
    <dl aria-label={label} className="grid grid-cols-1 gap-x-4 xs:grid-cols-[9rem_minmax(0,1fr)]">
      {shown.map((r) => (
        <div key={r.label} className="contents">
          <dt className="text-dl-label pt-1 xs:pt-0.5">{r.label}</dt>
          <dd className="text-dl-value mb-2 min-w-0 break-words xs:mb-1">
            {r.values.map((v, i) => (
              <span key={i} className="block">
                {v}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface BrowseRow {
  key: string;
  href: string;
  /** A knowledge category: its label and description come from the reference vocabulary. */
  code?: KnowledgeCategoryCode;
  label?: string;
  description?: string;
}

const CATEGORY_DESCRIPTIONS = new Map(KNOWLEDGE_CATEGORIES.map((c) => [c.code, c.description]));

/**
 * A booktabs table of 44 px row links (DESIGN.md 11.5, 9.3): the link in the first column, a
 * one-line description in the second. Used for the knowledge categories and the comparisons row.
 * No count column: counts are shown in neither condition. The first column has one fixed width
 * (9rem, 12rem from 520 px), so the category table and the comparisons row line up.
 */
export function BrowseTable({ rows, label, pageId, className }: { rows: readonly BrowseRow[]; label: string; pageId: string; className?: string }) {
  return (
    <div className={className}>
      {/* Fixed layout with one first-column width, so every browse table on a page shares the column edge. */}
      <Table label={label} className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-[9rem] xs:w-[12rem]">
              {rows.some((r) => r.code) ? "Category" : "Page"}
            </TableHead>
            <TableHead scope="col">Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="py-0 align-top whitespace-normal">
                <TrackedLink href={r.href} pageId={pageId} className={cn(ROW_LINK_CLASS, "font-medium")}>
                  {titleCase(r.code ? CATEGORY_LABELS[r.code] : (r.label ?? ""))}
                </TrackedLink>
              </TableCell>
              <TableCell className="text-dl-value py-2.5 align-top whitespace-normal text-ink-2">{r.code ? CATEGORY_DESCRIPTIONS.get(r.code) : r.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** A section heading of a 2D page: h2 in `text-h2`, Title Case. */
export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-h2 text-ink">
      {titleCaseNode(children)}
    </h2>
  );
}
