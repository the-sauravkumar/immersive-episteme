"use client"

/* Progress (DESIGN.md 9.11, 11.7): a 2 px --ink bar on --rule (9.71:1 light, 9.95:1 dark), square,
   no transition. In high contrast --rule equals --ink, so the track takes --sunk there and the
   filled part stays distinguishable from the empty part. */

import * as React from "react"
import { cn } from "@/lib/utils"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-0.5 w-full items-center overflow-x-hidden bg-rule hc:bg-sunk",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 bg-ink"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
