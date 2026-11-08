import Link from "next/link";

import { gatedLinkPrefetch } from "@/lib/access/invite-paths";
import { cn } from "@/lib/utils";

const NAME = "Immersive Episteme";

const SIZE = {
  public: "font-display text-[24px] leading-7 font-extrabold",
  console: "font-display text-[20px] leading-7 font-extrabold",
  study: "font-display text-[20px] leading-7 font-extrabold",
} as const;

export type WordmarkSize = keyof typeof SIZE;

export function Wordmark({ size, className }: { size: WordmarkSize; className?: string }) {
  const classes = cn("whitespace-nowrap text-lime", SIZE[size], className);
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
      prefetch={gatedLinkPrefetch("/")}
      data-slot="wordmark"
      className={cn(classes, "inline-flex min-h-11 items-center no-underline hover:underline hover:decoration-1 hover:underline-offset-[0.2em]")}
    >
      {NAME}
    </Link>
  );
}
