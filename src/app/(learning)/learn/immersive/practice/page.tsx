import type { Metadata } from "next";
import { Suspense } from "react";

import { PracticeUnavailable } from "@/components/learning/practice-unavailable";
import { PracticeMuseum } from "@/components/museum/practice-museum";
import { LearningPage } from "@/components/shell/gates";
import { practiceMuseumPayload } from "@/features/immersive/practice-room";
import { immersiveSettingsOf } from "@/features/immersive/server/payload";
import { startPractice } from "@/server/learning/practice";

export const metadata: Metadata = { title: "Practice" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Familiarisation practice of the immersive condition (study decision D5): a small practice room
 * compiled from a fixed practice graph ("Practice" placeholder exhibits, no craft content),
 * rendered by the same museum runtime (renderer, controls, information panel, minimap) with the
 * study's settings. Timed separately from learning (the study engine's familiarisation step),
 * never starting the learning clock; telemetry on the practice session (never stored). Back to
 * /study/session when the practice time is over.
 */
export default function PracticeImmersivePage() {
  return (
    <LearningPage condition="immersive">
      <Suspense fallback={<div className="h-full w-full bg-ground" role="status" aria-label="Preparing the practice room" />}>
        <Practice />
      </Suspense>
    </LearningPage>
  );
}

async function Practice() {
  const r = await startPractice("immersive");
  if (!r.ok) return <PracticeUnavailable message={r.message} />;
  const { ctx, budget } = r;
  return (
    <PracticeMuseum
      telemetry={{ sessionId: ctx.telemetrySessionId, contentVersion: ctx.contentVersion, appBuild: ctx.appBuild, mode: ctx.mode }}
      budget={budget}
      mode={ctx.mode}
      guidance={ctx.settings.guidance}
      payload={practiceMuseumPayload(immersiveSettingsOf(ctx.settings))}
      onboardingKey={ctx.sessionId ?? ctx.telemetrySessionId}
    />
  );
}
