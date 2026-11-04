"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { StageTemplate } from "@/features/process/domain/stage-template";
import { reportMovement, reportObjectDwell, reportPathSample, reportSourceOpened, reportStageLeft, reportViewpointChanges, reportWrongTurn } from "@/features/study/learning-progress";
import type { WalkthroughSessionEvents } from "@/features/walkthrough/ui/walkthrough-session";

import { enterStop, useLearningExit } from "./door-progress";

const WalkthroughSession = dynamic(() => import("@/features/walkthrough/ui/walkthrough-session").then((module) => module.WalkthroughSession), {
  ssr: false,
  loading: () => <div className="walkthrough walkthrough-loading walking" role="status">Opening The Yard</div>,
});

export function WalkthroughDoor({ templates }: { readonly templates: readonly StageTemplate[] }) {
  const { notice, finish, leave } = useLearningExit();
  const events = useMemo<WalkthroughSessionEvents>(
    () => ({
      onStageEntered(stop) {
        void enterStop(stop).then((verdict) => {
          if (verdict === "ended") leave();
        });
      },
      onStageLeft: reportStageLeft,
      onMovement: reportMovement,
      onViewpointChanges: reportViewpointChanges,
      onObjectDwell: (stop, objectKey, dwellMs, closestMetres) => reportObjectDwell(stop, { objectKey, dwellMs, closestM: closestMetres }),
      onPathSample: reportPathSample,
      onWrongTurn: reportWrongTurn,
      onSourceOpened: reportSourceOpened,
      onFinished: () => void finish(),
    }),
    [finish, leave],
  );
  return (
    <>
      <WalkthroughSession templates={templates} events={events} />
      {notice ? (
        <div role="alert" className="walking-toast" data-visible="true">
          {notice}
        </div>
      ) : null}
    </>
  );
}
