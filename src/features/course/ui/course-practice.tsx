"use client";

import { useMemo, useState } from "react";

import { practicePanelModel, practiceSegments, PRACTICE_STEP_COUNT } from "@/features/course/domain/panel-model";
import { PRACTICE_HELP_LINES } from "@/features/process/domain/guidance";

import { usePanelControls } from "./course-dialogs";
import { ProgressBar } from "./progress-bar";
import { StagePanel, panelImageSources } from "./stage-panel";
import { usePanelImages } from "./use-panel-images";

import "@/styles/walking-tokens.css";
import "./course.css";

export interface CoursePracticeProps {
  readonly reviewMarks?: boolean;
  readonly onFinished?: () => void;
}

export function CoursePractice({ reviewMarks = false, onFinished }: CoursePracticeProps) {
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const model = useMemo(() => practicePanelModel(step), [step]);
  const images = usePanelImages(panelImageSources(model));
  const { controls } = usePanelControls(PRACTICE_HELP_LINES);
  const segments = practiceSegments();
  const last = step === PRACTICE_STEP_COUNT - 1;

  const goTo = (target: number) => {
    setStep(target);
    setReached((current) => Math.max(current, target));
  };

  return (
    <div className="course walking" data-course-root="" data-panel="practice">
      <div className="course-frame">
      <StagePanel model={model} reviewMarks={reviewMarks} imageStatus={images.status} controls={controls()} onSourcesOpened={() => undefined} />
      <ProgressBar
        back={{ label: "Back", detail: step > 0 ? segments[step - 1]!.label : null, disabled: step === 0, onPress: () => goTo(step - 1) }}
        forward={{
          label: last ? "Begin" : "Next",
          detail: last ? null : segments[step + 1]!.label,
          disabled: !images.settled,
          onPress: () => (last ? onFinished?.() : goTo(step + 1)),
        }}
        segments={segments}
        currentIndex={step}
        reachedIndex={reached}
        onJump={goTo}
      />
      </div>
    </div>
  );
}
