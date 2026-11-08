"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { createTelemetryTracker, type TelemetryStats, type TelemetryTracker, type TelemetryTrackerOptions } from "./tracker";

export type TelemetryConfig = TelemetryTrackerOptions;

const TelemetryContext = createContext<TelemetryTracker | null>(null);

export function TelemetryProvider({ config, children }: { config: TelemetryConfig; children: ReactNode }) {
  const { sessionId, contentVersion, appBuild, mode, endpoint } = config;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on the session identity only
  const tracker = useMemo(() => createTelemetryTracker(config), [sessionId, contentVersion, appBuild, mode, endpoint]);
  const running = useRef<TelemetryTracker | null>(null);
  useEffect(() => {
    running.current = tracker;
    tracker.start();
    return () => {
      running.current = null;
      queueMicrotask(() => {
        if (running.current === tracker) return;
        tracker.flushOnExit();
        tracker.stop();
      });
    };
  }, [tracker]);
  return <TelemetryContext.Provider value={tracker}>{children}</TelemetryContext.Provider>;
}

export type UseTelemetry = TelemetryTracker & { stats: TelemetryStats };

export function useTelemetry(): UseTelemetry {
  const tracker = useContext(TelemetryContext);
  if (!tracker) {
    throw new Error("useTelemetry() must be used inside <TelemetryProvider> (src/features/telemetry/client).");
  }
  const stats = useSyncExternalStore(tracker.subscribe, tracker.getStats, tracker.getStats);
  return useMemo(() => ({ ...tracker, stats }), [tracker, stats]);
}

export function usePauseWhile(active: boolean): void {
  const { timing } = useTrackerOrThrow();
  useEffect(() => {
    if (!active) return;
    timing.pause("modal");
    return () => timing.resume("modal");
  }, [timing, active]);
}

export function useOptionalTelemetry(): TelemetryTracker | null {
  return useContext(TelemetryContext);
}

function useTrackerOrThrow(): TelemetryTracker {
  const tracker = useContext(TelemetryContext);
  if (!tracker) throw new Error("Telemetry hooks must be used inside <TelemetryProvider> (src/features/telemetry/client).");
  return tracker;
}
