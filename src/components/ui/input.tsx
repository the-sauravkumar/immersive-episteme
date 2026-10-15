import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Input (DESIGN.md 9.6): 44 px, 1 px --rule-strong border (3:1 or more on every surface), 4 px
 * radius, --ground fill, Atkinson 16 px (avoids iOS zoom). Numbers use type="text" with
 * inputMode="numeric" and a pattern, units in the label; dates stay native with a visible
 * "Format: YYYY-MM-DD" hint; files use FileInput. Errors: `aria-invalid` turns the border
 * --danger; the field message (FieldError / FormMessage) carries the icon and the words, so colour
 * is never the only cue (R-A4). Focus is the global ring.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-control border border-rule-strong bg-ground px-3 font-sans text-base leading-6 text-ink placeholder:text-ink-3",
        "hover:not-disabled:border-ink-2",
        "disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk disabled:text-ink-3",
        "aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--danger)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
