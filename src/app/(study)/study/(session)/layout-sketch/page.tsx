import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { AssessmentStep } from "@/components/study/assessment-step";

export const metadata: Metadata = { title: "Layout Sketch" };

export const instant = false;

export default function LayoutSketchPage() {
  return (
    <Suspense fallback={<GateFallback label="Loading your session…" />}>
      <AssessmentStep step="layout_sketch" route="/study/layout-sketch" />
    </Suspense>
  );
}
