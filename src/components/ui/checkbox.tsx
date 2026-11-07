import * as React from "react"
import { cn } from "@/lib/utils"

const CHECK_CLASS = "ie-check"

function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" data-slot="checkbox" className={cn(CHECK_CLASS, className)} {...props} />
}

function Radio({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="radio" data-slot="radio" className={cn(CHECK_CLASS, className)} {...props} />
}

function OptionRow({ className, children, ...props }: React.ComponentProps<"label">) {
  return (
    <label data-slot="option-row" className={cn("ie-option", className)} {...props}>
      {children}
      <span aria-hidden="true" className="ie-option__selected t-label">
        Selected
      </span>
    </label>
  )
}

export { Checkbox, Radio, OptionRow, CHECK_CLASS }
