"use client";

/**
 * Full-scene states of the museum (DESIGN.md 9.7, 9.20, 11.6): loading (progress tied to bytes and
 * steps), onboarding (the SHARED onboarding component of both conditions), help (on request), pause,
 * context loss, failure, and the designed fallback when the browser has no WebGL 2.
 *
 * Every screen uses the one state-message layout of the study surfaces: a 40rem column on opaque
 * `--ground` (never a translucent scrim over the scene), the shared StateMessage layout (no hero icon, DR-022),
 * one sentence in `text-reading` and 44 px actions. No transition or animation; loading is a static
 * progress line, not a pulse. Screens shown over a running museum (help, pause, context loss) are
 * labelled regions titled with an h2 (the room name in the StudyBar is the view's h1), NOT modal
 * dialogs: the StudyBar above them (Hint, Time left, Finish) stays reachable, as in 2D, so they
 * trap no focus; focus moves to their action, and the museum makes what they cover inert. Screens
 * that replace the museum (loading, failure, no WebGL) carry the view's h1.
 *
 * The condition onboarding (OnboardingScreen) is currently not shown: see CONDITION_ONBOARDING in
 * museum-app.tsx (parity check P23).
 */
import { CircleHelp, Loader, MonitorX, Pause, Play, RotateCcw, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { StateMessage } from "@/components/knowledge/state-message";
import { PhaseOnboarding } from "@/components/learning/onboarding";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ImmersiveSettings } from "@/features/immersive/types";
import { SCREEN_TEXT } from "@/features/learning/strings";


/** Interface wording of the museum's own screens lives in src/features/learning/strings.ts (P20). */
export { SCREEN_TEXT };

/**
 * The shared StateMessage (DESIGN.md 9.7), placed over the scene region on opaque --ground. The
 * outer box only positions it; the message, its icon, heading, sentence and actions are the
 * component every study surface uses.
 */
function StateScreen({
  icon,
  title,
  titleId,
  level,
  body,
  children,
  role,
  slot,
}: {
  icon: LucideIcon;
  title: string;
  titleId: string;
  level: 1 | 2;
  body?: ReactNode;
  children?: ReactNode;
  role?: "region" | "status" | "alert";
  slot: string;
}) {
  return (
    <div data-museum-keys="ui" data-slot={slot} className="pointer-events-auto absolute inset-0 z-(--z-modal) overflow-y-auto bg-ground text-ink">
      <div className="px-4 py-12 xs:px-6">
        <StateMessage id={titleId} title={title} level={level} icon={icon} live={role} extra={children}>
          {body}
        </StateMessage>
      </div>
    </div>
  );
}

function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

