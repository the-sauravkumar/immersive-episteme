"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

/*
 * Tabs (DESIGN.md 9.6). Underline style only: the pill variant is removed (`variant="default"`
 * and `variant="line"` both render the underline style; the prop stays for call sites).
 *  - Each tab is at least 44 px tall, 0 16 px padding, Atkinson 16/600; inactive --ink-2
 *    (12.08:1), active --ink at 700 with a 3 px --indigo bottom border and `aria-selected`
 *    (Radix). The bold width is reserved (`ie-reserve-bold`), so nothing shifts.
 *  - The tablist sits on a 1 px --rule baseline and WRAPS to further rows; it never scrolls
 *    horizontally, so every tab name stays visible at 390 px.
 *  - Roving tabindex, arrow keys, Home and End come from Radix (ARIA tabs pattern).
 *  - No transition: tab changes are instant (study zero-motion rule, section 8).
 */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-4 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list flex text-ink-2 group-data-horizontal/tabs:w-full group-data-horizontal/tabs:flex-wrap group-data-horizontal/tabs:items-end group-data-horizontal/tabs:border-b group-data-horizontal/tabs:border-b-rule group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:border-l group-data-vertical/tabs:border-l-rule",
  {
    variants: {
      variant: {
        /** Underline (the only style). */
        default: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-11 items-center justify-center gap-2 border-transparent bg-transparent px-4 font-sans text-base leading-6 font-semibold whitespace-nowrap text-ink-2 hover:text-ink",
        "group-data-horizontal/tabs:-mb-px group-data-horizontal/tabs:border-b-[3px] group-data-horizontal/tabs:pt-[3px]",
        "group-data-vertical/tabs:-ml-px group-data-vertical/tabs:justify-start group-data-vertical/tabs:border-l-[3px]",
        "data-active:border-indigo data-active:font-bold data-active:text-ink",
        "disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:text-ink-3",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.75] [&_svg:not([class*='size-'])]:size-5",
        className
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <span className="ie-reserve-bold" data-label={children}>
          {children}
        </span>
      ) : (
        children
      )}
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
