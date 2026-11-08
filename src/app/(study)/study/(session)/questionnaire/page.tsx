import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Final Questionnaire") };

export const instant = false;

export default function Page() {
  return (
    <>
      <PageHeader title="Final Questionnaire" description="A short questionnaire about the session." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <AssessmentStep step="questionnaire_end" route="/study/questionnaire" />
      </Suspense>
    </>
  );
}
