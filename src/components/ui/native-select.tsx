import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * NativeSelect (DESIGN.md 9.2): the one select of the platform. A native <select> with
 * `appearance: none`, 44 px tall, a 1 px --rule-strong boundary (4.22:1 on paper), a 4 px radius,
 * 16 px type (no iOS zoom) and the project chevron. `appearance: none` "does not change the
 * element's functionality": the browser's own list, keyboard and screen-reader behaviour stay.
 * Forced colours revert it to `appearance: auto` and hide the chevron (globals.css `.ie-select`).
 *
 * `className` sizes the wrapper (`w-40`, `max-w-xs`); the select fills it. A select whose choice
 * changes the view never applies on change (WCAG SC 3.2.2): it sits in a form with a labelled
 * action button ("Show study"), WCAG technique H84. Selects with options that fit on one line at
 * 390 px are better as a Segmented control (9.3).
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <span data-slot="native-select" className={cn("ie-select", className)}>
      <select {...props} />
      <SelectChevron />
    </span>
  )
}

/** The project chevron: 20 px, 1.5 px stroke, square terminals, `aria-hidden`. */
function SelectChevron() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square">
      <path d="M5 8l5 5 5-5" />
    </svg>
  )
}

export { NativeSelect, SelectChevron }
