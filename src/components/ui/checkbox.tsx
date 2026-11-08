import * as React from "react"
import { cn } from "@/lib/utils"

const CHECK_CLASS = "ie-check"

function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <input type="checkbox" data-slot="checkbox" className={cn(CHECK_CLASS, className)} {...props} />
}

export { Checkbox, CHECK_CLASS }
