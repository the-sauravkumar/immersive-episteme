import * as React from "react"
import { titleCaseNode } from "@/lib/text/title-case"
import { cn } from "@/lib/utils"

/*
 * Card (DESIGN.md 9.2): --surface, 1 px --rule border, 2 px radius, no shadow, 24 px padding
 * (16 px under 520 px). Never behind claims in study (the knowledge surface is --ground).
 *
 *  - `parallel`: cards that sit side by side in a grid. The title zone reserves two lines so a
 *    one-line title leaves no gap, and the footer (actions) sits on one baseline via `mt-auto`.
 *  - `interactive`: the whole card is a link; the boundary becomes --rule-strong (3.72:1) and
 *    hover fills --sunk.
 *  - `plate`: an optional "plate head", a 2 px --ink top border (pair with `CardEyebrow`).
 *  - `size="sm"`: 16 px padding for dense console grids.
 */
function Card({
  className,
  size = "default",
  parallel = false,
  interactive = false,
  plate = false,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  parallel?: boolean
  interactive?: boolean
  plate?: boolean
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-parallel={parallel || undefined}
      data-interactive={interactive || undefined}
      data-plate={plate || undefined}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-card border border-rule bg-surface py-(--card-spacing) text-[0.9375rem] leading-6 text-ink",
        "[--card-spacing:--spacing(6)] max-xs:[--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(4)]",
        "data-interactive:border-rule-strong data-interactive:hover:bg-sunk",
        "data-plate:border-t-2 data-plate:border-t-ink",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:border-rule [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

/** Eyebrow above the title (tracked uppercase Inter, ink-3). */
function CardEyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-eyebrow"
      className={cn("text-eyebrow", className)}
      {...props}
    />
  )
}

function CardTitle({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "text-h3 text-ink group-data-parallel/card:min-h-[2lh] group-data-[size=sm]/card:text-[1.0625rem] group-data-[size=sm]/card:leading-6",
        className
      )}
      {...props}
    >
      {titleCaseNode(children)}
    </div>
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[0.9375rem] leading-6 text-ink-2", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

/** Actions row. `mt-auto` keeps parallel cards' actions on one baseline (alignment.spec.ts). */
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "mt-auto flex flex-wrap items-center gap-3 px-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardEyebrow,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
