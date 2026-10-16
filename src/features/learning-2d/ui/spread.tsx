"use client";

/**
 * The 2D spread (DR-021, DESIGN.md 7.2 to 7.4): the 2D counterpart of the museum's layout, the
 * same geometry in both conditions.
 *
 *  - From 1280 px: the shared PlaceRail ("In This Section") docked at x = 0 (collapsed by default,
 *    as the 3D "In This Room" rail; the StudyBar button shows it and Hide collapses it again; DR-021
 *    Addendum B), the field with the index, and the sheet column docked right at the 3D panel's
 *    x, width and top (`SHEET_DOCK_CLASS`), each scrolling on its own below the chrome.
 *  - 1024 to 1279 px: the same, with the rail as a non-modal drawer over the field, opened from the
 *    StudyBar button "In This Section" (as "In This Room" in 3D).
 *  - Below 1024 px: the sheet column at full width in the page flow (the museum's panel covers its
 *    scene there); the index moves into the StudyBar's Contents sheet, the rail stays a drawer.
 *
 * The index is a list, never a spatial map: the study's traditions with their numbered sections.
 * While a concept is open it recedes (the traditions, and only the concept's own section under its tradition), so
 * the sheet is the single focus (cognitive-load rule). Rail and index moves are logged with their
 * navigation source ("rail", "index") on the next page's entry.
 */
import { MapPin } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";

