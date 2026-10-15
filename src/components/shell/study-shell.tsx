/**
 * Study flow shell (/study/*; DESIGN.md 9.16, 11.7): calm and minimal.
 *
 *  - Header: the wordmark (plain text, never a link), the "Study" eyebrow and, when the page
 *    knows it, "Step n of N" in tabular figures; a 2 px ink running-head rule below.
 *  - One 40rem column on `--ground` on every step, so the wordmark, eyebrow and footer never move.
 *    A page that needs more room breaks only that element out of the column itself (the
 *    concept-map canvas does, data-slot=map-canvas-region); the shell never widens.
 *  - No outbound navigation; the footer reads "Ask the study facilitator".
 *  - Study mode: `study-root` (font-synthesis none and the global zero-motion rule, which also
 *    reaches portalled dialogs), `a11y-reduce-motion`, the light theme forced, and only the High
 *    contrast accommodation applied (DR-019).
 *
 * The shell never reads the session and changes nothing about the study flow itself.
 */
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { countOf } from "@/components/brand/numbering";
import { cn } from "@/lib/utils";

import { DisplayPreferencesSync } from "./display-settings";

/** The study column: 40rem plus the 16 / 24 px gutters. */
const COLUMN = "mx-auto w-full max-w-[42rem] px-4 xs:max-w-[43rem] xs:px-6";

export interface StudyStep {
  current: number;
  total: number;
}

/** "Step n of N" in tabular figures. Pages may render it themselves when the layout cannot know it. */
export function StudyStepCount({ step, className }: { step: StudyStep; className?: string }) {
  return (
    <p data-slot="study-step" className={cn("text-timer text-ink-2", className)}>
      {countOf("Step", step.current, step.total)}
    </p>
  );
}

export function StudyShell({ children, step }: { children: ReactNode; step?: StudyStep }) {
  return (
    <div
      data-zone="study"
      className="study-root a11y-reduce-motion group/study flex min-h-dvh flex-col bg-ground"
    >
      <DisplayPreferencesSync zone="study" />
      <header className="border-b-2 border-ink">
        <div className={cn(COLUMN, "flex min-h-14 flex-wrap items-center justify-between gap-x-4 py-2")}>
          <Wordmark size="study" />
          <div className="flex items-baseline gap-4">
            <p className="text-eyebrow">Study</p>
            {step ? <StudyStepCount step={step} /> : null}
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={cn(COLUMN, "flex-1 py-10 outline-none max-xs:py-8")}
      >
        {children}
      </main>
      <footer className="border-t border-rule">
        <p className={cn(COLUMN, "py-4 text-[0.9375rem] leading-6 text-ink-2")}>
          If anything is unclear, ask the study facilitator.
        </p>
      </footer>
    </div>
  );
}
