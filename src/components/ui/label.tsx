"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Label as LabelPrimitive } from "radix-ui"

/* Label (DESIGN.md 9.6): above its control, Atkinson 15/700 --ink, sentence case, no tracking. */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 font-sans text-[0.9375rem] leading-5 font-bold text-ink select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-ink-3 peer-disabled:cursor-not-allowed peer-disabled:text-ink-3",
        className
      )}
      {...props}
    />
  )
}

export { Label }
