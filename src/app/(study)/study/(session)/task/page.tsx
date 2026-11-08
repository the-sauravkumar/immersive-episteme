import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/study/action-form";
import { ReturnDetails } from "@/components/study/return-details";
import { StepFooter } from "@/components/study/step-footer";
import { StepProgress, stepCountOf } from "@/components/study/step-progress";
import { LEARNING_TASK_OPENING, learningTaskRules } from "@/features/study/learning-task-rules";
import { serverEnv } from "@/lib/env";
import { titleCase } from "@/lib/text/title-case";
import { startLearning } from "@/server/study/actions";
import { requireStep } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Introduction to the learning task") };

async function Onboarding() {
  const { state, position } = await requireStep("onboarding");
  const rules = learningTaskRules(state.study.protocol.config.exposure);
  return (
    <>
      <StepProgress count={stepCountOf(state.study.protocol.steps, position)} />
      <div className="flex flex-col gap-6">
        <p className="t-b max-w-[34rem] text-lime">{LEARNING_TASK_OPENING}</p>
        {rules.map((rule) => (
          <p key={rule} className="t-b max-w-[34rem] text-lime">
            {rule}
          </p>
        ))}
        <ReturnDetails
          origin={serverEnv().BETTER_AUTH_URL}
          studySlug={state.study.slug}
          participantCode={state.participantCode}
          title="Keep your codes before you start"
          lead="Write these down or save the link now. If the window closes, the return link brings you back to where you stopped."
        />
        <ActionForm action={startLearning} submitLabel="Start the learning task" pendingLabel="Opening…" />
      </div>
      <StepFooter />
    </>
  );
}

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
