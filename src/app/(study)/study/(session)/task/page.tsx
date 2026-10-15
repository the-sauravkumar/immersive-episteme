import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/study/action-form";
import { StepFooter } from "@/components/study/step-footer";
import { StepProgress, stepCountOf } from "@/components/study/step-progress";
import { titleCase } from "@/lib/text/title-case";
import { PHASE_TEXT } from "@/features/learning/strings";
import { getPool } from "@/server/db/client";
import { startLearning } from "@/server/study/actions";
import { requireStep } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Introduction to the learning task") };

/** The procedural sentence every participant sees when the condition texts are absent or unbalanced. */
const FALLBACK_ONBOARDING = "The next part is the learning task. When you continue, the learning environment opens.";

/** Largest allowed difference in word count between the per-condition onboarding texts (DESIGN.md 9.20, P23). */
const MAX_WORD_GAP = 0.1;

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

const onboardingOf = (config: unknown): string | null => {
  const v = config && typeof config === "object" ? (config as Record<string, unknown>).onboarding : null;
  return typeof v === "string" && v.trim() ? v : null;
};

/**
 * The researchers' per-condition onboarding text is shown only when every condition of the study
 * has one and their word counts differ by at most 10% (the P23 rule of the learning onboarding,
 * applied to this second onboarding surface). Otherwise every participant gets the same
 * procedural sentence, so an unbalanced protocol cannot give one condition more instruction
 * than the other; the imbalance is logged for the researchers.
 */
async function balancedOnboarding(studyId: string, own: unknown): Promise<string | null> {
  const text = onboardingOf(own);
  if (!text) return null;
  const r = await getPool().query<{ code: string; config: unknown }>("SELECT code, config FROM study_conditions WHERE study_id = $1", [studyId]);
  const texts = r.rows.map((row) => onboardingOf(row.config));
  if (texts.some((t) => t === null)) {
    console.error("[study] condition onboarding withheld: not every condition of the study has an onboarding text", { studyId });
    return null;
  }
  const counts = texts.map((t) => wordCount(t as string));
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  if (max > 0 && (max - min) / max > MAX_WORD_GAP) {
    console.error("[study] condition onboarding withheld: the per-condition texts differ by more than 10% in words", { studyId, counts });
    return null;
  }
  return text;
}

/**
 * Condition onboarding. The interface instructions are the researchers' text from the
 * condition config (`study_conditions.config.onboarding`), guarded by `balancedOnboarding`;
 * without it both conditions get the same procedural sentence. The time rule shown is the
 * study's single learning budget, the same for both conditions, and names the Finish control
 * by the label the StudyBar shows (PHASE_TEXT, the single source of learner-visible strings).
 * Set in `text-reading` at the 34rem measure.
 */
async function Onboarding() {
  const { state, position } = await requireStep("onboarding");
  const text = await balancedOnboarding(state.study.id, state.conditionConfig);
  const exposure = state.study.protocol.config.exposure;
  const timeRule =
    exposure.mode === "fixed_time" && exposure.minutes
      ? `You will have ${exposure.minutes} minutes for the learning task. When the time is up, the study moves on to the next part.` +
        (exposure.allowEarlyFinish ? ` You can also finish earlier with “${PHASE_TEXT.learning.finish}” in the top bar.` : "")
      : `Take the time you need. When you have finished, choose “${PHASE_TEXT.learning.finish}” in the top bar.`;
  return (
    <>
      <StepProgress count={stepCountOf(state.study.protocol.steps, position)} />
      <div className="flex flex-col gap-6">
        {text ? (
          <div className="text-reading max-w-[34rem] whitespace-pre-line text-ink">{text}</div>
        ) : (
          <p className="text-reading max-w-[34rem] text-ink">{FALLBACK_ONBOARDING}</p>
        )}
        <p className="text-reading max-w-[34rem] text-ink">{timeRule}</p>
        <ActionForm action={startLearning} submitLabel="Start the learning task" pendingLabel="Opening…" />
      </div>
      <StepFooter />
    </>
  );
}

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <>
      <PageHeader title="Introduction to the learning task" description="How the learning task works." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <Onboarding />
      </Suspense>
    </>
  );
}
