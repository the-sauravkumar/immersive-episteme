"use client"

import * as React from "react"
import { titleCaseNode } from "@/lib/text/title-case"
import { cn } from "@/lib/utils"

/*
 * Booktabs table (DESIGN.md 7.5, 9.3).
 *  - 1.5 px --ink top and bottom rules, a 1 px --ink midrule under the header row, no vertical
 *    rules, no zebra. Row separators are 1 px --rule (`rowRules={false}` omits them; public
 *    tables of 6 rows or fewer).
 *  - Header cells in `text-label`. Numbers right-aligned with tabular lining figures: pass
 *    `numeric` to TableHead and TableCell. Units go in the header ("Time (min)").
 *  - Rows 44 px; `density="compact"` gives 36 px rows for dense console tables (interactive cells
 *    keep a 44 px hit area through the compact Button).
 *  - `hoverRows`: console row hover --sunk. A selected row (`data-state="selected"`) is --wash, its
 *    first cell bold, no left bar; the caller adds the check icon or the word "Selected" (R-A4).
 *  - Caption above: pass `caption` (and optionally `number`) and the scroll box becomes a
 *    labelled, focusable region (`role="region"`, `tabIndex=0`, `aria-labelledby` the caption),
 *    so a wide table scrolls inside itself, never the page. Or pass `label` for an unlabelled
 *    table that may still scroll. `note` renders the source note below in `text-credit`.
 */
type Density = "default" | "compact"

function Table({
  className,
  caption,
  number,
  note,
  label,
  density = "default",
  rowRules = true,
  hoverRows = false,
  children,
  ...props
}: React.ComponentProps<"table"> & {
  caption?: React.ReactNode
  number?: number | string
  note?: React.ReactNode
  label?: string
  density?: Density
  rowRules?: boolean
  hoverRows?: boolean
}) {
  const captionId = React.useId()
  const hasCaption = caption !== undefined && caption !== null
  const region = hasCaption || Boolean(label)

  return (
    <div data-slot="table-frame" className="w-full min-w-0">
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
        {...(region
          ? {
              role: "region",
              tabIndex: 0,
              ...(hasCaption ? { "aria-labelledby": captionId } : { "aria-label": label }),
            }
          : {})}
      >
        <table
          data-slot="table"
          data-density={density}
          data-row-rules={rowRules ? "true" : "false"}
          data-hover-rows={hoverRows ? "true" : undefined}
          className={cn(
            "group/table w-full caption-top border-collapse border-y-[1.5px] border-y-ink text-left text-table text-ink",
            className
          )}
          {...props}
        >
          {hasCaption ? (
            <TableCaption id={captionId} number={number}>
              {caption}
            </TableCaption>
          ) : null}
          {children}
        </table>
      </div>
      {note ? <TableNote>{note}</TableNote> : null}
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-b-ink", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-b-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-t-ink font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-b-rule group-data-[row-rules=false]/table:border-b-0",
        "group-data-[hover-rows=true]/table:hover:bg-sunk has-aria-expanded:bg-sunk",
        "data-[state=selected]:bg-wash data-[state=selected]:*:first:font-bold",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      data-numeric={numeric || undefined}
      className={cn(
        "text-label h-11 px-3 text-left align-bottom whitespace-nowrap first:pl-0 last:pr-0 pb-2 group-data-[density=compact]/table:h-9 [&:has([role=checkbox])]:pr-0",
        numeric && "text-right tabular-nums",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      data-numeric={numeric || undefined}
      className={cn(
        "h-11 px-3 py-2 align-middle first:pl-0 last:pr-0 group-data-[density=compact]/table:h-9 group-data-[density=compact]/table:py-1 [&:has([role=checkbox])]:pr-0",
        numeric && "text-right tabular-nums lining-nums",
        className
      )}
      {...props}
    />
  )
}

/**
 * Caption above the table: "Table n." in Atkinson 16/700, then the title in Atkinson 16/400.
 * Without `number`, only the text. Title Case is applied to the title.
 */
function TableCaption({
  className,
  number,
  children,
  ...props
}: React.ComponentProps<"caption"> & { number?: number | string }) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        "caption-top pb-3 text-left font-sans text-base leading-6 text-ink",
        className
      )}
      {...props}
    >
      {number !== undefined ? (
        <span className="font-bold tabular-nums">Table {number}. </span>
      ) : null}
      {number !== undefined ? titleCaseNode(children) : children}
    </caption>
  )
}

/** Source note under a table, in `text-credit`. */
function TableNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="table-note"
      className={cn("text-credit mt-2", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableNote,
}
