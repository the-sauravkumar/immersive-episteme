import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";

export const metadata: Metadata = { title: "Questions Before You Start" };

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/** Study step `questionnaire_pre`: before allocation, blind to condition (D8: SSQ). Instruments from `config.questionnaires.pre` (study battery). */
export default function Page() {
  return (
    <>
      <PageHeader title="Questions Before You Start" description="A few questions before the study begins." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <AssessmentStep step="questionnaire_pre" route="/study/questionnaire/before" />
      </Suspense>
    </>
  );
}
