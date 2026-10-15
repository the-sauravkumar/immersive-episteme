import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Button (DESIGN.md 9.1). 44 px by default, 3 px radius, Inter 15/500, sentence case, optional
 * 20 px lucide icon (stroke 1.75) with an 8 px gap. No press translate. Focus is the global ring
 * in globals.css (2 px indigo outline + 4 px ground halo; HC double ring), so no ring classes here.
 *
 * The deprecated names (variant `secondary`; sizes `xs`, `sm`, `lg`, `icon-xs`, `icon-sm`,
 * `icon-lg`) are removed: tests/unit/design/dead-aliases.test.ts keeps them out (residual risk 6).
 */
const DISABLED =
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:text-ink-3 aria-disabled:text-ink-3"

const PRIMARY = cn(
  "bg-indigo text-on-indigo hover:bg-indigo-hover aria-expanded:bg-indigo-hover",
  DISABLED,
  "disabled:border-rule disabled:bg-transparent aria-disabled:border-rule aria-disabled:bg-transparent"
)
const OUTLINE = cn(
  "border-rule-strong bg-transparent text-ink hover:bg-sunk aria-expanded:bg-sunk",
  DISABLED,
  "disabled:border-rule disabled:hover:bg-transparent aria-disabled:border-rule aria-disabled:hover:bg-transparent"
)

const buttonVariants = cva(
  cn(
    "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-control border border-transparent",
    "font-sans text-[0.9375rem] leading-5 font-medium whitespace-nowrap select-none",
    "transition-colors duration-(--dur-1)",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.75] [&_svg:not([class*='size-'])]:size-5"
  ),
  {
    variants: {
      variant: {
        default: PRIMARY,
        primary: PRIMARY,
        outline: OUTLINE,
        ghost: cn(
          "bg-transparent text-ink hover:bg-sunk aria-expanded:bg-sunk",
          DISABLED,
          "disabled:hover:bg-transparent aria-disabled:hover:bg-transparent"
        ),
        link: cn(
          "min-w-11 bg-transparent text-indigo underline decoration-1 underline-offset-[3px] hover:text-indigo-hover hover:decoration-2",
          DISABLED,
          "disabled:no-underline aria-disabled:no-underline"
        ),
        destructive: cn(
          "border-danger bg-transparent text-danger hover:bg-sunk aria-expanded:bg-sunk",
          DISABLED,
          "disabled:border-rule disabled:hover:bg-transparent aria-disabled:border-rule aria-disabled:hover:bg-transparent"
        ),
        /** Filled danger: ONLY the confirm button inside a destructive-action dialog (9.1). */
        "destructive-solid": cn(
          "border-danger bg-danger text-on-indigo hover:underline hover:underline-offset-[3px]",
          DISABLED,
          "disabled:border-rule disabled:bg-transparent aria-disabled:border-rule aria-disabled:bg-transparent"
        ),
      },
      size: {
        default: "h-11 px-5",
        /** 44 x 44 with a 20 px glyph. */
        icon: "size-11 p-0",
        /** 36 px visual, console and CMS dense tables only; keeps a 44 x 44 hit area. */
        compact:
          "relative h-9 px-4 after:absolute after:-inset-1 after:min-h-11 after:min-w-11 after:content-['']",
      },
    },
    compoundVariants: [
      // A link-styled button keeps the 44 px height but sits on the text edge.
      { variant: "link", size: ["default", "compact"], className: "px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
