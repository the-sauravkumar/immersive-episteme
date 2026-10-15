"use client";

/**
 * The immersive familiarisation practice (study decision D5): the SAME museum runtime as the
 * learning condition (MuseumApp: renderer, controls, information panel, minimap, hint control and
 * timer) on the practice room, inside the shared practice session (practice telemetry session,
 * practice timer, hand-back through the study engine).
 */
import { PracticeSession } from "@/components/learning/practice-session";
import type { LearningPhaseMode } from "@/components/learning/learning-phase";
import type { MuseumPayload } from "@/features/immersive/types";
import type { GuidanceSettings } from "@/features/learning/settings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import type { TelemetryConfig } from "@/features/telemetry/client/provider";

import { MuseumApp } from "./museum-app";

export function PracticeMuseum({
  telemetry,
  budget,
  mode,
  guidance,
  payload,
  onboardingKey,
}: {
  telemetry: Pick<TelemetryConfig, "sessionId" | "contentVersion" | "appBuild" | "mode">;
  budget: LearningTimeBudget;
  mode: LearningPhaseMode;
  guidance: GuidanceSettings;
  payload: MuseumPayload;
  /** The study session id, so the learning museum knows the controls were practised. */
  onboardingKey: string;
}) {
  return (
    <PracticeSession telemetry={telemetry} budget={budget} mode={mode} guidance={guidance}>
      <MuseumApp payload={payload} mode={mode} telemetrySessionId={telemetry.sessionId} onboardingKey={onboardingKey} unverifiedContent={false} learningPrompts={[]} />
    </PracticeSession>
  );
}
