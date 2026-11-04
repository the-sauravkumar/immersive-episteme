"use client";

import { CourseSession, type CourseStageEvent } from "@/features/course/ui/course-session";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { registerOpenStop, reportSourceOpened, type StageRef } from "@/features/study/learning-progress";
import { PRODUCT_STOP_KEY, type LearningResume } from "@/features/study/stage-coverage";

import { useDoorProgress } from "./door-progress";

export function courseStop(event: CourseStageEvent, templates: readonly StageTemplate[]): StageRef {
  if (event.stageKey !== null && event.stageNumber !== null) return { traditionKey: event.tradition, stageKey: event.stageKey, stageNumber: event.stageNumber };
  const template = templates.find((candidate) => candidate.tradition === event.tradition)!;
  return { traditionKey: event.tradition, stageKey: PRODUCT_STOP_KEY, stageNumber: template.stages.length + 1 };
}

export function CourseDoor({ templates, resume }: { readonly templates: readonly StageTemplate[]; readonly resume: LearningResume | null }) {
  const { notice, restore, enter, left, finish } = useDoorProgress(templates);
  return (
    <>
      <CourseSession
        templates={templates}
        resume={resume}
        restore={restore}
        registerExit={registerOpenStop}
        onStageEntered={(event) => enter(courseStop(event, templates))}
        onStageLeft={(event) => left(courseStop(event, templates), event.activeMs)}
        onSourceOpened={(event) => reportSourceOpened(courseStop(event, templates))}
        onFinished={finish}
      />
      {notice ? (
        <div role="alert" className="walking-toast" data-visible="true">
          {notice}
        </div>
      ) : null}
    </>
  );
}
