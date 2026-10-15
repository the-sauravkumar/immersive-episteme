"use client";

/**
 * The learning phase controls SHARED by both conditions (2D pages and the 3D museum), so the
 * time budget behaves identically (DR-015, data-and-telemetry-layer §4e):
 *
 *   <LearningPhaseProvider budget={ctx.learningTime} mode={ctx.mode}>
 *     <LearningTimer />            // remaining time (fixed_time), finish control when allowed
 *     <LearningPhaseContent>…</LearningPhaseContent>   // hidden once the phase has ended
 *   </LearningPhaseProvider>
 *
 * - The countdown is `useLearningTimeBudget` (server clock plus monotonic time).
 * - When the budget runs out, the open exposure/navigation interval is closed with
 *   `budget_ended`, the telemetry queue is flushed, the content is replaced by a hand-back
 *   panel, and a study participant is sent back to the study flow (`/study/session`, where the
 *   study engine records the end and shows the next step). Demo and preview stay on the panel.
 * - "Finish learning" appears only when the budget allows it (`canFinish`: self-paced, or
 *   fixed_time with `allowEarlyFinish`) and needs a second confirming press.
 * The familiarisation practice (D5) runs on the same controls with `kind="practice"`: the
 * practice minutes as a fixed budget, practice wording, and `onEnd` (the study engine's
 * endFamiliarisation, which completes the step and redirects) instead of the plain hand-back.
 * Must be rendered inside <TelemetryProvider>.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import { PHASE_TEXT } from "@/features/learning/strings";
import { useLearningTimeBudget } from "@/features/learning/use-learning-time-budget";
import { useTelemetry } from "@/features/telemetry/client/provider";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

export type LearningPhaseMode = "study" | "demo" | "preview";
export type LearningPhaseKind = "learning" | "practice";

/** Wording of both conditions, from the one learner-string module (DESIGN.md 12.1 rule 2). */
const WORDING = PHASE_TEXT;

/** Retries of `onEnd` (e.g. a server refusing a few hundred ms early) before the error is shown. */
const END_RETRIES = 5;
const END_RETRY_MS = 2000;

/** Where a study participant goes when the learning phase ends. */
export const STUDY_HANDBACK_PATH = "/study/session";

type EndReason = "time_up" | "finished";

interface LearningPhaseValue {
  budget: LearningTimeBudget;
  mode: LearningPhaseMode;
  kind: LearningPhaseKind;
  /** Set when `onEnd` kept failing; the end panel offers a retry. */
  endError: string | null;
  retryEnd(): void;
  remainingSeconds: number | null;
  canFinish: boolean;
  ended: EndReason | null;
  finish(): void;
}

const LearningPhaseContext = createContext<LearningPhaseValue | null>(null);
const closedTrackers = new WeakSet<object>();

