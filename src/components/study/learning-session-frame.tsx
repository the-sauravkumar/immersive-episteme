"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { bindLearningTelemetry, closeOpenStop, finishLearning, unbindLearningTelemetry } from "@/features/study/learning-progress";
import { useOptionalTelemetry } from "@/features/telemetry/client";
import { setLongTimeout } from "@/lib/timers/long-timeout";

export function capTimings(endsAt: string, serverNow: string, warningMinutes: number): { untilWarningMs: number; untilCapMs: number } {
  const untilCapMs = Date.parse(endsAt) - Date.parse(serverNow);
  return { untilWarningMs: untilCapMs - warningMinutes * 60_000, untilCapMs };
}

export function LearningSessionFrame({ endsAt, serverNow, warningMinutes, children }: { endsAt: string | null; serverNow: string; warningMinutes: number; children: ReactNode }) {
  const telemetry = useOptionalTelemetry();
  const [warned, setWarned] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!telemetry) return;
    const track = telemetry.track.bind(telemetry) as unknown as Parameters<typeof bindLearningTelemetry>[0] & object;
    bindLearningTelemetry(track);
    return () => queueMicrotask(() => unbindLearningTelemetry(track));
  }, [telemetry]);

  useEffect(() => {
    const leaving = () => closeOpenStop();
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", leaving);
    window.addEventListener("pageshow", returned);
    return () => {
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("pageshow", returned);
    };
  }, []);

  useEffect(() => {
    if (!endsAt) return;
    const { untilWarningMs, untilCapMs } = capTimings(endsAt, serverNow, warningMinutes);
    const cancelWarning = setLongTimeout(() => setWarned(true), untilWarningMs);
    const cancelCap = setLongTimeout(() => {
      closeOpenStop();
      void finishLearning().finally(() => router.replace("/study/session"));
    }, untilCapMs);
    return () => {
      cancelWarning();
      cancelCap();
    };
  }, [endsAt, serverNow, warningMinutes, router]);

  return (
    <>
      {children}
      <div role="status" aria-live="polite" className="walking-toast" data-visible={warned}>
        {warned ? `${warningMinutes} minutes of learning time are left.` : null}
      </div>
    </>
  );
}
