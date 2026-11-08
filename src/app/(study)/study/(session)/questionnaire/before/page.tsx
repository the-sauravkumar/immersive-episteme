import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";

export const metadata: Metadata = { title: "Questions Before You Start" };

export const instant = false;

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
