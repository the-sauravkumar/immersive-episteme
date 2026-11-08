import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { titleCaseNode } from "@/lib/text/title-case"
import { cn } from "@/lib/utils"

const alertVariants = cva(
  "group/alert relative grid w-full gap-1 border-t-[6px] border-lime-dim bg-vat-2 px-4 py-3 text-left t-b text-lime has-data-[slot=alert-action]:pr-28 has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:mt-0.5 *:[svg]:stroke-[2.4] *:[svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        info: "*:[svg]:text-lime",
        destructive: "border-madder-text *:[svg]:text-madder-text *:data-[slot=alert-title]:text-madder-text",
        ok: "border-ok *:[svg]:text-ok",
        warn: "border-turmeric *:[svg]:text-turmeric",
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
        "font-display font-bold group-has-[>svg]/alert:col-start-2 [&_a]:text-turmeric [&_a]:underline [&_a]:underline-offset-[0.2em]",
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
        "text-lime-dim group-has-[>svg]/alert:col-start-2 [&_a]:text-turmeric [&_a]:underline [&_a]:underline-offset-[0.2em] hover:[&_a]:decoration-2 [&_p:not(:last-child)]:mb-3",
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
