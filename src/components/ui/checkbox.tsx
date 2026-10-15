import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * Checkbox and radio (DESIGN.md 9.6): the native input, restyled (globals.css `.ie-check`). 20 px,
 * a 1.5 px --rule-strong border; checked = --indigo fill with a drawn --on-indigo tick (a radio
 * gets an indigo ring and dot). Native semantics, keyboard and form participation are unchanged;
 * forced colours revert to `appearance: auto`. Callers put it inside a full-row label of at least
 * 44 px (56 px for study options), so the label carries the target. `CHECK_CLASS` is the same
 * skin for call sites that render the input themselves.
 */
const CHECK_CLASS = "ie-check"

function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" data-slot="checkbox" className={cn(CHECK_CLASS, className)} {...props} />
}

function Radio({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="radio" data-slot="radio" className={cn(CHECK_CLASS, className)} {...props} />
}

/**
 * A full-row option (9.6): a label of at least 44 px around a checkbox or radio; when checked the
 * row turns --wash and shows the word "Selected" (its space is reserved, so nothing shifts).
 */
function OptionRow({ className, children, ...props }: React.ComponentProps<"label">) {
  return (
    <label data-slot="option-row" className={cn("ie-option", className)} {...props}>
      {children}
      <span aria-hidden="true" className="ie-option__selected text-ui">
        Selected
      </span>
    </label>
  )
}

export { Checkbox, Radio, OptionRow, CHECK_CLASS }
