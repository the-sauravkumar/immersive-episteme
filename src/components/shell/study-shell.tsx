import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/utils";

const FRAME = "mx-auto w-full max-w-[82.5rem] px-4 xs:px-6 lg:px-8";
const COLUMN = "w-full max-w-[42rem]";

export function StudyShell({ children }: { children: ReactNode }) {
  return (
    <div
      data-zone="study"
      className="study-root group/study flex min-h-dvh flex-col bg-vat"
    >
      <header className="border-b border-line">
        <div className={cn(FRAME, "flex min-h-14 flex-wrap items-center justify-between gap-x-4 py-2")}>
          <Wordmark size="study" />
          <p className="t-label">Study</p>
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
