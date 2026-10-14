import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningGate } from "@/components/shell/gates";
import { LearningShell } from "@/components/shell/learning-shell";

/**
 * Immersive 3D condition. Same guard as /learn/2d with the condition swapped: a participant
 * assigned to "2d" is redirected to /study/session and never receives this content.
 */
export default function LearnImmersiveLayout({ children }: LayoutProps<"/learn/immersive">) {
  return (
    <LearningShell condition="immersive">
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <LearningGate condition="immersive">{children}</LearningGate>
      </Suspense>
    </LearningShell>
  );
}
