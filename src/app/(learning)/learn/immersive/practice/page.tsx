import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningPage } from "@/components/shell/gates";
import { PracticeUnavailable } from "@/components/learning/practice-unavailable";
import { TelemetryProvider } from "@/features/telemetry/client";
import { startPractice } from "@/server/learning/practice";

import { WalkthroughPracticeDoor } from "../../practice-doors";

export const metadata: Metadata = { title: "Practice" };

export const instant = false;

async function Practice() {
  const start = await startPractice("immersive");
  if (!start.ok) return <PracticeUnavailable message={start.message} />;
  const door = <WalkthroughPracticeDoor studyMode={start.studyMode} returnTo="/learn/immersive" />;
  return start.telemetry ? <TelemetryProvider config={start.telemetry}>{door}</TelemetryProvider> : door;
}

export default function PracticeImmersivePage() {
  return (
    <LearningPage condition="immersive">
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <Practice />
      </Suspense>
    </LearningPage>
  );
}
