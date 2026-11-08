import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningGate } from "@/components/shell/gates";
import { LearningShell } from "@/components/shell/learning-shell";

export const instant = false;

export default function Learn2dLayout({ children }: LayoutProps<"/learn/2d">) {
  return (
    <LearningShell condition="2d">
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <LearningGate condition="2d">{children}</LearningGate>
      </Suspense>
    </LearningShell>
  );
}
