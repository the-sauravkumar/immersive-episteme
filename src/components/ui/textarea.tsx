import * as React from "react"
import { cn } from "@/lib/utils"

/* Textarea (DESIGN.md 9.6): the Input rules, at least three lines tall (study free text uses a
   132 px minimum at its call site, 11.7). */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-control border border-rule-strong bg-ground px-3 py-2.5 font-sans text-base leading-6 text-ink placeholder:text-ink-3 hover:not-disabled:border-ink-2",
        "disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink-3",
        "aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
