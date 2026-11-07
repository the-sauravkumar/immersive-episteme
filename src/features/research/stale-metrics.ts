import { plural } from "@/lib/text/plural";

export function staleMetricsAdvice(stale: number): string {
  return `${plural(stale, "session")} ${stale === 1 ? "has" : "have"} missing or stale derived metrics. Recompute them on the Analytics page first, or the re-import check will report them.`;
}
