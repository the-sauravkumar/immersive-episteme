import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { ParticipantGate } from "@/components/shell/gates";

export const instant = false;

export default function SessionStepsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<GateFallback label="Loading your session…" />}>
      <ParticipantGate>{children}</ParticipantGate>
    </Suspense>
  );
}
