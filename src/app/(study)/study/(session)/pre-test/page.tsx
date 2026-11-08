import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Questions before learning") };

export const instant = false;

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
