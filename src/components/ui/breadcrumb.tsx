import * as React from "react"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { ArrowLeft, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import Link from "next/link"

/*
 * Breadcrumb (DESIGN.md 9.16). One line, never wrapping: links are indigo, underlined, Inter
 * 15/500 with 44 px hit areas; the current page is ink-2 and truncates with an ellipsis.
 *
 * `BreadcrumbTrail` is the ready-made trail:
 *  - with more than three crumbs, the middle ones collapse behind a 44 px "…" button that
 *    reveals them in place (a native <details>, so it needs no client JavaScript);
 *  - the full path is in the `title` of the nav;
 *  - under 520 px only "← Parent" shows.
 * On 2D concept pages there is no breadcrumb at all (DESIGN.md 6: it would push the h1 down in
 * 2D only); the "Up to <parent>" control lives in the StudyBar there.
 *
 * The compositional parts (Breadcrumb, BreadcrumbList, ...) keep their shadcn names.
 */

const LINK =
  "inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[3px] hover:text-indigo-hover hover:decoration-2"

function Breadcrumb({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      className={cn("min-w-0", className)}
      {...props}
    />
  )
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden text-ui text-ink-2",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex min-w-0 shrink-0 items-center gap-2 whitespace-nowrap", className)}
      {...props}
    />
  )
}

function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "a"

  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn(LINK, className)}
      {...props}
    />
  )
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("block min-w-0 truncate text-ink-2", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("shrink-0 text-ink-3 [&>svg]:size-4", className)}
      {...props}
    >
      {children ?? (
        <ChevronRightIcon />
      )}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn(
        "flex size-11 items-center justify-center [&>svg]:size-5",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon
      />
      <span className="sr-only">More</span>
    </span>
  )
}

export interface BreadcrumbTrailItem {
  label: string
  /** Absent on the current page (the last item). */
  href?: string
}

type LinkComponent = React.ComponentType<{ href: string; className?: string; children?: React.ReactNode }>

/**
 * A complete trail from items (the last item is the current page). `linkComponent` renders the
 * links (for example a tracked link that logs navigation); it defaults to next/link.
 */
function BreadcrumbTrail({
  items,
  linkComponent: LinkComp = Link,
  className,
}: {
  items: readonly BreadcrumbTrailItem[]
  linkComponent?: LinkComponent
  className?: string
}) {
  if (items.length === 0) return null
  const current = items[items.length - 1]!
  const parent = items.length > 1 ? items[items.length - 2] : undefined
  const collapse = items.length > 3
  const first = items[0]!
  const middle = collapse ? items.slice(1, -2) : []
  const tail = collapse ? items.slice(-2) : items.slice(1)

  const crumb = (item: BreadcrumbTrailItem, isCurrent: boolean) =>
    isCurrent || !item.href ? (
      <BreadcrumbPage>{item.label}</BreadcrumbPage>
    ) : (
      <LinkComp href={item.href} className={LINK}>
        {item.label}
      </LinkComp>
    )

  return (
    <Breadcrumb title={items.map((i) => i.label).join(" › ")} className={className}>
      {/* Under 520 px: the parent only. */}
      {parent?.href ? (
        <p className="xs:hidden">
          <LinkComp href={parent.href} className={cn(LINK, "gap-2 text-ui")}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            {parent.label}
          </LinkComp>
        </p>
      ) : null}
      <BreadcrumbList className={cn(parent?.href && "max-xs:hidden")}>
        <BreadcrumbItem>{crumb(first, items.length === 1)}</BreadcrumbItem>
        {collapse ? (
          <>
            <BreadcrumbSeparator />
            <li className="inline-flex shrink-0 items-center">
              <details className="group/crumbs inline-flex shrink-0 items-center gap-2">
                <summary
                  className="inline-flex size-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-control text-ink-2 hover:bg-sunk group-open/crumbs:hidden [&::-webkit-details-marker]:hidden"
                  aria-label={`Show ${middle.length} more ${middle.length === 1 ? "level" : "levels"}`}
                >
                  <MoreHorizontalIcon aria-hidden="true" className="size-5" />
                </summary>
                <span className="inline-flex items-center gap-2">
                  {middle.map((item, i) => (
                    <span key={`${i}-${item.label}`} className="inline-flex items-center gap-2 whitespace-nowrap">
                      {i > 0 ? <ChevronRightIcon aria-hidden="true" className="size-4 text-ink-3" /> : null}
                      {crumb(item, false)}
                    </span>
                  ))}
                </span>
              </details>
            </li>
          </>
        ) : null}
        {tail.map((item, i) => (
          <React.Fragment key={`${i}-${item.label}`}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className={cn(i === tail.length - 1 && "shrink")}>{crumb(item, item === current)}</BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
  BreadcrumbTrail,
}
