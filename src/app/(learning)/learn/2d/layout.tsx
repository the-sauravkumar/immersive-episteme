import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningGate } from "@/components/shell/gates";
import { LearningShell } from "@/components/shell/learning-shell";

/**
 * Conventional 2D condition. LearningGate runs the server-side condition guard before any
 * child renders: participant assigned to "2d", public demo, or staff preview. A participant
 * assigned to "immersive" is redirected to /study/session.
 */
export default function Learn2dLayout({ children }: LayoutProps<"/learn/2d">) {
  return (
    <LearningShell condition="2d">
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <LearningGate condition="2d">{children}</LearningGate>
      </Suspense>
    </LearningShell>
  );
}
