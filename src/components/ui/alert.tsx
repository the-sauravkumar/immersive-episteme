import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { titleCaseNode } from "@/lib/text/title-case"
import { cn } from "@/lib/utils"

/*
 * Alert (DESIGN.md 9.6): --ground fill, a full 1 px --rule-strong border, radius 0, no left bar,
 * a 20 px icon in the status colour (--ink for info), a bold word ("Error", "Note") as the title
 * and a 16 px body. Colour is never the only cue (R-A4): the caller passes the icon and the word.
 *
 * `ok` and `warn` are console, CMS and admin only; study surfaces use `info` or `destructive`
 * (errors), and the shared StateMessage for full-screen states.
 */
const alertVariants = cva(
  "group/alert relative grid w-full gap-1 rounded-card border border-rule-strong bg-ground px-4 py-3 text-left font-sans text-base leading-6 text-ink has-data-[slot=alert-action]:pr-28 has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:stroke-[1.75] *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        info: "*:[svg]:text-ink",
        destructive: "*:[svg]:text-danger *:data-[slot=alert-title]:text-danger",
        ok: "*:[svg]:text-ok",
        warn: "*:[svg]:text-warn",
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
        "font-bold group-has-[>svg]/alert:col-start-2 [&_a]:text-indigo [&_a]:underline [&_a]:underline-offset-[0.2em]",
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
        "text-ink-2 group-has-[>svg]/alert:col-start-2 [&_a]:text-indigo [&_a]:underline [&_a]:underline-offset-[0.2em] hover:[&_a]:decoration-2 [&_p:not(:last-child)]:mb-3",
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