export function LoadingScreen({ step, stepIndex, stepCount, loadedBytes, totalBytes }: { step: string; stepIndex: number; stepCount: number; loadedBytes: number; totalBytes: number }) {
  const bytesPart = totalBytes > 0 ? loadedBytes / totalBytes : 0;
  // Steps 1..n; the byte download is step 1, so it fills the first share of the bar.
  const value = Math.round(((Math.max(0, stepIndex - 1) + (stepIndex === 1 ? bytesPart : 1)) / stepCount) * 100);
  const mb = (b: number) => (b / 1048576).toFixed(1);
  return (
    <StateScreen
      slot="museum-loading"
      role="status"
      level={1}
      titleId="museum-loading-title"
      title={SCREEN_TEXT.loadingTitle}
      icon={Loader}
      body={
        <p>
          {step.trim().toLowerCase() === SCREEN_TEXT.loadingTitle.toLowerCase() ? null : step}
          {stepIndex === 1 && totalBytes > 0 ? <span className="tabular-nums">{`, ${mb(loadedBytes)} of ${mb(totalBytes)} MB`}</span> : null}
        </p>
      }
    >
      <Progress value={value} className="mt-6" aria-label={SCREEN_TEXT.loadingLabel} />
      <p className="text-credit mt-2 tabular-nums">{SCREEN_TEXT.step(Math.max(1, stepIndex), stepCount)}</p>
    </StateScreen>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-7 items-center justify-center rounded-control border border-rule-strong bg-sunk px-1.5 font-sans text-[0.875rem] leading-6 font-medium text-ink">{children}</kbd>;
}

export function ControlsList() {
  const c = SCREEN_TEXT.controls;
  const rows: [string, ReactNode][] = [
    [
      c.walk,
      <>
        <Kbd>W</Kbd> <Kbd>S</Kbd> {c.keysOr} <Kbd>↑</Kbd> <Kbd>↓</Kbd>
      </>,
    ],
    [
      c.turn,
      <>
        <Kbd>A</Kbd> <Kbd>D</Kbd> {c.keysOr} <Kbd>←</Kbd> <Kbd>→</Kbd>
        <span className="mt-1 block">{c.turnNote}</span>
      </>,
    ],
    [
      c.sprint,
      <>
        <Kbd>Shift</Kbd> {c.sprintHow}
      </>,
    ],
    [c.look, c.lookHow],
    [c.mouseLook, c.mouseLookHow],
    [c.freeLook, c.freeLookHow],
    [c.go, c.goHow],
    [c.exhibits, c.exhibitsHow],
    [c.close, <Kbd key="esc">Esc</Kbd>],
  ];
  return (
    <dl className="mt-6 border-y-[1.5px] border-ink" data-slot="museum-controls">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-x-4 border-t border-rule py-3 first:border-t-0 xs:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-label">{label}</dt>
          <dd className="text-value">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The SHARED onboarding (one component for both conditions, DESIGN.md 9.20) on an opaque cover of
 * the scene. Minutes and the hint come from the same providers the 2D pages use.
 */
export function OnboardingScreen({ onStart }: { onStart(): void }) {
  return (
    <div data-museum-keys="ui" data-slot="museum-onboarding" className="pointer-events-auto absolute inset-0 z-(--z-modal) overflow-y-auto bg-ground">
      <PhaseOnboarding condition="immersive" onStart={onStart} />
    </div>
  );
}

export function HelpScreen({ onClose }: { onClose(): void }) {
  const ref = useAutoFocus<HTMLButtonElement>();
  return (
    <div
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        onClose();
      }}
    >
      <StateScreen slot="museum-help" role="region" level={2} titleId="museum-help-title" title={SCREEN_TEXT.helpTitle} icon={CircleHelp}>
        <ControlsList />
        <Button ref={ref} type="button" className="mt-8 w-full xs:w-auto" onClick={onClose}>
          {SCREEN_TEXT.helpBack}
        </Button>
      </StateScreen>
    </div>
  );
}

export function PauseScreen({ onResume }: { onResume(): void }) {
  const ref = useAutoFocus<HTMLButtonElement>();
  return (
    <StateScreen slot="museum-paused" role="region" level={2} titleId="museum-paused-title" title={SCREEN_TEXT.pausedTitle} icon={Pause} body={<p>{SCREEN_TEXT.pausedBody}</p>}>
      <Button ref={ref} type="button" className="mt-8 w-full xs:w-auto" onClick={onResume}>
        <Play aria-hidden="true" /> {SCREEN_TEXT.resume}
      </Button>
    </StateScreen>
  );
}

export function ContextLostScreen() {
  return (
    <StateScreen slot="museum-context-lost" role="alert" level={2} titleId="museum-lost-title" title={SCREEN_TEXT.lostTitle} icon={MonitorX} body={<p>{SCREEN_TEXT.lostBody}</p>} />
  );
}

export function FailureScreen({ message, mode, settings, onRetry }: { message: string; mode: "study" | "demo" | "preview"; settings: ImmersiveSettings; onRetry(): void }) {
  return (
    <StateScreen slot="museum-failed" role="alert" level={1} titleId="museum-failed-title" title={SCREEN_TEXT.failedTitle} icon={TriangleAlert} body={<p>{SCREEN_TEXT.failedBody}</p>}>
      <p className="text-credit mt-2 break-words">
        {SCREEN_TEXT.technical} {message}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" onClick={onRetry}>
          <RotateCcw aria-hidden="true" /> {SCREEN_TEXT.retry}
        </Button>
        <PolicyAction mode={mode} settings={settings} />
      </div>
    </StateScreen>
  );
}

function PolicyAction({ mode, settings, primary = false }: { mode: "study" | "demo" | "preview"; settings: ImmersiveSettings; primary?: boolean }) {
  const variant = primary ? "default" : "outline";
  if (mode !== "study")
    return (
      <Button asChild variant={variant}>
        <Link href="/explore">{SCREEN_TEXT.backToExplore}</Link>
      </Button>
    );
  return (
    <Button asChild variant={variant}>
      <Link href="/study/session">{settings.webglFailurePolicy === "retry" ? SCREEN_TEXT.backToSession : SCREEN_TEXT.tellResearcher}</Link>
    </Button>
  );
}

/**
 * No WebGL 2: never a silent switch to the 2D condition. In a study the participant is sent back
 * to the session with the study's policy (Q-R10: exclude, retry or reassign), which the study
 * engine applies; demo visitors are pointed back to Explore.
 */
export function WebGLFallback({ mode, settings, reason }: { mode: "study" | "demo" | "preview"; settings: ImmersiveSettings; reason: string }) {
  const policyText = mode !== "study" ? SCREEN_TEXT.policy.demo : SCREEN_TEXT.policy[settings.webglFailurePolicy];
  return (
    <div className="relative h-full w-full bg-ground">
      <StateScreen
        slot="museum-no-webgl"
        role="alert"
        level={1}
        titleId="museum-nowebgl-title"
        title={SCREEN_TEXT.noWebglTitle}
        icon={MonitorX}
        body={
          <>
            <p>{SCREEN_TEXT.noWebglBody(reason)}</p>
            <p className="mt-3 text-ink-2">{policyText}</p>
          </>
        }
      >
        <div className="mt-8">
          <PolicyAction mode={mode} settings={settings} primary />
        </div>
      </StateScreen>
    </div>
  );
}
