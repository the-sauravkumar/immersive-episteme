"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import type { StageTemplate } from "@/features/process/domain/stage-template";
import { registerOpenStop, reportMovement, reportObjectDwell, reportPathSample, reportSourceOpened, reportViewpointChanges, reportWrongTurn } from "@/features/study/learning-progress";
import type { LearningResume } from "@/features/study/stage-coverage";
import type { WalkthroughSessionEvents } from "@/features/walkthrough/ui/walkthrough-session";

import { useDoorProgress, useRenderFailureReport } from "./door-progress";

const WalkthroughSession = dynamic(() => import("./composed-walkthrough").then((module) => module.ComposedWalkthroughSession), {
  ssr: false,
  loading: () => <div className="walkthrough walkthrough-loading walking" role="status">Opening The Yard</div>,
});

export function WalkthroughDoor({ templates, resume, studyMode }: { readonly templates: readonly StageTemplate[]; readonly resume: LearningResume | null; readonly studyMode: boolean }) {
  const { notice, restore, enter, left, finish } = useDoorProgress(templates);
  const { failureNotice, onRenderFailed } = useRenderFailureReport(studyMode);
  const events = useMemo<WalkthroughSessionEvents>(
    () => ({
      onStageEntered: enter,
      onStageLeft: left,
      onMovement: reportMovement,
      onViewpointChanges: reportViewpointChanges,
      onObjectDwell: (stop, objectKey, dwellMs, closestMetres) => reportObjectDwell(stop, { objectKey, dwellMs, closestM: closestMetres }),
      onPathSample: reportPathSample,
      onWrongTurn: reportWrongTurn,
      onSourceOpened: reportSourceOpened,
      onFinished: finish,
      onRenderFailed,
      registerExit: registerOpenStop,
    }),
    [enter, finish, left, onRenderFailed],
  );
  const shown = failureNotice ?? notice;
  return (
    <>
      <WalkthroughSession templates={templates} events={events} resume={resume} restore={restore} />
      {shown ? (
        <div role="alert" className="walking-toast" data-visible="true">
          {shown}
        </div>
      ) : null}
    </>
  );
}
