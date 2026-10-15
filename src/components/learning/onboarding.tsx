"use client";

/**
 * Onboarding (DESIGN.md 9.20): ONE component renders the onboarding of both conditions, and of
 * both practice sessions (parity check P23).
 *
 * A single screen in a 40rem column on `--ground`: the `text-title` h1, a lead, numbered steps in
 * `text-reading`, a static line-art key of the top-bar controls (ink outlines, no animation, no
 * photograph) and one 44 px primary "Start" action. Both conditions show the same screen with the
 * same shared steps (time limit, Hint, Finish, how to open a citation and a figure); only the
 * movement step differs (2D: Contents and links; 3D: Plan, keyboard and mouse), and the two are
 * written to the same length within 10% of words. All wording comes from `ONBOARDING_TEXT`.
 * The key shows only the shared controls and one "Navigation" group box, so it is identical too.
 * Focus moves to the heading when the screen opens, in both.
 */
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { GUIDANCE_TEXT, ONBOARDING_TEXT, PHASE_TEXT, STUDY_BAR_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";

export type OnboardingCondition = "2d" | "immersive";

export interface OnboardingProps {
  condition: OnboardingCondition;
  kind?: "learning" | "practice";
  /** The fixed time budget in minutes, or null when self-paced. */
  minutes: number | null;
  /** The protocol's hybrid guidance is on (the Hint control exists), the same for both conditions. */
  hintAvailable: boolean;
  onStart(): void;
}

/** The steps of the onboarding in order; exported for the parity tests. */
export function onboardingSteps({ condition, kind = "learning", minutes, hintAvailable }: Omit<OnboardingProps, "onStart">): { id: string; text: string }[] {
  return [
    { id: "time", text: ONBOARDING_TEXT.time(minutes, kind) },
    ...(hintAvailable ? [{ id: "hint", text: ONBOARDING_TEXT.hint }] : []),
    { id: "movement", text: ONBOARDING_TEXT.movement[condition === "2d" ? "2d" : "immersive"] },
    { id: "citation", text: ONBOARDING_TEXT.citation },
    { id: "figure", text: ONBOARDING_TEXT.figure },
  ];
}

export function Onboarding(props: OnboardingProps) {
  const { kind = "learning", hintAvailable, onStart } = props;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);
  const steps = onboardingSteps(props);
  return (
    <section aria-labelledby="onboarding-title" data-slot="onboarding" className="mx-auto w-full max-w-[40rem] bg-ground px-4 py-12 text-ink xs:px-6">
      <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="text-title outline-offset-4">
        {titleCase(ONBOARDING_TEXT.title[kind])}
      </h1>
      <p className="text-lead mt-3">{ONBOARDING_TEXT.lead[kind]}</p>
      <ol className="mt-8 list-none" data-slot="onboarding-steps">
        {steps.map((s, i) => (
          <li key={s.id} data-step={s.id} className="grid grid-cols-[var(--hang)_minmax(0,1fr)] border-t border-rule py-4 first:border-t-0 first:pt-0">
            <span aria-hidden="true" className="text-claim-number pr-3">
              {i + 1}
            </span>
            <p className="text-reading">{s.text}</p>
          </li>
        ))}
      </ol>
      <ControlsKey hint={hintAvailable} kind={kind} />
      <Button type="button" className="mt-8 w-full xs:w-48" onClick={onStart}>
        {ONBOARDING_TEXT.start}
      </Button>
    </section>
  );
}

/** Static line-art key of the top bar: ink outlines, the shared controls and the navigation group. */
function ControlsKey({ hint, kind }: { hint: boolean; kind: "learning" | "practice" }) {
  const boxes = [
    ...(hint ? [GUIDANCE_TEXT.hintLabel] : []),
    PHASE_TEXT[kind].timeLeft,
    PHASE_TEXT[kind].finish,
    STUDY_BAR_TEXT.conditionGroupLabel,
  ];
  const w = 120;
  const gap = 12;
  const width = boxes.length * w + (boxes.length - 1) * gap + 16;
  return (
    <figure className="mt-8" data-slot="onboarding-key">
      <svg viewBox={`0 0 ${width} 72`} role="img" aria-label={`${ONBOARDING_TEXT.keyLabel}: ${boxes.join(", ")}`} className="block h-auto w-full max-w-[34rem]">
        <rect x={0.75} y={0.75} width={width - 1.5} height={56} fill="none" style={{ stroke: "var(--ink)" }} strokeWidth={1.5} />
        <line x1={0} x2={width} y1={58} y2={58} style={{ stroke: "var(--ink)" }} strokeWidth={2} />
        {boxes.map((label, i) => (
          <g key={label}>
            <rect x={8 + i * (w + gap)} y={12} width={w} height={32} fill="none" style={{ stroke: "var(--ink)" }} strokeWidth={1} strokeDasharray={i === boxes.length - 1 ? "4 3" : undefined} />
            <text x={8 + i * (w + gap) + w / 2} y={33} textAnchor="middle" fontSize={14} fontWeight={500} style={{ fill: "var(--ink)", fontFamily: "var(--sans-stack)" }}>
              {label}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-caption mt-2">{ONBOARDING_TEXT.keyLabel}</figcaption>
    </figure>
  );
}
