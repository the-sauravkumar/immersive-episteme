import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningGate } from "@/components/shell/gates";
import { LearningShell } from "@/components/shell/learning-shell";

/**
 * Immersive 3D condition. Same guard as /learn/2d with the condition swapped: a participant
 * assigned to "2d" is redirected to /study/session and never receives this content.
 */
/**
 * Navigations into the learning condition may block (Next 16 `instant` route segment config,
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/
 * instant.md, "Disabling instant"). The gate verifies the participant's signed session on the
 * server for every navigation, and gated participant pages must not be shown from a prefetched
 * shell; instant-navigation validation does not apply here.
 */
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
