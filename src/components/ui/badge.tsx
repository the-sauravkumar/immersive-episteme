import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const NEUTRAL = "border-lime-dim text-lime"

const badgeVariants = cva(
  "group/badge inline-flex min-h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border bg-transparent px-2 font-sans text-sm leading-5 font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5! [&>svg]:stroke-2",
  {
    variants: {
      variant: {
        neutral: NEUTRAL,
        ok: "border-ok text-ok",
        warn: "border-turmeric text-turmeric",
        danger: "border-madder-text text-madder-text",
        link: "border-turmeric text-turmeric underline underline-offset-[0.2em]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function Badge({
  className,
  variant = "neutral",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge,  }
