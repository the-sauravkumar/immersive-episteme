"use client";

/**
 * The museum's chrome and wayfinding overlays (DESIGN.md 11.6, 9.14):
 *
 *  - `MuseumStudyBar`: the SHARED `StudyBar` (the same component as the 2D pages: wordmark, location,
 *    Hint, Time left, Finish, skip link), with the museum's condition navigation group: "In This
 *    Room" (shows the shared PlaceRail while it is hidden, as "In This Section" in 2D), Plan, Mouse
 *    look (public demo only: study builds hide it, concept note section 7, Pathway B; free look stays
 *    on the L key and in Controls help), Controls help and Pause, as 44 px `StudyBarButton`s. The
 *    room name is the location; it is the view's h1 while no concept is open, and live text once the
 *    panel (whose title is the h1) opens.
 *  - `CueNoteBar`: one manifest cue note at a time.
 * The room's exhibits and doorways (the keyboard route to them) are in the shared PlaceRail
 * ("In This Room", museum-app.tsx), the same component as the 2D "In This Section".
 *
 * Opaque `--ground` surfaces, 1 px `--rule-strong` boundaries, no radius, shadow, blur or motion.
 */
import { CircleHelp, Map as MapIcon, Mouse, Pause, X } from "lucide-react";
import type { ReactNode } from "react";

import { StudyBar, StudyBarButton } from "@/components/learning/study-bar";
import { Button } from "@/components/ui/button";
import { ROOM_TEXT, STUDY_BAR_TEXT } from "@/features/learning/strings";

export function MuseumStudyBar({
  location,
  locationAs,
  skipTargetId,
  mapAvailable,
  mapOpen,
  controlsEnabled,
  onToggleMap,
  onHelp,
  onPause,
  freeLook,
  onToggleFreeLook,
  showMouseLook,
  railButton,
}: {
  location: string;
  locationAs: "text" | "h1" | "live";
  skipTargetId: string;
  /** The study shows the plan as a toggle (`minimap: "toggle"`). */
  mapAvailable: boolean;
  mapOpen: boolean;
  /** The museum is running (not loading, onboarding or failed). */
  controlsEnabled: boolean;
  onToggleMap(): void;
  onHelp(): void;
  onPause(): void;
  /** Free mouse look is on (toggle: this button or L). */
  freeLook: boolean;
  onToggleFreeLook(): void;
  /** The Mouse look button: the public demo and staff preview only; hidden in study builds (Pathway B). */
  showMouseLook: boolean;
  /** "In This Room" (the shared `PlaceRailButton`), first in the group as "In This Section" in 2D. */
  railButton?: ReactNode;
}) {
  return (
    // Arrow keys on the bar's controls never walk the visitor.
    <div data-museum-keys="ui" className="shrink-0">
      <StudyBar
        location={location}
        locationAs={locationAs}
        skipTargetId={skipTargetId}
        conditionNav={
          <>
            {railButton}
            {mapAvailable ? <StudyBarButton icon={<MapIcon aria-hidden="true" />} label={STUDY_BAR_TEXT.plan} aria-pressed={mapOpen} disabled={!controlsEnabled} onClick={onToggleMap} /> : null}
            {/* Phone widths have no mouse to capture, and the bar must fit at 390 px with "In This Room". */}
            {showMouseLook ? (
              <StudyBarButton icon={<Mouse aria-hidden="true" />} label={STUDY_BAR_TEXT.mouseLook} aria-pressed={freeLook} disabled={!controlsEnabled} onClick={onToggleFreeLook} className="max-md:hidden" />
            ) : null}
            <StudyBarButton icon={<CircleHelp aria-hidden="true" />} label={STUDY_BAR_TEXT.controlsHelp} disabled={!controlsEnabled} onClick={onHelp} />
            <StudyBarButton icon={<Pause aria-hidden="true" />} label={STUDY_BAR_TEXT.pause} disabled={!controlsEnabled} onClick={onPause} />
          </>
        }
      />
    </div>
  );
}



export function CueNoteBar({ text, detail, actionLabel, onAction, onDismiss }: { text: string; detail: string | null; actionLabel: string | null; onAction(): void; onDismiss(): void }) {
  return (
    <div role="status" aria-live="polite" data-museum-keys="ui" data-slot="museum-cue-note" className="flex w-[min(34rem,calc(100vw-2rem))] items-start gap-3 border border-rule-strong bg-ground py-2 pr-2 pl-4 text-ink">
      <div className="min-w-0 flex-1 py-2">
        <p className="text-body font-medium">{text}</p>
        {detail ? <p className="mt-1 text-[0.9375rem] leading-6 text-ink-2">{detail}</p> : null}
        {actionLabel ? (
          <Button type="button" variant="outline" className="mt-3" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label={ROOM_TEXT.dismiss} title={ROOM_TEXT.dismiss} onClick={onDismiss}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