import { StallCue } from "@/components/learning/guidance";
import { PlaceRail, PlaceRailButton, usePlaceRail, type PlaceRailState } from "@/components/learning/place-rail";
import { SHEET_DOCK_CLASS_LG, useSheetScrollbar } from "@/components/knowledge";
import { INDEX_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { TraditionName } from "@/components/knowledge/tradition-marker";

import { CONTENT_ID, RAIL_ID } from "../layout-ids";
import { index2d, PAGE_TITLES, place2d, rail2d, type IndexTradition, type Place2d, type Rail2dModel, type StudyBarIndex } from "../navigation";
import { href2d, LEARN_2D } from "../routes";

import { announceHash, useLocationHash } from "./hash-link";
import { useVisitStore } from "./session";
import { TrackedLink } from "./tracked-link";

const RailContext = createContext<PlaceRailState | null>(null);

/** Holds the 2D rail's open state for the StudyBar button and the spread (siblings in the frame). */
export function Rail2dProvider({ children }: { children: ReactNode }) {
  // Collapsed by default in both conditions (DR-021 Addendum B): the 3D rail is collapsed by default
  // (lead decision), so the 2D rail is too, and a concept opened from the default state of either
  // condition has the same competing elements beside it (P33).
  const state = usePlaceRail(RAIL_ID, false);
  return <RailContext.Provider value={state}>{children}</RailContext.Provider>;
}

export function useRail2d(): PlaceRailState | null {
  return useContext(RailContext);
}

/** The StudyBar control that shows the rail while it is hidden (always below 1280 px). */
export function Rail2dButton() {
  const state = useRail2d();
  if (!state) return null;
  return <PlaceRailButton condition="2d" railId={RAIL_ID} state={state} />;
}

/** The current 2D place, from the URL (path and section hash). */
export function usePlace2d(index: StudyBarIndex): Place2d {
  const pathname = usePathname() ?? "";
  const hash = useLocationHash();
  return place2d(pathname, hash, index);
}

const noSubscription = () => () => {};

/** Below the chrome: the notice strip (when shown), the StudyBar and its 1 px line. */
const BELOW_CHROME = "top-[calc(var(--notice-offset,0px)+var(--studybar-h)+1px)]";

export interface Learning2dSpreadProps {
  index: StudyBarIndex;
  prompts: ReactNode | null;
  children: ReactNode;
  /** The practice page's own rail rows (in-page anchors) instead of the learning pages'. */
  railOverride?: Rail2dModel;
  /** The practice page's own field instead of the index. */
  fieldOverride?: ReactNode;
}

export function Learning2dSpread({ index, prompts, children, railOverride, fieldOverride }: Learning2dSpreadProps) {
  const rail = useRail2d();
  const place = usePlace2d(index);
  const pathname = usePathname() ?? "";
  const visits = useVisitStore();
  // The visit memory lives in sessionStorage: none on the server and while hydrating (so both
  // renders agree), then read on every render (every move re-renders the spread).
  const visitedKey = useSyncExternalStore(
    noSubscription,
    () => Object.keys(visits.read().visits).sort().join("|"),
    () => "",
  );
  const visited = useMemo<ReadonlySet<string>>(() => new Set(visitedKey ? visitedKey.split("|") : []), [visitedKey]);

  const model = railOverride ?? rail2d(place, index, visited);
  const rootRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  useSheetScrollbar(columnRef, rootRef);

  const follow = (href: string) => {
    rail?.chosen();
    announceHash(href, pathname);
  };

  return (
    <div ref={rootRef} data-slot="learn-2d-spread" className="relative lg:flex lg:h-[calc(100dvh-var(--notice-offset,0px)-var(--studybar-h)-1px)] lg:overflow-hidden">
      {/* The sheet column: the page (a concept's KnowledgeSheet, or the page's own column). First in the
          DOM, as the museum's panel is, so the Tab path between the sheet and the StudyBar is the same in
          both conditions (P24); drawn last (right) from 1024 px. */}
      <div
        ref={columnRef}
        id={CONTENT_ID}
        tabIndex={-1}
        data-slot="learn-2d-sheet"
        className={cn("relative bg-ground outline-none lg:order-last lg:h-full lg:shrink-0 lg:overflow-y-scroll lg:overscroll-contain", SHEET_DOCK_CLASS_LG)}
      >
        {children}
      </div>

      {/* The field: the index (1024 px and wider; below, it is in the StudyBar's Contents). */}
      <div
        data-slot="learn-2d-field"
        className={cn("hidden bg-field lg:block lg:min-w-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain", rail?.wideOpen && "min-[80rem]:pl-[min(18rem,85vw)]")}
      >
        {prompts ? <div className="px-6 pt-6">{prompts}</div> : null}
        {/* While a concept is open the browse pages recede with the sections (index2d): the field then
            lists only where the participant is, so the open sheet is the one focus (P33). */}
        {fieldOverride ?? <StudyIndex traditions={index2d(place, index)} pathname={pathname} browse={place.conceptSlug === null} />}
      </div>

      {/* The shared PlaceRail, last in the DOM as in the museum (fixed at the left edge). */}
      {rail ? (
        <PlaceRail
          id={RAIL_ID}
          condition="2d"
          items={model.items}
          destinations={model.destinations}
          onHide={rail.hide}
          className={cn(rail.railClass, "fixed bottom-0 left-0 z-(--z-drawer)", BELOW_CHROME)}
          renderItem={(item, content, className) => {
            const row = model.items.find((r) => r.key === item.key)!;
            return (
              <TrackedLink href={row.href} source="rail" aria-current={row.current ? "location" : undefined} className={className} onClick={() => follow(row.href)}>
                {content}
              </TrackedLink>
            );
          }}
          renderDestination={(item, content, className) => {
            const row = model.destinations.find((r) => r.key === item.key)!;
            return (
              <TrackedLink href={row.href} source="rail" className={className} onClick={() => follow(row.href)}>
                {content}
              </TrackedLink>
            );
          }}
        />
      ) : null}

      {/* Bottom right of the view, left of the docked sheet, as in the 3D museum. The cue itself takes no
          condition-specific class (P23: byte-identical DOM); the wrapper restores its pointer events. */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2 lg:right-[calc(39.25rem+1px+var(--panel-sb,0px)+1rem)] [&>*]:pointer-events-auto">
        <StallCue />
      </div>
    </div>
  );
}

const INDEX_ROW =
  "flex min-h-11 w-full items-center gap-4 px-3 py-2 text-ink no-underline hover:bg-sunk aria-[current]:bg-wash aria-[current]:hover:bg-wash";

function Here() {
  return (
    <span className="text-ui inline-flex shrink-0 items-center gap-2">
      <MapPin aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />
      {INDEX_TEXT.youAreHere}
    </span>
  );
}

/**
 * The index: the study's traditions in the canonical order, each with its numbered sections. Also
 * the body of the StudyBar's Contents sheet below 1024 px (`onFollow` closes the sheet).
 */
/** The browse pages, after the traditions in the index. */
export function browseEntries(): { label: string; href: string }[] {
  return [
    { label: PAGE_TITLES.catalogue, href: href2d.catalogue() },
    { label: PAGE_TITLES.categories, href: href2d.categories() },
    { label: PAGE_TITLES.comparisons, href: href2d.comparisons() },
  ];
}

export function StudyIndex({
  traditions,
  pathname,
  onFollow,
  className,
  browse = false,
}: {
  traditions: readonly IndexTradition[];
  pathname: string;
  onFollow?(href: string): void;
  className?: string;
  /** Also list the browse pages (index, categories, comparisons) after the traditions. */
  browse?: boolean;
}) {
  const follow = (href: string) => {
    onFollow?.(href);
    announceHash(href, pathname);
  };
  return (
    <nav aria-labelledby="learn-2d-index-heading" data-slot="study-index" className={cn("max-w-[36rem] px-6 pt-6 pb-12", className)}>
      <h2 id="learn-2d-index-heading" className="sr-only">
        {titleCase(INDEX_TEXT.label)}
      </h2>
      <ul className="flex list-none flex-col gap-6">
        {traditions.map((t) => (
          <li key={t.slug} data-tradition={t.slug}>
            <h3 className="text-h3">
              <TrackedLink
                href={t.href}
                source="index"
                aria-current={t.current ? "location" : undefined}
                className={cn(INDEX_ROW, "justify-between")}
                onClick={() => follow(t.href)}
              >
                <TraditionName traditionKey={t.slug} className="min-w-0 break-words">
                  {titleCase(t.name)}
                </TraditionName>
                {t.current ? <Here /> : null}
              </TrackedLink>
            </h3>
            {t.sections.length > 0 ? (
              <ol className="mt-1 flex list-none flex-col" aria-label={titleCase(t.name)}>
                {t.sections.map((s) => (
                  <li key={s.id}>
                    <TrackedLink href={s.href} source="index" aria-current={s.current ? "location" : undefined} className={INDEX_ROW} onClick={() => follow(s.href)}>
                      <span className="text-ui w-6 shrink-0 text-right text-ink-3 tabular-nums">{s.number}</span>
                      <span className="text-ui min-w-0 flex-1 break-words">{titleCase(s.title)}</span>
                      {s.current ? <Here /> : null}
                    </TrackedLink>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ul>
      {browse ? (
        <>
          <h3 className="text-label mt-8 border-t border-rule px-3 pt-4 pb-1">{titleCase(INDEX_TEXT.browse)}</h3>
          <ul className="flex list-none flex-col">
            {browseEntries().map((e) => {
              const current = e.href === pathname || (e.href === LEARN_2D && pathname === `${LEARN_2D}/`);
              return (
                <li key={e.href}>
                  <TrackedLink href={e.href} source="index" aria-current={current ? "location" : undefined} className={cn(INDEX_ROW, "justify-between")} onClick={() => follow(e.href)}>
                    <span className="text-ui min-w-0 break-words">{titleCase(e.label)}</span>
                    {current ? <Here /> : null}
                  </TrackedLink>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </nav>
  );
}
