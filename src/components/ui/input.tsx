import * as React from "react"
import { cn } from "@/lib/utils"

const FIELD = cn(
  "w-full min-w-0 border border-lime-dim bg-vat-2 px-3 font-sans text-[17px] leading-[1.4] text-lime placeholder:text-lime-dim",
  "hover:not-disabled:border-lime",
  "disabled:cursor-not-allowed disabled:border-off-bg disabled:bg-off-bg disabled:text-off-fg",
  "aria-invalid:border-madder-text"
)

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(FIELD, "min-h-[46px] py-2", className)} {...props} />
}

export { Input, FIELD }
