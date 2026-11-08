import * as React from "react"
import { cn } from "@/lib/utils"

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
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden border border-line bg-vat-2 py-(--card-spacing) t-b text-lime",
        "[--card-spacing:--spacing(6)] max-xs:[--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(4)]",
        "data-interactive:border-lime-dim data-interactive:hover:bg-raised-hover",
        "data-plate:border-t-2 data-plate:border-t-turmeric",
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
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:border-line [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardEyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-eyebrow"
      className={cn("t-label", className)}
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

export { Card, CardHeader, CardFooter, CardEyebrow, CardContent }
