"use client";

/**
 * The 2D condition's top bar: the SHARED StudyBar (DESIGN.md 9.14; the same component as the 3D
 * museum's), with the 2D condition navigation group, the only part allowed to differ (12.1 rule 3):
 *
 *  - "In This Section": shows the shared PlaceRail while it is hidden (always below 1280 px, where
 *    the rail is a drawer; from 1280 px only after Hide). The 3D group has "In This Room" in the
 *    same way (DR-021);
 *  - Contents (below 1024 px only, where the index field is not shown): a sheet with the index
 *    (the study's traditions with their numbered sections) and the browse pages;
 *  - Search: a sheet with a 44 px search field, ONLY when the study enables search (off in
 *    study builds of both conditions, DR-019).
 *
 * "Up to <parent>" is removed (DR-021 decision 4): the sheet's Close returns to the section view,
 * and the rail's "Leads To" and the index cover the rest. The location (the current page title) is
 * resolved from the URL with the layout's index (navigation.ts `studyBarPlace`), so it is right on
 * the first paint; a concept page may name itself (`StudyBarLocation`, session.tsx).
 *
 * Contents moves are logged with the navigation source "index". While a sheet is open the page's
 * exposure region counts navigation (exposure.tsx). The familiarisation practice passes its own
 * contents, which stay on the practice page.
 */
