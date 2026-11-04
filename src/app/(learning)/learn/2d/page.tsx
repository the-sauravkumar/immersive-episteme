import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { LearningPage } from "@/components/shell/gates";

import { DoorContent } from "../door-session";

export const metadata: Metadata = { title: "Learning" };

export const instant = false;

export default function Learn2dPage() {
  return (
    <LearningPage condition="2d">
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <DoorContent condition="2d" />
      </Suspense>
    </LearningPage>
  );
}
