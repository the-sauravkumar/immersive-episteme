"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

/*
 * Radio (DESIGN.md 9.5): a 20 px circle with a 1 px --rule-strong boundary and a 44 x 44 hit area.
 * Checked is an --indigo fill with an --on-indigo dot (at least 3:1 on --wash). Callers put each
 * item inside a full-row label with a 44 px minimum height (56 px option rows in study, 11.7).
 */
function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-5 shrink-0 rounded-full border border-rule-strong bg-surface after:absolute after:-inset-3 after:content-['']",
        "disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk",
        "aria-invalid:border-danger",
        "data-checked:border-indigo data-checked:bg-indigo",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="flex size-full items-center justify-center"
      >
        <span className="size-2 rounded-full bg-on-indigo" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
