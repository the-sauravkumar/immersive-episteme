import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";

export const metadata: Metadata = { title: "Questions About the Learning Task" };

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/** Study step `questionnaire_post_learning`: immediately after learning (D8: cognitive load, SSQ, presence for the 3D group only). Instruments from `config.questionnaires.postLearning` (study battery). */
export default function Page() {
  return (
    <>
      <PageHeader title="Questions About the Learning Task" description="A few questions about the learning task you just finished." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <AssessmentStep step="questionnaire_post_learning" route="/study/questionnaire/after-learning" />
      </Suspense>
    </>
  );
}
