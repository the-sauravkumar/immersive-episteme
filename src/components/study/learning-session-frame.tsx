"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { bindLearningTelemetry, finishLearning } from "@/features/study/learning-progress";
import { useOptionalTelemetry } from "@/features/telemetry/client";

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
    const track = telemetry.track.bind(telemetry) as unknown as Parameters<typeof bindLearningTelemetry>[0];
    bindLearningTelemetry(track);
    return () => bindLearningTelemetry(null);
  }, [telemetry]);

  useEffect(() => {
    if (!endsAt) return;
    const { untilWarningMs, untilCapMs } = capTimings(endsAt, serverNow, warningMinutes);
    const warning = setTimeout(() => setWarned(true), Math.max(0, untilWarningMs));
    const cap = setTimeout(() => {
      void finishLearning().finally(() => router.replace("/study/session"));
    }, Math.max(0, untilCapMs));
    return () => {
      clearTimeout(warning);
      clearTimeout(cap);
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
