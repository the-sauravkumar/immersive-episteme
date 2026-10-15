/**
 * The wordmark "Immersive Episteme", plain text (DESIGN.md 5.1, 9.14, 9.16; DR-022).
 *
 *  - `public`: Anek Latin 600 at 22 px, a link home (public header). Anek is loaded by the public
 *    layout only; elsewhere `font-display` falls back to Atkinson.
 *  - `console`: Atkinson Hyperlegible Next 800 at 18 px, a link home (console rail).
 *  - `study`: Atkinson 800 at 18 px, plain text, never a link: study mode has no outbound
 *    navigation (9.14, 9.16). The StudyBar and the study shell both use this size, in both
 *    conditions.
 */
import Link from "next/link";

import { cn } from "@/lib/utils";

const NAME = "Immersive Episteme";

const SIZE = {
  public: "font-display text-[1.375rem] leading-7 font-semibold",
  console: "font-sans text-[1.125rem] leading-7 font-extrabold",
  study: "font-sans text-[1.125rem] leading-7 font-extrabold",
} as const;

export type WordmarkSize = keyof typeof SIZE;

export function Wordmark({ size, className }: { size: WordmarkSize; className?: string }) {
  const classes = cn("whitespace-nowrap text-ink", SIZE[size], className);
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
      className={cn(classes, "inline-flex min-h-11 items-center no-underline hover:underline hover:decoration-1 hover:underline-offset-[0.2em]")}
    >
      {NAME}
    </Link>
  );
}
