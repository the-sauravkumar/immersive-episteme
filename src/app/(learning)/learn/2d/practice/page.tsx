import type { Metadata } from "next";
import { Suspense } from "react";

import { LearningPage } from "@/components/shell/gates";
import { PracticeUnavailable } from "@/components/learning/practice-unavailable";
import { PageSkeleton } from "@/features/learning-2d/ui/page-layout";
import { Practice2d } from "@/features/learning-2d/ui/practice";
import { startPractice } from "@/server/learning/practice";

export const metadata: Metadata = { title: "Practice" };

/** May block: the learning gate verifies the participant session per navigation (see the layout). */
export const instant = false;

/**
 * Familiarisation practice of the 2D condition (study decision D5): the real chrome with
 * placeholder "Practice" sections, timed separately from learning (the study engine's
 * familiarisation step, server clock), never starting the learning clock, telemetry on the
 * practice session (never stored). Back to /study/session when the practice time is over.
 */
export default function Practice2dPage() {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<PageSkeleton />}>
        <Practice />
      </Suspense>
    </LearningPage>
  );
}

async function Practice() {
  const r = await startPractice("2d");
  if (!r.ok) return <PracticeUnavailable message={r.message} />;
  const { ctx, budget } = r;
  return (
    <Practice2d
      telemetry={{ sessionId: ctx.telemetrySessionId, contentVersion: ctx.contentVersion, appBuild: ctx.appBuild, mode: ctx.mode }}
      budget={budget}
      mode={ctx.mode}
      guidance={ctx.settings.guidance}
      searchEnabled={ctx.features.search}
    />
  );
}
