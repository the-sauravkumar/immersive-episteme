import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Questions before learning") };

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/** Study step `pre_test`: items from the study's assessment battery (study_assessments). */
export default function Page() {
  return (
    <>
      <PageHeader title="Questions before learning" description="A short set of questions about what you already know." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <AssessmentStep step="pre_test" route="/study/pre-test" />
      </Suspense>
    </>
  );
}
