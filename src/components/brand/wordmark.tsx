/**
 * The wordmark "Immersive Episteme" in Source Serif 4 at weight 600 (DESIGN.md 5.1, 9.14, 9.16).
 *
 *  - `public`: 22 px, a link home (public header).
 *  - `console`: 20 px, a link home (console rail).
 *  - `study`: 18 px, plain text, never a link: study mode has no outbound navigation (9.14, 9.16).
 *    The StudyBar and the study shell both use this size, in both conditions.
 */
import Link from "next/link";

import { cn } from "@/lib/utils";

const NAME = "Immersive Episteme";

const SIZE = {
  public: "text-[1.375rem] leading-7",
  console: "text-[1.25rem] leading-7",
  study: "text-[1.125rem] leading-7",
} as const;

export type WordmarkSize = keyof typeof SIZE;

export function Wordmark({ size, className }: { size: WordmarkSize; className?: string }) {
  const classes = cn("font-serif font-semibold tracking-[-0.01em] whitespace-nowrap text-ink", SIZE[size], className);
  if (size === "study") {
    return (
      <span data-slot="wordmark" className={classes}>
        {NAME}
      </span>
    );
  }
  return (
    <Link
      href="/"
      data-slot="wordmark"
      // 44 px tall hit area without changing the type's line box.
      className={cn(classes, "inline-flex min-h-11 items-center no-underline hover:underline hover:decoration-1 hover:underline-offset-4")}
    >
      {NAME}
    </Link>
  );
}
