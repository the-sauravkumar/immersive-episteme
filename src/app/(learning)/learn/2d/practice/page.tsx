import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningPage } from "@/components/shell/gates";
import { PracticeUnavailable } from "@/components/learning/practice-unavailable";
import { startPractice } from "@/server/learning/practice";

import { CoursePracticeDoor } from "../../practice-doors";

export const metadata: Metadata = { title: "Practice" };

export const instant = false;

async function Practice() {
  const start = await startPractice("2d");
  if (!start.ok) return <PracticeUnavailable message={start.message} />;
  return <CoursePracticeDoor studyMode={start.studyMode} returnTo="/learn/2d" />;
}

export default function Practice2dPage() {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <Practice />
      </Suspense>
    </LearningPage>
  );
}
