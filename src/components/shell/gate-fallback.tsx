import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback while a gate checks access. Static, no motion beyond the skeleton pulse. */
export function GateFallback({ label = "Checking access…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-64" aria-hidden="true" />
      <Skeleton className="h-4 w-96 max-w-full" aria-hidden="true" />
    </div>
  );
}
