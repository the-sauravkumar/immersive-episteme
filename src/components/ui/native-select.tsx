import * as React from "react"
import { cn } from "@/lib/utils"

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <span data-slot="native-select" className={cn("ie-select", className)}>
      <select {...props} />
      <SelectChevron />
    </span>
  )
}

function SelectChevron() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square">
      <path d="M5 8l5 5 5-5" />
    </svg>
  )
}

export { NativeSelect,  }
