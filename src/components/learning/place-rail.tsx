"use client";

/**
 * PlaceRail (DR-021): ONE component in both conditions. "In This Section" (2D) and "In This Room"
 * (3D) are this component, at the same position, width and row size, with the same words, marks
 * and keyboard behaviour; only what a row DOES differs (12.1 rule 3): a 2D row opens the concept
 * (a route change), a 3D row walks to the exhibit. The caller renders each row's link or button
 * through `renderItem` / `renderDestination` with the class and content given here.
 *
 * Content (P29): titles, types, steps and destinations only, the in-world text set. Rows are the
 * concepts of the current section (2D) or the exhibits of the current room (3D) in order; then
 * "Leads To": the other sections (2D) or the doorways (3D). No claim text, counts or images.
 *
 * Marks: the current row is on `--wash` in weight 700 with the words "You are here"; a visited row
 * carries a quiet check (ink-3) plus the visually hidden word "Visited". Both conditions mark
 * visits the same way (the 2D visit memory, the 3D `setVisited` contract).
 *
 * Placement (the caller positions it; the geometry is the same in both): x = 0, width
 * `min(18rem, 85vw)`, from the bottom of the chrome to the bottom of the viewport, `--field`, a
 * 1 px `--rule-strong` right edge, internal scroll with `overscroll-behavior: contain`, 44 px rows.
 * From 1280 px it is docked (2D: open by default; 3D: collapsed by default, a lead decision);
 * below 1280 px it is a non-modal drawer over the field in both, opened from the StudyBar button of
 * the same name. Escape in the drawer closes it and returns focus to that button.
 */
import { Check, MapPin, PanelLeft, PanelLeftClose } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { RAIL_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { StudyBarButton } from "./study-bar";

/** The rail is docked from this width; below it, it is a drawer (DR-021 7.2, 7.3). */
export const RAIL_WIDE_QUERY = "(min-width: 80rem)";

export type RailCondition = "2d" | "immersive";

/** True from 1280 px (false on the server and where matchMedia is unavailable). */
export function railIsWide(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(RAIL_WIDE_QUERY).matches;
}

export interface PlaceRailItem {
  key: string;
  /** A concept, exhibit, section or room title (Title Case is applied here). */
  title: string;
  /** Type and step ("Process stage, step 3 of 14"), from `railDetail`. */
  detail?: string | null;
  current?: boolean;
  visited?: boolean;
}

export interface PlaceRailProps {
  id: string;
  condition: RailCondition;
  items: readonly PlaceRailItem[];
  destinations: readonly PlaceRailItem[];
  renderItem(item: PlaceRailItem, content: ReactNode, className: string): ReactNode;
  renderDestination(item: PlaceRailItem, content: ReactNode, className: string): ReactNode;
  /** The rail's Hide button and Escape (Escape only while it is a drawer). */
  onHide(): void;
  /** Positioning classes from the caller (same geometry in both conditions). */
  className?: string;
}

/** The class of every rail row (link in 2D, button in 3D): 44 px, full width, `--wash` when current. */
export const RAIL_ROW_CLASS =
  "group/row flex min-h-11 w-full items-start gap-3 px-4 py-2.5 text-left text-ink no-underline hover:bg-sunk aria-[current]:bg-wash aria-[current]:hover:bg-wash";

function RowContent({ item }: { item: PlaceRailItem }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui break-words group-aria-[current]/row:font-bold">{titleCase(item.title)}</span>
        {item.detail ? <span className="text-source">{item.detail}</span> : null}
        {item.current ? (
          <span className="text-ui mt-1 inline-flex items-center gap-2">
            <MapPin aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />
            {RAIL_TEXT.youAreHere}
          </span>
        ) : null}
      </span>
      {item.visited ? (
        <>
          <Check aria-hidden="true" strokeWidth={2} className="mt-1 size-4 shrink-0 text-ink-3" data-slot="rail-visited" />
          <span className="sr-only">{RAIL_TEXT.visited}</span>
        </>
      ) : null}
    </>
  );
}

/** The id of the rail's heading (focus moves to it when the rail opens). */
export const railHeadingId = (railId: string) => `${railId}-heading`;

