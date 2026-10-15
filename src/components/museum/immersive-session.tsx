"use client";

/**
 * Client session for the immersive condition: one telemetry tracker for the learning session and
 * the SHARED learning-phase controls and guidance (same time budget, timer, hand-back, hint and
 * stall cue as the 2D condition).
 */
import { GuidanceProvider } from "@/components/learning/guidance";
import { LearningPhaseProvider } from "@/components/learning/learning-phase";
import type { LearningSettings } from "@/features/learning/settings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import type { MuseumPayload } from "@/features/immersive/types";
import { TelemetryProvider, type TelemetryConfig } from "@/features/telemetry/client/provider";

import { MuseumApp } from "./museum-app";

export interface ImmersiveSessionProps {
  telemetry: Pick<TelemetryConfig, "sessionId" | "contentVersion" | "appBuild" | "mode">;
  budget: LearningTimeBudget;
  mode: "study" | "demo" | "preview";
  payload: MuseumPayload;
  unverifiedContent: boolean;
  /** Key of the controls-tutorial flag (the study session; see MuseumAppProps.onboardingKey). */
  onboardingKey: string;
  /** Protocol settings from the learning context (guidance and learning-task prompts). */
  settings: Pick<LearningSettings, "guidance" | "learningPrompts">;
}

export function ImmersiveSession({ telemetry, budget, mode, payload, unverifiedContent, settings, onboardingKey }: ImmersiveSessionProps) {
  return (
    <TelemetryProvider config={telemetry}>
      <LearningPhaseProvider budget={budget} mode={mode}>
        <GuidanceProvider guidance={settings.guidance}>
          <MuseumApp payload={payload} mode={mode} telemetrySessionId={telemetry.sessionId} onboardingKey={onboardingKey} unverifiedContent={unverifiedContent} learningPrompts={settings.learningPrompts} />
        </GuidanceProvider>
      </LearningPhaseProvider>
    </TelemetryProvider>
  );
}
