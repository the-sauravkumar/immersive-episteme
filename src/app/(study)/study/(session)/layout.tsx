import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { ParticipantGate } from "@/components/shell/gates";

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/**
 * In-session study steps: require a valid, server-verified participant study session
 * (signed cookie + live `study_sessions` row). Otherwise redirect to /study.
 */
export default function SessionStepsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<GateFallback label="Loading your session…" />}>
      <ParticipantGate>{children}</ParticipantGate>
    </Suspense>
  );
}
