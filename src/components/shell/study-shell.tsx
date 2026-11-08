import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { countOf } from "@/components/brand/numbering";
import { cn } from "@/lib/utils";

const FRAME = "mx-auto w-full max-w-[80rem] px-4 xs:px-6 lg:px-8";
const COLUMN = "w-full max-w-[42rem]";

export interface StudyStep {
  current: number;
  total: number;
}

function StudyStepCount({ step, className }: { step: StudyStep; className?: string }) {
  return (
    <p data-slot="study-step" className={cn("t-label tabular-nums text-lime-dim", className)}>
      {countOf("Step", step.current, step.total)}
    </p>
  );
}

export function StudyShell({ children, step }: { children: ReactNode; step?: StudyStep }) {
  return (
    <div
      data-zone="study"
      className="study-root group/study flex min-h-dvh flex-col bg-vat"
    >
      <header className="border-b border-line">
        <div className={cn(FRAME, "flex min-h-14 flex-wrap items-center justify-between gap-x-4 py-2")}>
          <Wordmark size="study" />
          <div className="flex items-baseline gap-4">
            <p className="t-label">Study</p>
            {step ? <StudyStepCount step={step} /> : null}
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={cn(FRAME, "flex-1 py-10 outline-none max-xs:py-8")}
      >
        <div className={COLUMN}>{children}</div>
      </main>
      <footer className="border-t border-line">
        <p className={cn(FRAME, "t-b py-4 text-lime-dim")}>
          If anything is unclear, ask the study facilitator.
        </p>
      </footer>
    </div>
  );
}
