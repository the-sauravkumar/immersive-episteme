import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { titleCaseNode } from "@/lib/text/title-case"
import { cn } from "@/lib/utils"

/*
 * Alert (DESIGN.md 9.7): --ground fill, 1 px --rule-strong border, a 4 px left border in the
 * status colour (--ink for info), a 20 px icon, a bold word ("Error", "Note") as the title and
 * an Inter 15 body. Colour is never the only cue (R-A4): the caller passes the icon and the word.
 *
 * `ok` and `warn` are console, CMS and admin only; study surfaces use `info` or `destructive`
 * (errors), and the shared StateMessage for full-screen states.
 */
const alertVariants = cva(
  "group/alert relative grid w-full gap-1 rounded-card border border-l-4 border-rule-strong bg-ground px-4 py-3 text-left font-sans text-[0.9375rem] leading-6 text-ink has-data-[slot=alert-action]:pr-28 has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:stroke-[1.75] *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        info: "border-l-ink *:[svg]:text-ink",
        destructive: "border-l-danger *:[svg]:text-danger *:data-[slot=alert-title]:text-danger",
        ok: "border-l-ok *:[svg]:text-ok",
        warn: "border-l-warn *:[svg]:text-warn",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "info"}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-semibold group-has-[>svg]/alert:col-start-2 [&_a]:text-indigo [&_a]:underline [&_a]:underline-offset-[3px]",
        className
      )}
      {...props}
    >
      {titleCaseNode(children)}
    </div>
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-ink-2 group-has-[>svg]/alert:col-start-2 [&_a]:text-indigo [&_a]:underline [&_a]:underline-offset-[3px] hover:[&_a]:decoration-2 [&_p:not(:last-child)]:mb-3",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-1.5 right-1.5", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
