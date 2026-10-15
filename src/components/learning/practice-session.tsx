"use client";

/**
 * Client session of the familiarisation practice (study decision D5), SHARED by both conditions:
 * a telemetry tracker on the PRACTICE telemetry session (the ingestion endpoint acknowledges its
 * batches and stores nothing, so practice never reaches learning metrics), the shared timer and
 * end panel with practice wording (LearningPhaseProvider `kind="practice"`), and the shared hint
 * control with practice text (no stall cue: practice has no concepts).
 *
 * When the practice minutes have passed, a study participant's step is completed by the study
 * engine (endFamiliarisation, server clock) and the participant returns to /study/session.
 */
import type { ReactNode } from "react";

import type { LearningTimeBudget } from "@/features/learning/time-budget";
import { GUIDANCE_TEXT } from "@/features/learning/guidance";
import type { GuidanceSettings } from "@/features/learning/settings";
import { TelemetryProvider, type TelemetryConfig } from "@/features/telemetry/client/provider";
import { endFamiliarisation } from "@/server/study/actions";

import { GuidanceProvider } from "./guidance";
import { LearningPhaseProvider, type LearningPhaseMode } from "./learning-phase";

async function endPractice(): Promise<string | null> {
  const r = await endFamiliarisation({});
  return r?.error ?? null;
}

export function PracticeSession({
  telemetry,
  budget,
  mode,
  guidance,
  children,
}: {
  telemetry: Pick<TelemetryConfig, "sessionId" | "contentVersion" | "appBuild" | "mode">;
  budget: LearningTimeBudget;
  mode: LearningPhaseMode;
  guidance: GuidanceSettings;
  children: ReactNode;
}) {
  return (
    <TelemetryProvider config={telemetry}>
      <LearningPhaseProvider budget={budget} mode={mode} kind="practice" onEnd={mode === "study" ? endPractice : undefined}>
        <GuidanceProvider guidance={{ ...guidance, hintText: GUIDANCE_TEXT.practiceHint }} stallCue={false}>
          {children}
        </GuidanceProvider>
      </LearningPhaseProvider>
    </TelemetryProvider>
  );
}
