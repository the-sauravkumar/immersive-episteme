import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningGate } from "@/components/shell/gates";
import { LearningShell } from "@/components/shell/learning-shell";

export const instant = false;

export default function LearnImmersiveLayout({ children }: LayoutProps<"/learn/immersive">) {
  return (
    <LearningShell condition="immersive">
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <LearningGate condition="immersive">{children}</LearningGate>
      </Suspense>
    </LearningShell>
  );
}
