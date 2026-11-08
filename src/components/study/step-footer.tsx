import Link from "next/link";

import { cn } from "@/lib/utils";

export const STUDY_LINK_CLASS =
  "inline-flex min-h-11 items-center text-turmeric underline decoration-1 underline-offset-[0.2em] hover:text-turmeric-hi hover:decoration-2";

export function StepFooter({ ruled = true }: { ruled?: boolean } = {}) {
  return (
    <p
      data-slot="step-footer"
      className={cn(
        "flex flex-wrap items-center gap-x-2 font-sans t-s text-lime-dim",
        ruled ? "mt-12 border-t border-line pt-4" : "mt-6",
      )}
    >
      You can stop at any time.
      <Link href="/study/withdraw" className={STUDY_LINK_CLASS}>
        Withdraw from the study
      </Link>
    </p>
  );
}
