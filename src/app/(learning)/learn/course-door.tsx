"use client";

import { useCallback } from "react";

import { CourseSession, type CourseStageEvent } from "@/features/course/ui/course-session";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { reportSourceOpened, reportStageLeft, type StageRef } from "@/features/study/learning-progress";
import { PRODUCT_STOP_KEY } from "@/features/study/stage-coverage";

import { enterStop, useLearningExit } from "./door-progress";

export function courseStop(event: CourseStageEvent, templates: readonly StageTemplate[]): StageRef {
  if (event.stageKey !== null && event.stageNumber !== null) return { traditionKey: event.tradition, stageKey: event.stageKey, stageNumber: event.stageNumber };
  const template = templates.find((candidate) => candidate.tradition === event.tradition)!;
  return { traditionKey: event.tradition, stageKey: PRODUCT_STOP_KEY, stageNumber: template.stages.length + 1 };
}

export function CourseDoor({ templates }: { readonly templates: readonly StageTemplate[] }) {
  const { notice, finish, leave } = useLearningExit();
  const onStageEntered = useCallback(
    async (event: CourseStageEvent) => {
      const verdict = await enterStop(courseStop(event, templates));
      if (verdict === "ended") leave();
      return verdict !== "refused";
    },
    [leave, templates],
  );
  return (
    <>
      <CourseSession
        templates={templates}
        onStageEntered={onStageEntered}
        onStageLeft={(event) => reportStageLeft(courseStop(event, templates), event.dwellMs)}
        onSourceOpened={(event) => reportSourceOpened(courseStop(event, templates))}
        onFinished={() => void finish()}
      />
      {notice ? (
        <div role="alert" className="walking-toast" data-visible="true">
          {notice}
        </div>
      ) : null}
    </>
  );
}
