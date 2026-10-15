import { cn } from "@/lib/utils"

/* Loading block (DESIGN.md 8, 9.7): a static --sunk block. No pulse, in any area. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-[2px] bg-sunk", className)}
      {...props}
    />
  )
}

export { Skeleton }