export function LearningPhaseProvider({
  budget,
  mode,
  kind = "learning",
  onEnd,
  children,
}: {
  budget: LearningTimeBudget;
  mode: LearningPhaseMode;
  kind?: LearningPhaseKind;
  /** Study mode: replaces the plain hand-back; resolves to an error message when it could not end the phase. */
  onEnd?: () => Promise<string | null>;
  children: ReactNode;
}) {
  const state = useLearningTimeBudget(budget);
  const telemetry = useTelemetry();
  const router = useRouter();
  const [finished, setFinished] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  const [endAttempt, setEndAttempt] = useState(0);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });
  const ended: EndReason | null = state.expired ? "time_up" : finished ? "finished" : null;

  // Close the open exposure/navigation interval with the phase's reason BEFORE this render
  // commits: the commit unmounts the content, whose own cleanup would otherwise end the
  // interval first as "closed". Idempotent per tracker, so re-renders cannot repeat it.
  if (ended && !closedTrackers.has(telemetry.timing)) {
    closedTrackers.add(telemetry.timing);
    telemetry.timing.end(ended === "time_up" ? "budget_ended" : "closed");
  }

  useEffect(() => {
    if (!ended) return;
    void telemetry.flush();
    if (mode !== "study") return;
    const end = onEndRef.current;
    if (!end) {
      router.replace(STUDY_HANDBACK_PATH);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (let i = 0; i <= END_RETRIES && !cancelled; i++) {
        const error = await end();
        if (!error || cancelled) return;
        if (i === END_RETRIES) setEndError(error);
        else await new Promise((r) => setTimeout(r, END_RETRY_MS));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ended, mode, router, telemetry, endAttempt]);

  const retryEnd = useCallback(() => {
    setEndError(null);
    setEndAttempt((n) => n + 1);
  }, []);

  const finish = useCallback(() => {
    if (state.canFinish) setFinished(true);
  }, [state.canFinish]);

  const value = useMemo<LearningPhaseValue>(
    () => ({ budget, mode, kind, endError, retryEnd, remainingSeconds: state.remainingSeconds, canFinish: state.canFinish && !ended, ended, finish }),
    [budget, mode, kind, endError, retryEnd, state.remainingSeconds, state.canFinish, ended, finish],
  );
  return <LearningPhaseContext.Provider value={value}>{children}</LearningPhaseContext.Provider>;
}

export function useLearningPhase(): LearningPhaseValue {
  const v = useContext(LearningPhaseContext);
  if (!v) throw new Error("useLearningPhase() must be used inside <LearningPhaseProvider>.");
  return v;
}

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** Announced once each to screen readers (polite), so the countdown never chatters. */
const ANNOUNCE_AT_SECONDS = [300, 60] as const;

export function LearningTimer({ className }: { className?: string }) {
  const { budget, kind, remainingSeconds, canFinish, finish, ended } = useLearningPhase();
  const w = WORDING[kind];
  const [confirming, setConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const announced = useRef(new Set<number>());

  useEffect(() => {
    if (remainingSeconds === null) return;
    for (const t of ANNOUNCE_AT_SECONDS) {
      if (remainingSeconds <= t && remainingSeconds > 0 && !announced.current.has(t)) {
        announced.current.add(t);
        setAnnouncement(`${t / 60} ${t === 60 ? "minute" : "minutes"} of ${kind} time left.`);
      }
    }
  }, [remainingSeconds, kind]);

  const showsTime = budget.mode === "fixed_time" && remainingSeconds !== null;
  if (ended || (!showsTime && !canFinish)) return null;

  return (
    <div className={cn("flex items-center gap-1", className)} data-slot="learning-timer">
      {showsTime ? (
        <p className="text-timer px-1 whitespace-nowrap text-ink md:px-2">
          <span className="sr-only text-ink-3 md:not-sr-only">{w.timeLeft} </span>
          <span role="timer" aria-live="off" aria-label={`${w.timeLeftLong}: ${formatRemaining(remainingSeconds)}`}>
            {formatRemaining(remainingSeconds)}
          </span>
        </p>
      ) : null}
      {canFinish ? (
        confirming ? (
          <span className="flex items-center gap-1">
            <Button type="button" onClick={finish}>
              {w.confirm}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {w.keep}
            </Button>
          </span>
        ) : (
          // Visible "Finish"; the accessible name is the full "Finish learning" (label in name).
          <Button type="button" variant="outline" aria-label={w.finishLong} onClick={() => setConfirming(true)} className="px-3 md:px-5">
            {w.finish}
          </Button>
        )
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

/** Renders the learning content while the phase runs; afterwards the hand-back panel. */
export function LearningPhaseContent({ children }: { children: ReactNode }) {
  const { ended, mode, kind, endError, retryEnd } = useLearningPhase();
  const w = WORDING[kind];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (ended) headingRef.current?.focus();
  }, [ended]);
  if (!ended) return <>{children}</>;
  return (
    <section aria-labelledby="learning-ended-title" className="mx-auto w-full max-w-[40rem] bg-ground px-4 py-16 xs:px-6">
      <h1 id="learning-ended-title" ref={headingRef} tabIndex={-1} className="text-title text-ink">
        {titleCase(ended === "time_up" ? w.timeUp : w.finished)}
      </h1>
      {mode === "study" && endError ? (
        <div className="mt-4 text-reading" role="alert">
          <p>{endError}</p>
          <Button type="button" className="mt-3" onClick={retryEnd}>
            Try again
          </Button>
        </div>
      ) : mode === "study" && kind === "practice" ? (
        <p className="mt-4 text-reading" role="status">
          Taking you to the next step of your session…
        </p>
      ) : mode === "study" ? (
        <p className="mt-4 text-reading">
          Taking you to the next step of your session…{" "}
          <Link href={STUDY_HANDBACK_PATH} className="inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[3px] hover:decoration-2">
            Continue
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-reading">
          This was a demo or preview, so nothing is recorded as study data.{" "}
          <Link href="/explore" className="inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[3px] hover:decoration-2">
            Back to Explore
          </Link>
        </p>
      )}
    </section>
  );
}
