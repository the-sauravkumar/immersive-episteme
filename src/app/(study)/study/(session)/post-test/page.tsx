import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Questions after learning") };

export const instant = false;

export default function Page() {
  return (
    <>
      <PageHeader title="Questions after learning" description="Questions about what you learned." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <AssessmentStep step="post_test" route="/study/post-test" />
      </Suspense>
    </>
  );
}
