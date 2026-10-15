import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Transfer task") };

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/** Study step `transfer`: items from the study's assessment battery (study_assessments). */
export default function Page() {
  return (
    <>
      <PageHeader title="Transfer task" description="Apply what you learned to a new question." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <AssessmentStep step="transfer" route="/study/transfer" />
      </Suspense>
    </>
  );
}
