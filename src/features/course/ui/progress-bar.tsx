"use client";

import type { BarSegment } from "@/features/course/domain/panel-model";

export interface StepButton {
  readonly label: string;
  readonly detail: string | null;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

interface ProgressBarProps {
  readonly back: StepButton;
  readonly forward: StepButton;
  readonly segments: readonly BarSegment[];
  readonly currentIndex: number;
  readonly reachedIndex: number;
  readonly onJump: (index: number) => void;
}

function Segment({ segment, state, onPress }: { readonly segment: BarSegment; readonly state: "done" | "current" | "ahead"; readonly onPress: () => void }) {
  const cloth = <span className="segment-cloth" style={state === "ahead" ? undefined : { backgroundImage: `url("${segment.stripSrc}")` }} />;
  const number = <span className="segment-number">{segment.number}</span>;
  if (state === "ahead") {
    return (
      <span className="segment" data-state={state}>
        {cloth}
        {number}
      </span>
    );
  }
  return (
    <button type="button" className="segment" data-state={state} aria-current={state === "current" ? "step" : undefined} aria-label={`Stage ${segment.number}: ${segment.label}`} onClick={onPress}>
      {cloth}
      {number}
    </button>
  );
}

function Step({ step, primary }: { readonly step: StepButton; readonly primary: boolean }) {
  return (
    <button type="button" className={primary ? "step-button step-next" : "step-button"} disabled={step.disabled} onClick={step.onPress}>
      {step.label}
      {step.detail ? <small>{step.detail}</small> : null}
    </button>
  );
}

export function ProgressBar({ back, forward, segments, currentIndex, reachedIndex, onJump }: ProgressBarProps) {
  return (
    <nav className="bar" aria-label="Course Progress">
      <Step step={back} primary={false} />
      <ol className="strip">
        {segments.map((segment, index) => (
          <li key={segment.number}>
            <Segment
              segment={segment}
              state={index === currentIndex ? "current" : index <= reachedIndex ? "done" : "ahead"}
              onPress={() => {
                if (index !== currentIndex) onJump(index);
              }}
            />
          </li>
        ))}
      </ol>
      <Step step={forward} primary />
    </nav>
  );
}
