"use client"

/*
 * Sheet (DESIGN.md 9.18): the Dialog rules on a side panel (paper, 1 px --rule-strong edge,
 * square, no shadow, 44 px "Close"). Motion is a 150 ms fade with a 4 px offset; zero
 * on study routes (global rule). Width never exceeds the viewport, so no horizontal scroll at
 * 390 px.
 */

import * as React from "react"
import { titleCaseNode } from "@/lib/text/title-case"
import { cn } from "@/lib/utils"
import { Dialog as SheetPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[rgb(0_0_0/0.5)] duration-(--dur-2) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto border-rule-strong bg-ground font-sans text-[0.9375rem] leading-6 text-ink duration-(--dur-2) data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:max-h-[85dvh] data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-[min(24rem,100vw)] data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-[min(24rem,100vw)] data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:max-h-[85dvh] data-[side=top]:border-b data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-1 data-[side=left]:data-open:slide-in-from-left-1 data-[side=right]:data-open:slide-in-from-right-1 data-[side=top]:data-open:slide-in-from-top-1 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-1 data-[side=left]:data-closed:slide-out-to-left-1 data-[side=right]:data-closed:slide-out-to-right-1 data-[side=top]:data-closed:slide-out-to-top-1 has-data-[slot=sheet-close-button]:*:data-[slot=sheet-header]:pr-28",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              data-slot="sheet-close-button"
              className="absolute top-3 right-3 px-3"
            >
              <XIcon aria-hidden="true" />
              Close
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 p-6 pb-0 max-xs:p-4 max-xs:pb-0", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-3 p-6 max-xs:p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "text-h3 pt-1.5 text-ink",
        className
      )}
      {...props}
    >
      {titleCaseNode(children)}
    </SheetPrimitive.Title>
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-[0.9375rem] leading-6 text-ink-2", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
