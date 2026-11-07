import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { AssessmentStep } from "@/components/study/assessment-step";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Layout sketch") };

export const instant = false;

export default function LayoutSketchPage() {
  return (
    <>
      <PageHeader title="Layout sketch" description="Draw what you remember of how the learning task was laid out." />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <AssessmentStep step="layout_sketch" route="/study/layout-sketch" />
      </Suspense>
    </>
  );
}
