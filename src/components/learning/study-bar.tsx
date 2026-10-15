"use client";

/**
 * StudyBar (DESIGN.md 9.14): the one top bar of the learning phase, the SAME component in both
 * conditions (parity checks P7, P22, P24). 56 px tall, opaque `--ground`, ONE 1 px
 * `--rule-strong` line below (DR-022), sticky directly under the AccessNotice (`top: var(--notice-offset)`, set by the learning
 * shell). In DOM and visual order:
 *
 *  1. a "Skip to content" link (visible on focus), the same label in both conditions;
 *  2. the wordmark as plain text (no outbound navigation in study);
 *  3. the location slot: 2D the page title, 3D the room name (Atkinson 700 18 px, one line,
 *     ellipsis; no middle-dot joins). In 3D the room name is the view's h1 while no concept is open
 *     (`locationAs="h1"`); when the panel opens it becomes non-heading `aria-live` text
 *     (`locationAs="live"`), and the panel title is the h1;
 *  4. the condition navigation group (the only part allowed to differ): 2D Contents, Search and
 *     2D "In This Section" (the shared PlaceRail's button), Contents (below 1024 px) and Search;
 *     3D "In This Room", Plan, Mouse look (public demo only), Controls help, Pause. Use `StudyBarButton` so both
 *     groups have the same 44 px style; text labels show from 1024 px, icons with a name and
 *     tooltip below;
 *  5. the shared controls: Hint, Time left, Finish (same labels, same 44 px buttons), last, at the
 *     right edge.
 *
 * The shared controls come after the condition group, where DESIGN.md 9.14 lists them before it.
 * The two condition groups differ in width and in number of controls, so between the location and
 * the condition group the shared controls moved by the width difference (P22 failed by 30 px at
 * 1280) and the Tab stops from the knowledge column back to Finish differed by the extra controls
 * (P24). Last in the DOM and anchored at the right edge, they sit at the same place and the same
 * number of Tab stops away in both conditions; section 12 wins over 9.14 (visual-system.md, WP8).
 *
 * Under 768 px the wordmark is hidden, Hint shows its icon (named "Hint") and "Time left" keeps only
 * its digits on screen, identically in both conditions, so the bar fits at 390 px.
 * Must be rendered inside <LearningPhaseProvider> and <GuidanceProvider>.
 */
import { forwardRef, type ComponentProps, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { STUDY_BAR_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { HintControl } from "./guidance";
import { LearningTimer } from "./learning-phase";

export interface StudyBarProps {
  /** 2D: the current page title. 3D: the room name. */
  location: string;
  /** How the location is exposed: plain text (2D), the view's h1 (3D, no concept open) or live text (3D, panel open). */
  locationAs?: "text" | "h1" | "live";
  /** The condition navigation group (StudyBarButton elements). */
  conditionNav?: ReactNode;
  /** Id of the skip target: the knowledge column (2D), the panel when open, else the scene (3D). */
  skipTargetId: string;
  className?: string;
}

const LOCATION_CLASS = "truncate text-[1.125rem] leading-7 font-bold text-ink";

export function StudyBar({ location, locationAs = "text", conditionNav, skipTargetId, className }: StudyBarProps) {
  const shown = titleCase(location);
  return (
    <header
      data-slot="study-bar"
      aria-label={STUDY_BAR_TEXT.barLabel}
      className={cn("sticky top-[var(--notice-offset,0px)] z-(--z-hud) box-content h-[var(--studybar-h)] border-b border-rule-strong bg-ground", className)}
    >
      <a
        href={`#${skipTargetId}`}
        data-slot="study-skip-link"
        className="text-ui sr-only bg-ground text-indigo underline decoration-1 underline-offset-[0.2em] focus:not-sr-only focus:absolute focus:top-1.5 focus:left-2 focus:z-(--z-skip-link) focus:inline-flex focus:min-h-11 focus:items-center focus:px-4"
      >
        {STUDY_BAR_TEXT.skipToContent}
      </a>
      <div className="flex h-full items-center gap-1 px-4 xs:px-6 md:gap-2">
        <Wordmark size="study" className="hidden shrink-0 md:inline" />
        <div className="min-w-0 flex-1 md:border-l md:border-rule md:pl-3" data-slot="study-bar-location">
          {locationAs === "h1" ? (
            <h1 className={LOCATION_CLASS} title={shown}>
              {shown}
            </h1>
          ) : (
            <p className={LOCATION_CLASS} title={shown} aria-live={locationAs === "live" ? "polite" : undefined}>
              {shown}
            </p>
          )}
        </div>
        {conditionNav ? (
          <nav aria-label={STUDY_BAR_TEXT.conditionGroupLabel} data-slot="study-bar-condition" className="flex shrink-0 items-center gap-1">
            {conditionNav}
          </nav>
        ) : null}
        <div role="group" aria-label={STUDY_BAR_TEXT.sharedGroupLabel} data-slot="study-bar-shared" className="flex shrink-0 items-center gap-1">
          <HintControl />
          <LearningTimer />
        </div>
      </div>
    </header>
  );
}

export type StudyBarButtonProps = Omit<ComponentProps<typeof Button>, "children" | "size" | "variant"> & {
  /** A 20 px lucide icon. */
  icon: ReactNode;
  label: string;
};

/**
 * A control of the condition navigation group: 44 px ghost button, icon plus a text label from
 * 1024 px; below that the icon alone with the label as its name and tooltip.
 */
export const StudyBarButton = forwardRef<HTMLButtonElement, StudyBarButtonProps>(function StudyBarButton({ icon, label, className, ...props }, ref) {
  return (
    <Button ref={ref} type="button" variant="ghost" aria-label={label} title={label} className={cn("min-w-11 px-3 lg:px-4", className)} {...props}>
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </Button>
  );
});

/** Class names for a condition-group control that must be a link. */
export const STUDY_BAR_LINK_CLASS =
  "text-ui inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control px-3 text-ink no-underline hover:bg-sunk lg:px-4 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]";

/** The label part of a link control: visible from 1024 px (the link carries aria-label and title). */
export function StudyBarLabel({ children }: { children: ReactNode }) {
  return <span className="hidden lg:inline">{children}</span>;
}
