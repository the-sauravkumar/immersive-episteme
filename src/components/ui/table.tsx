"use client"

import * as React from "react"
import { titleCaseNode } from "@/lib/text/title-case"
import { cn } from "@/lib/utils"

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
            "group/table w-full caption-top border-collapse border-b border-b-line text-left t-table text-lime",
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
      className={cn("[&_tr]:border-b-2 [&_tr]:border-b-lime-dim", className)}
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
        "border-t-2 border-t-lime-dim font-semibold [&>tr]:last:border-b-0",
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
        "border-b border-b-line group-data-[row-rules=false]/table:border-b-0",
        "group-data-[hover-rows=true]/table:hover:bg-row-hover has-aria-expanded:bg-row-hover",
        "data-[state=selected]:bg-raised-hover data-[state=selected]:*:first:font-bold",
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
        "h-11 px-3 text-left align-bottom font-sans text-[15px] leading-[1.3] font-semibold whitespace-nowrap text-lime first:pl-0 last:pr-0 pb-2 group-data-[density=compact]/table:h-9 [&:has([role=checkbox])]:pr-0",
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
        "caption-top pb-3 text-left t-b text-lime",
        className
      )}
      {...props}
    >
      {number !== undefined ? (
        <span className="font-display font-bold tabular-nums">Table {number}. </span>
      ) : null}
      {number !== undefined ? titleCaseNode(children) : children}
    </caption>
  )
}

function TableNote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="table-note"
      className={cn("t-s text-lime-dim mt-2", className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell }
