import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const OFF =
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:border-off-bg disabled:bg-off-bg disabled:text-off-fg aria-disabled:border-off-bg aria-disabled:bg-off-bg aria-disabled:text-off-fg"

const PRIMARY = cn(
  "border-turmeric bg-turmeric text-vat hover:border-turmeric-hi hover:bg-turmeric-hi active:border-turmeric-lo active:bg-turmeric-lo aria-expanded:bg-turmeric-hi",
  OFF
)

const buttonVariants = cva(
  cn(
    "group/button inline-flex max-w-full shrink-0 items-center justify-center gap-2 border-2 border-transparent",
    "font-display text-center text-[19px] leading-tight font-bold select-none sm:whitespace-nowrap",
    "transition-colors duration-(--dur-1)",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[2.4] [&_svg]:[stroke-linecap:square] [&_svg:not([class*='size-'])]:size-5"
  ),
  {
    variants: {
      variant: {
        default: PRIMARY,
        primary: PRIMARY,
        outline: cn("border-lime bg-transparent text-lime hover:bg-raised-hover active:bg-vat-2 aria-expanded:bg-raised-hover", OFF),
        ghost: cn(
          "bg-transparent text-lime underline decoration-1 underline-offset-[0.2em] hover:bg-raised-hover hover:decoration-2 aria-expanded:bg-raised-hover",
          "disabled:cursor-not-allowed disabled:text-off-fg disabled:no-underline disabled:hover:bg-transparent aria-disabled:cursor-not-allowed aria-disabled:text-off-fg"
        ),
        link: cn(
          "min-w-11 border-0 bg-transparent text-turmeric underline decoration-1 underline-offset-[0.2em] hover:text-turmeric-hi hover:decoration-2",
          "disabled:cursor-not-allowed disabled:text-off-fg disabled:no-underline aria-disabled:cursor-not-allowed aria-disabled:text-off-fg aria-disabled:no-underline"
        ),
        destructive: cn("border-madder-text bg-transparent text-madder-text hover:bg-raised-hover aria-expanded:bg-raised-hover", OFF),
        "destructive-solid": cn("border-madder bg-madder text-lime hover:border-lime active:border-madder-lo active:bg-madder-lo", OFF),
      },
      size: {
        default: "min-h-[46px] px-5 py-2",
        icon: "size-11 p-0",
        compact:
          "relative min-h-9 px-4 py-1 text-[17px] after:absolute after:-inset-1 after:min-h-11 after:min-w-11 after:content-['']",
      },
    },
    compoundVariants: [
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
