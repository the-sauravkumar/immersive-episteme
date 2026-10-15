"use client";

/**
 * The museum's chrome and wayfinding overlays (DESIGN.md 11.6, 9.14):
 *
 *  - `MuseumStudyBar`: the SHARED `StudyBar` (the same component as the 2D pages: wordmark, location,
 *    Hint, Time left, Finish, skip link), with the museum's condition navigation group: Plan,
 *    Controls help and Pause, as 44 px `StudyBarButton`s. The room name is the location; it is the
 *    view's h1 while no concept is open, and live text once the panel (whose title is the h1) opens.
 *  - `RoomContents`: the keyboard route to this room's exhibits and doorways, 44 px rows. No exhibit
 *    count (concept counts are shown in neither condition, 12.3 rule 13).
 *  - `CueNoteBar`: one manifest cue note at a time.
 *
 * Opaque `--ground` surfaces, 1 px `--rule-strong` boundaries, no radius, shadow, blur or motion.
 */
import { Check, ChevronDown, ChevronRight, CircleHelp, DoorOpen, Map as MapIcon, Mouse, Pause, X } from "lucide-react";

import { StudyBar, StudyBarButton } from "@/components/learning/study-bar";
import { Button } from "@/components/ui/button";
import type { SceneExhibit, ScenePortal } from "@/features/immersive/scene-model";
import { ROOM_TEXT, STUDY_BAR_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

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
            {mapAvailable ? <StudyBarButton icon={<MapIcon aria-hidden="true" />} label={STUDY_BAR_TEXT.plan} aria-pressed={mapOpen} disabled={!controlsEnabled} onClick={onToggleMap} /> : null}
            <StudyBarButton icon={<Mouse aria-hidden="true" />} label={STUDY_BAR_TEXT.mouseLook} aria-pressed={freeLook} disabled={!controlsEnabled} onClick={onToggleFreeLook} />
            <StudyBarButton icon={<CircleHelp aria-hidden="true" />} label={STUDY_BAR_TEXT.controlsHelp} disabled={!controlsEnabled} onClick={onHelp} />
            <StudyBarButton icon={<Pause aria-hidden="true" />} label={STUDY_BAR_TEXT.pause} disabled={!controlsEnabled} onClick={onPause} />
          </>
        }
      />
    </div>
  );
}


const ROW = "text-ui flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left text-ink hover:bg-sunk";

export function RoomContents({
  open,
  onToggle,
  exhibits,
  doorways,
  selectedId,
  onPreview,
  onSelect,
  onDoorway,
  doorLabel,
}: {
  open: boolean;
  onToggle(): void;
  exhibits: readonly SceneExhibit[];
  doorways: readonly ScenePortal[];
  selectedId: string | null;
  onPreview(id: string | null): void;
  onSelect(id: string): void;
  onDoorway(portal: ScenePortal): void;
  doorLabel(portal: ScenePortal): string;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <nav aria-label={ROOM_TEXT.label} data-museum-keys="ui" data-slot="museum-room-contents" className="flex min-h-0 w-[min(20rem,calc(100vw-2rem))] flex-col border border-rule-strong bg-ground">
      <button type="button" aria-expanded={open} aria-controls="museum-room-contents" onClick={onToggle} className={cn(ROW, "font-semibold")} data-slot="museum-room-contents-toggle">
        <Chevron aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
        <span>{titleCase(ROOM_TEXT.label)}</span>
      </button>
      {open ? (
        <div id="museum-room-contents" className="max-h-[40dvh] min-h-0 overflow-y-auto border-t border-rule">
          <ul className="list-none" onMouseLeave={() => onPreview(null)}>
            {exhibits.map((e) => {
              const current = selectedId === e.id;
              return (
                <li key={e.id} className="border-t border-rule first:border-t-0">
                  <button
                    type="button"
                    data-exhibit-id={e.id}
                    className={cn(ROW, current && "font-semibold")}
                    aria-current={current ? "true" : undefined}
                    onFocus={() => onPreview(e.id)}
                    onBlur={() => onPreview(null)}
                    onMouseEnter={() => onPreview(e.id)}
                    onClick={() => onSelect(e.id)}
                  >
                    <span className="w-6 shrink-0 text-right text-ink-3 tabular-nums" aria-hidden={e.sequence ? undefined : true}>
                      {e.sequence ? `${e.sequence.index + 1}.` : null}
                    </span>
                    <span className="min-w-0 flex-1">{titleCase(e.label)}</span>
                    {current ? <Check aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {doorways.length > 0 ? (
            <>
              <p className="text-eyebrow border-t border-rule px-4 pt-3 pb-1">{titleCase(ROOM_TEXT.doorways)}</p>
              <ul className="list-none">
                {doorways.map((p) => (
                  <li key={p.id}>
                    <button type="button" className={ROW} onClick={() => onDoorway(p)}>
                      <DoorOpen className="size-5 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                      <span className="min-w-0">{titleCase(doorLabel(p))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </nav>
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
