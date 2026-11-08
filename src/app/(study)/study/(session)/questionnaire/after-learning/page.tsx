import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";

export const metadata: Metadata = { title: "Questions About the Learning Task" };

export const instant = false;

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
