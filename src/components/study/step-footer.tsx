import Link from "next/link";

import { cn } from "@/lib/utils";

/** A text link in study pages: indigo, underlined (never colour alone, R-A4), 44 px tall. */
export const STUDY_LINK_CLASS =
  "inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[3px] hover:text-indigo-hover hover:decoration-2";

/**
 * Every in-session page offers withdrawal (spec: withdrawal at any point). A plain 44 px text
 * link under a 1 px rule, the same on every step and for both conditions.
 *
 * `ruled={false}` is for a page whose content already ends on a closing rule (the session hub's
 * step list): the footer then sits under that rule instead of drawing a second, parallel rule
 * 48 px below it, which would read as an empty row.
 */
export function StepFooter({ ruled = true }: { ruled?: boolean } = {}) {
  return (
    <p
      data-slot="step-footer"
      className={cn(
        "flex flex-wrap items-center gap-x-2 font-sans text-[0.9375rem] leading-6 text-ink-2",
        ruled ? "mt-12 border-t border-rule pt-4" : "mt-6",
      )}
    >
      You can stop at any time.
      <Link href="/study/withdraw" className={STUDY_LINK_CLASS}>
        Withdraw from the study
      </Link>
    </p>
  );
}
