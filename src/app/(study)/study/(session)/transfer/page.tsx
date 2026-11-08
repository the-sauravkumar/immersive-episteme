import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Transfer task") };

export const instant = false;

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
