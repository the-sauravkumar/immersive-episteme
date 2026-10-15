"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon } from "lucide-react"

/*
 * Checkbox (DESIGN.md 9.5): a 20 px box with a 1 px --rule-strong boundary and a 44 x 44 hit area
 * (the ::after extends 12 px on every side). Checked is an --indigo fill with an --on-indigo mark,
 * so on a selected --wash row the boundary stays at least 3:1 (indigo on wash 8.25 light, 7.01
 * dark). An unchecked control is never shown on --wash (rule-strong on dark wash is 2.82).
 * Callers put it inside a full-row label with a 44 px minimum height.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-5 shrink-0 items-center justify-center rounded-[2px] border border-rule-strong bg-surface after:absolute after:-inset-3 after:content-['']",
        "disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk",
        "aria-invalid:border-danger",
        "data-checked:border-indigo data-checked:bg-indigo data-checked:text-on-indigo",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-4 [&>svg]:stroke-[2.5]"
      >
        <CheckIcon aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