export function PlaceRail({ id, condition, items, destinations, renderItem, renderDestination, onHide, className }: PlaceRailProps) {
  const headingId = railHeadingId(id);
  const heading = RAIL_TEXT.heading[condition];
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || railIsWide()) return;
    e.stopPropagation();
    onHide();
  };
  return (
    <nav
      id={id}
      aria-labelledby={headingId}
      data-slot="place-rail"
      data-museum-keys="rail"
      onKeyDown={onKeyDown}
      className={cn("w-[min(18rem,85vw)] flex-col overflow-y-auto overscroll-contain border-r border-rule-strong bg-field pb-6 text-ink", className)}
    >
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-2 py-2 pr-2 pl-4">
        <h2 id={headingId} tabIndex={-1} className="text-h3 outline-offset-4">
          {titleCase(heading)}
        </h2>
        <Button type="button" variant="ghost" onClick={onHide} aria-controls={id} data-slot="rail-hide" className="px-3">
          <PanelLeftClose aria-hidden="true" />
          {RAIL_TEXT.hide}
        </Button>
      </div>
      {items.length > 0 ? (
        <ul className="flex list-none flex-col" data-slot="rail-items">
          {items.map((item) => (
            <li key={item.key}>{renderItem(item, <RowContent item={item} />, RAIL_ROW_CLASS)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-source px-4 pb-2">{RAIL_TEXT.empty}</p>
      )}
      {destinations.length > 0 ? (
        <>
          <h3 className="text-label mt-4 border-t border-rule px-4 pt-4 pb-1">{titleCase(RAIL_TEXT.leadsTo)}</h3>
          <ul className="flex list-none flex-col" data-slot="rail-destinations">
            {destinations.map((d) => (
              <li key={d.key}>{renderDestination(d, <RowContent item={d} />, RAIL_ROW_CLASS)}</li>
            ))}
          </ul>
        </>
      ) : null}
    </nav>
  );
}

/**
 * Open state of the rail, the same rules in both conditions:
 *  - from 1280 px: docked; open by default when `defaultOpenWide` (2D), collapsed otherwise (3D);
 *    Hide collapses it and the StudyBar button reopens it;
 *  - below 1280 px: a drawer, closed by default, opened by the StudyBar button; Hide, Escape or
 *    choosing a row closes it.
 * The visibility is CSS (`railClass`, `buttonClass`), so the server render and the first client
 * render agree at every width. Hiding returns focus to the StudyBar button; opening moves it to
 * the rail's heading.
 */
export function usePlaceRail(railId: string, defaultOpenWide: boolean) {
  const [wideChoice, setWideChoice] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const wideOpen = wideChoice ?? defaultOpenWide;
  const focusAfter = useRef<"button" | "heading" | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(RAIL_WIDE_QUERY);
    const sync = () => {
      setIsWide(mq.matches);
      if (mq.matches) setDrawerOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const want = focusAfter.current;
    focusAfter.current = null;
    // By id: the button sits in the StudyBar and the heading in the rail, rendered elsewhere.
    if (want === "button") document.querySelector<HTMLElement>(`[data-slot=rail-button][aria-controls="${CSS.escape(railId)}"]`)?.focus({ preventScroll: true });
    else if (want === "heading") document.getElementById(railHeadingId(railId))?.focus({ preventScroll: true });
  }, [focusTick, railId]);

  const open = useCallback(() => {
    if (railIsWide()) setWideChoice(true);
    else setDrawerOpen(true);
    focusAfter.current = "heading";
    setFocusTick((n) => n + 1);
  }, []);
  const hide = useCallback(() => {
    if (railIsWide()) setWideChoice(false);
    else setDrawerOpen(false);
    focusAfter.current = "button";
    setFocusTick((n) => n + 1);
  }, []);
  /** A row was chosen: the drawer closes (focus goes where the destination puts it). */
  const chosen = useCallback(() => {
    if (!railIsWide()) setDrawerOpen(false);
  }, []);

  /** The rail is on screen now (client only; false on the server). */
  const shown = isWide ? wideOpen : drawerOpen;
  return {
    wideOpen,
    drawerOpen,
    shown,
    open,
    hide,
    chosen,
    /** Visibility of the rail element. */
    railClass: cn(drawerOpen ? "flex" : "hidden", wideOpen ? "min-[80rem]:flex" : "min-[80rem]:hidden"),
    /** Visibility of the StudyBar button: always below 1280 px, from 1280 px only while the rail is hidden. */
    buttonClass: wideOpen ? "min-[80rem]:hidden" : undefined,
    /** Rail open state for the button's `aria-expanded` at the current width. */
    expanded: shown,
  };
}

export type PlaceRailState = ReturnType<typeof usePlaceRail>;

/** The StudyBar button that shows the rail ("In This Section" / "In This Room"), the same in both. */
export function PlaceRailButton({ condition, railId, state, disabled }: { condition: RailCondition; railId: string; state: PlaceRailState; disabled?: boolean }) {
  const label = titleCase(RAIL_TEXT.heading[condition]);
  return (
    <StudyBarButton
      icon={<PanelLeft aria-hidden="true" />}
      label={label}
      aria-expanded={state.expanded}
      aria-controls={railId}
      disabled={disabled}
      data-slot="rail-button"
      className={state.buttonClass}
      onClick={() => (state.expanded ? state.hide() : state.open())}
    />
  );
}
