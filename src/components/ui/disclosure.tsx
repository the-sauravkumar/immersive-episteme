import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

function Disclosure({
  summary,
  children,
  defaultOpen,
  size = "default",
  className,
  summaryClassName,
  contentClassName,
  ...props
}: Omit<React.ComponentProps<"details">, "open"> & {
  summary: React.ReactNode
  defaultOpen?: boolean
  size?: "default" | "row"
  summaryClassName?: string
  contentClassName?: string
}) {
  return (
    <details data-slot="disclosure" open={defaultOpen} className={cn("ie-disclosure", className)} {...props}>
      <summary className={cn("hover:bg-raised-hover", summaryClassName)}>
        <span className={cn("flex items-center gap-2 pr-2", size === "row" ? "min-h-14" : "min-h-11")}>
          <span aria-hidden="true" className="inline-grid size-11 shrink-0 place-items-center">
            <ChevronDownIcon className="ie-disclosure__chevron size-5 stroke-[2.4] text-turmeric" />
          </span>
          <span className="min-w-0 flex-1">{summary}</span>
          <span aria-hidden="true" className="t-s text-lime-dim shrink-0">
            <span className="ie-disclosure__show">Show</span>
            <span className="ie-disclosure__hide">Hide</span>
          </span>
        </span>
      </summary>
      <div className={cn("pt-2 pb-3 pl-11", contentClassName)}>{children}</div>
    </details>
  )
}

export { Disclosure }
