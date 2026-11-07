import { plural } from "@/lib/text/plural";

export function staleMetricsAdvice(stale: number, mayRecompute: boolean): string {
  const finding = `${plural(stale, "session")} ${stale === 1 ? "has" : "have"} missing or stale derived metrics.`;
  const action = mayRecompute
    ? "Recompute them on the Analytics page first, or the re-import check will report them."
    : "Your role cannot recompute them: ask a researcher or the principal investigator to recompute them on the Analytics page, or the re-import check will report them.";
  return `${finding} ${action}`;
}