import Form from "next/form";
import { usePathname } from "next/navigation";
import { List, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { StudyBar, StudyBarButton } from "@/components/learning/study-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { STUDY_BAR_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";

import { CONTENT_ID } from "../layout-ids";
import { index2d, studyBarPlace, type StudyBarIndex } from "../navigation";
import { href2d } from "../routes";

import { announceHash, useLocationHash } from "./hash-link";
import { useChromeOverlay } from "./exposure";
import { useNavigationCounter } from "./page-heading";
import { usePageLocation } from "./session";
import { Rail2dButton, StudyIndex, usePlace2d } from "./spread";
import { TrackedLink } from "./tracked-link";

export { CONTENT_ID };

/** One link of a Contents group (the practice page's own contents). */
export interface ContentsEntry {
  label: string;
  href: string;
}

export interface ContentsGroup {
  heading: string;
  entries: readonly ContentsEntry[];
}

const LINK_CLASS =
  "text-ui inline-flex min-h-11 w-full items-center text-indigo underline decoration-1 underline-offset-[0.2em] hover:text-indigo-hover hover:decoration-2 aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:no-underline";

export interface Learning2dStudyBarProps {
  index: StudyBarIndex;
  searchEnabled: boolean;
  /** The Contents sheet's groups (the practice passes its own); default: the index and the browse pages. */
  contents?: readonly ContentsGroup[];
  /** Fixed location text (the practice page); otherwise resolved from the URL. */
  location?: string;
}

export function Learning2dStudyBar({ index, searchEnabled, contents, location: fixedLocation }: Learning2dStudyBarProps) {
  const pathname = usePathname() ?? "";
  useNavigationCounter(pathname);
  const place = studyBarPlace(pathname, index);
  const own = usePageLocation(pathname);
  const location = fixedLocation ?? (own?.location || place.location);
  const overlay = useChromeOverlay();
  const [contentsOpen, setContentsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { setOpen: setOverlay } = overlay;
  useEffect(() => {
    setOverlay(contentsOpen || searchOpen);
  }, [contentsOpen, searchOpen, setOverlay]);
  useEffect(() => () => setOverlay(false), [setOverlay]);

  return (
    <StudyBar
      location={location}
      skipTargetId={CONTENT_ID}
      conditionNav={
        <>
          <Rail2dButton />
          <ContentsSheet open={contentsOpen} onOpenChange={setContentsOpen} pathname={pathname}>
            {(follow) => (contents ? <ContentsGroups groups={contents} pathname={pathname} onFollow={follow} /> : <IndexContents index={index} pathname={pathname} onFollow={follow} />)}
          </ContentsSheet>
          {searchEnabled ? <SearchSheet open={searchOpen} onOpenChange={setSearchOpen} /> : null}
        </>
      }
    />
  );
}

/**
 * Closing a sheet returns focus to its trigger, unless a link in it was followed: then focus goes
 * where the destination puts it (the new page's h1, or the section a hash opens).
 */
function useFollowedLink() {
  const followed = useRef(false);
  return {
    mark: () => {
      followed.current = true;
    },
    onCloseAutoFocus: (e: Event) => {
      if (followed.current) e.preventDefault();
      followed.current = false;
    },
  };
}

/** The Contents sheet: below 1024 px only (from 1024 px the index is on screen, in the field). */
function ContentsSheet({ open, onOpenChange, pathname, children }: { open: boolean; onOpenChange(open: boolean): void; pathname: string; children(follow: (href: string) => void): ReactNode }) {
  const followed = useFollowedLink();
  const follow = (href: string) => {
    followed.mark();
    onOpenChange(false);
    announceHash(href, pathname);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <StudyBarButton icon={<List aria-hidden="true" />} label={STUDY_BAR_TEXT.contents} className="lg:hidden" />
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} onCloseAutoFocus={followed.onCloseAutoFocus} data-slot="contents-sheet">
        <SheetHeader>
          <SheetTitle>{STUDY_BAR_TEXT.contents}</SheetTitle>
        </SheetHeader>
        {children(follow)}
      </SheetContent>
    </Sheet>
  );
}

/** The learning pages' Contents: the index (every tradition with its sections), then the browse pages. */
function IndexContents({ index, pathname, onFollow }: { index: StudyBarIndex; pathname: string; onFollow(href: string): void }) {
  const place = usePlace2d(index);
  useLocationHash();
  return <StudyIndex traditions={index2d({ ...place, conceptSlug: null }, index)} pathname={pathname} onFollow={onFollow} browse className="px-3 pt-0 pb-8 xs:px-4" />;
}

function ContentsGroups({ groups, pathname, onFollow }: { groups: readonly ContentsGroup[]; pathname: string; onFollow(href: string): void }) {
  const headingBase = useId();
  const current = (href: string) => (href.split("#")[0] === pathname && !href.includes("#") ? "page" : undefined);
  return (
    <nav aria-label={STUDY_BAR_TEXT.contents} className="flex flex-col gap-8 px-6 pb-8 max-xs:px-4">
      {groups.map((g, gi) => (
        <section key={g.heading} aria-labelledby={`${headingBase}-${gi}`}>
          <h3 id={`${headingBase}-${gi}`} className="text-label border-b border-rule pb-2">
            {titleCase(g.heading)}
          </h3>
          <ul className="mt-1 flex flex-col">
            {g.entries.map((e) => (
              <li key={e.href}>
                <TrackedLink href={e.href} source="index" aria-current={current(e.href)} className={LINK_CLASS} onClick={() => onFollow(e.href)}>
                  {titleCase(e.label)}
                </TrackedLink>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function SearchSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const followed = useFollowedLink();
  const fieldId = useId();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <StudyBarButton icon={<Search aria-hidden="true" />} label={STUDY_BAR_TEXT.search} />
      </SheetTrigger>
      <SheetContent side="top" aria-describedby={undefined} onCloseAutoFocus={followed.onCloseAutoFocus} data-slot="search-sheet">
        <SheetHeader>
          <SheetTitle>{STUDY_BAR_TEXT.search}</SheetTitle>
        </SheetHeader>
        <Form
          role="search"
          action={href2d.search()}
          onSubmit={() => {
            followed.mark();
            onOpenChange(false);
          }}
          className="mx-auto flex w-full max-w-[39.25rem] flex-col gap-2 px-6 pb-6 max-xs:px-4"
        >
          <label htmlFor={fieldId} className="text-[0.9375rem] leading-5 font-bold text-ink">
            Search concepts
          </label>
          <div className="flex gap-2">
            <Input id={fieldId} name="q" type="search" minLength={2} maxLength={200} required autoComplete="off" className="flex-1" />
            <Button type="submit">{STUDY_BAR_TEXT.search}</Button>
          </div>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
