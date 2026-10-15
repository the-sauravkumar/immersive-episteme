import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Badge (DESIGN.md 9.6). No pills: 24 px tall, 2 px radius, 1 px --rule-strong box, Atkinson
 * 14/20 at 600, sentence case, no tracking, --ink-2. Never coloured per tradition.
 *
 * Status variants (`ok`, `warn`, `danger`) are for console, CMS and admin only. Colour is never
 * the only cue (R-A4): the caller always passes the word ("Published", "Under review", "Error")
 * and, for status, a 12 px icon as the first child.
 *
 * The deprecated variant names (`default`, `secondary`, `outline`, `ghost`, `destructive`) are
 * removed (residual risk 6; tests/unit/design/dead-aliases.test.ts).
 */
const NEUTRAL = "text-ink-2"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-badge border border-rule-strong bg-ground px-2 font-sans text-sm leading-5 font-semibold whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5! [&>svg]:stroke-2",
  {
    variants: {
      variant: {
        neutral: NEUTRAL,
        ok: "text-ok",
        warn: "text-warn",
        danger: "text-danger",
        /** A badge that is itself a link (rare): indigo, underlined. */
        link: "text-indigo underline underline-offset-[0.2em]",
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

export { Badge, badgeVariants }
