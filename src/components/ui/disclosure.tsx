import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/*
 * Disclosure (DESIGN.md 9.5): the one show/hide control, on <details>/<summary>. The summary is
 * `display: block` with its marker removed (MDN: "You can also change the style to display: block
 * to remove the disclosure triangle"), and carries a 20 px chevron in a 44 px box plus the state
 * word "Show" or "Hide" in `text-credit`, so the state is never conveyed by the glyph alone.
 * Native semantics: Enter and Space toggle, the open state is announced, find-in-page opens it.
 * No transition. `size="row"` is the 56 px row of the 2D section lists; `default` is 44 px.
 */
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
      <summary className={cn("rounded-control hover:bg-sunk", summaryClassName)}>
        <span className={cn("flex items-center gap-2 pr-2", size === "row" ? "min-h-14" : "min-h-11")}>
          <span aria-hidden="true" className="inline-grid size-11 shrink-0 place-items-center">
            <ChevronDownIcon className="ie-disclosure__chevron size-5 stroke-[1.75] text-ink" />
          </span>
          <span className="min-w-0 flex-1">{summary}</span>
          <span aria-hidden="true" className="text-credit shrink-0">
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
