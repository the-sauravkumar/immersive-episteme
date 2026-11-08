"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

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
  "group/tabs-list flex text-lime-dim group-data-horizontal/tabs:w-full group-data-horizontal/tabs:flex-wrap group-data-horizontal/tabs:items-end group-data-horizontal/tabs:border-b group-data-horizontal/tabs:border-b-line group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:border-l group-data-vertical/tabs:border-l-line",
  {
    variants: {
      variant: {
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
        "relative inline-flex min-h-11 items-center justify-center gap-2 border-transparent bg-transparent px-4 t-label whitespace-nowrap text-lime-dim hover:text-lime",
        "group-data-horizontal/tabs:-mb-px group-data-horizontal/tabs:border-b-4 group-data-horizontal/tabs:pt-1",
        "group-data-vertical/tabs:-ml-px group-data-vertical/tabs:justify-start group-data-vertical/tabs:border-l-4",
        "data-active:border-turmeric data-active:text-lime",
        "disabled:cursor-not-allowed disabled:text-lime-dim disabled:hover:text-lime-dim",
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
