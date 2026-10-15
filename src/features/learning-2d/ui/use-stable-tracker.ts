"use client";

import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import type { TelemetryTracker } from "@/features/telemetry/client/tracker";

/**
 * The tracker itself (stable for the session), for effects and event handlers that must not
 * re-run when telemetry stats change. Throws outside <TelemetryProvider>, like useTelemetry().
 */
export function useStableTracker(): TelemetryTracker {
  const tracker = useOptionalTelemetry();
  if (!tracker) throw new Error("2D learning components must be used inside <TelemetryProvider> (src/features/telemetry/client).");
  return tracker;
}
