import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningGate } from "@/components/shell/gates";
import { LearningShell } from "@/components/shell/learning-shell";

/**
 * Conventional 2D condition. LearningGate runs the server-side condition guard before any
 * child renders: participant assigned to "2d", public demo, or staff preview. A participant
 * assigned to "immersive" is redirected to /study/session. The learning pages ((content)/layout)
 * then resolve the learning context once and mount the session (telemetry, learning phase) that
 * persists across the condition's pages; the familiarisation practice (practice/) resolves the
 * practice context instead, so it never starts the learning clock.
 */
/**
 * Navigations into the learning condition may block (Next 16 `instant` route segment config,
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/
 * instant.md, "Disabling instant"). The gate verifies the participant's signed session on the
 * server for every navigation, and gated participant pages must not be shown from a prefetched
 * shell; instant-navigation validation does not apply here.
 */
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
