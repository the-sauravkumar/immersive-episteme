import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Input (DESIGN.md 9.5): 44 px, 1 px --rule-strong border (3:1 or more on every surface), 3 px
 * radius, --surface fill, Inter 16 px (avoids iOS zoom). Errors: `aria-invalid` turns the border
 * --danger; the field message (FieldError / FormMessage) carries the icon and the words, so colour
 * is never the only cue (R-A4). Focus is the global ring.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-control border border-rule-strong bg-surface px-3 font-sans text-base leading-6 text-ink placeholder:text-ink-3",
        "file:mr-3 file:inline-flex file:h-8 file:border-0 file:bg-transparent file:font-sans file:text-[0.9375rem] file:font-medium file:text-ink",
        "disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink-3",
        "aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
