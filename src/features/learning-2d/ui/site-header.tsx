"use client";

/**
 * The 2D condition's top bar: the SHARED StudyBar (DESIGN.md 9.14; the same component as the 3D
 * museum's), with the 2D condition navigation group, the only part allowed to differ (12.1 rule 3):
 *
 *  - Contents: a sheet listing the study's traditions (canonical order) with their template
 *    sections, then the knowledge categories and the comparisons;
 *  - Search: a sheet with a 44 px search field, ONLY when the study enables search (off in
 *    study builds of both conditions, DR-019);
 *  - on concept pages, "Up to <parent>": the concept's section on its tradition page, or the
 *    comparisons page (concept pages carry no breadcrumb, DESIGN.md 6).
 *
 * All of the 2D navigation lives here, so the chrome above content is the AccessNotice slot plus
 * the 56 px bar and its 2 px rule, as in 3D. The location (the current page title) is resolved from
 * the URL with the layout's index (navigation.ts `studyBarPlace`), so it is right on the first
 * paint; a concept page may name itself (`StudyBarLocation`, session.tsx).
 *
 * Menu moves are logged as navigation entries (`via: "navigation"`). While a sheet is open the
 * page's exposure region counts navigation (exposure.tsx). The familiarisation practice passes
 * its own contents, which stay on the practice page.
 */
import Form from "next/form";
import { usePathname } from "next/navigation";
import { CornerLeftUp, List, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { TraditionName } from "@/components/knowledge/tradition-marker";
import { STUDY_BAR_LINK_CLASS, StudyBar, StudyBarButton, StudyBarLabel } from "@/components/learning/study-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { STUDY_BAR_TEXT } from "@/features/learning/strings";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { PAGE_TITLES, studyBarPlace, type ParentLink, type StudyBarIndex } from "../navigation";
import { href2d } from "../routes";
import { EPISTEMIC_SECTIONS } from "../template";

import { useChromeOverlay } from "./exposure";
import { useNavigationCounter } from "./page-heading";
import { usePageLocation } from "./session";
import { TrackedLink } from "./tracked-link";

/** The id of the 2D content column, the target of the StudyBar's "Skip to content" link. */
export const CONTENT_ID = "learn-2d-content";

/** One link of the Contents sheet; a tradition carries its sections. */
export interface ContentsEntry {
  label: string;
  href: string;
  /** Marks a tradition (neutral marker, DESIGN.md 7.7). */
  traditionKey?: string;
  sections?: readonly { label: string; href: string }[];
}

export interface ContentsGroup {
  heading: string;
  entries: readonly ContentsEntry[];
}

/** The Contents of the learning pages: traditions with their sections, then the browse pages. */
export function learningContents(traditions: StudyBarIndex["traditions"]): ContentsGroup[] {
  return [
    {
      heading: "Traditions",
      entries: traditions.map((t) => ({
        label: t.name,
        href: href2d.tradition(t.slug),
        traditionKey: t.slug,
        sections: EPISTEMIC_SECTIONS.map((s) => ({ label: s.title, href: href2d.traditionSection(t.slug, s.id) })),
      })),
    },
    {
      heading: "Browse",
      entries: [
        { label: PAGE_TITLES.catalogue, href: href2d.catalogue() },
        { label: PAGE_TITLES.categories, href: href2d.categories() },
        { label: PAGE_TITLES.comparisons, href: href2d.comparisons() },
      ],
    },
  ];
}

const LINK_CLASS =
  "text-ui inline-flex min-h-11 w-full items-center text-indigo underline decoration-1 underline-offset-[3px] hover:text-indigo-hover hover:decoration-2 aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:no-underline";

export interface Learning2dStudyBarProps {
  index: StudyBarIndex;
  searchEnabled: boolean;
  /** The Contents sheet (default: the learning pages'). The practice passes its own. */
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
  const parent = own ? own.parent : place.parent;
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
          <ContentsSheet groups={contents ?? learningContents(index.traditions)} open={contentsOpen} onOpenChange={setContentsOpen} pathname={pathname} />
          {searchEnabled ? <SearchSheet open={searchOpen} onOpenChange={setSearchOpen} /> : null}
          {place.conceptPage && parent ? <UpLink parent={parent} /> : null}
        </>
      }
    />
  );
}

function UpLink({ parent }: { parent: ParentLink }) {
  const label = STUDY_BAR_TEXT.upTo(parent.label);
  return (
    <TrackedLink href={parent.href} aria-label={label} title={label} data-slot="study-bar-up" className={STUDY_BAR_LINK_CLASS}>
      <CornerLeftUp aria-hidden="true" />
      <StudyBarLabel>{label}</StudyBarLabel>
    </TrackedLink>
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

function ContentsSheet({
  groups,
  open,
  onOpenChange,
  pathname,
}: {
  groups: readonly ContentsGroup[];
  open: boolean;
  onOpenChange(open: boolean): void;
  pathname: string;
}) {
  const followed = useFollowedLink();
  const headingBase = useId();
  const follow = (href: string) => {
    followed.mark();
    onOpenChange(false);
    // A hash link on the page already shown changes the URL without a hashchange event; the
    // section disclosures listen for one to open themselves.
    // The router updates the URL after this handler, so wait (at most about a second) for the hash.
    const [path, hash] = href.split("#");
    if (!hash || path !== pathname) return;
    const announce = (framesLeft: number) => {
      if (window.location.hash === `#${hash}`) window.dispatchEvent(new HashChangeEvent("hashchange"));
      else if (framesLeft > 0) window.requestAnimationFrame(() => announce(framesLeft - 1));
    };
    window.requestAnimationFrame(() => announce(60));
  };
  const current = (href: string) => (href.split("#")[0] === pathname && !href.includes("#") ? "page" : undefined);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <StudyBarButton icon={<List aria-hidden="true" />} label={STUDY_BAR_TEXT.contents} />
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} onCloseAutoFocus={followed.onCloseAutoFocus} data-slot="contents-sheet">
        <SheetHeader>
          <SheetTitle>{STUDY_BAR_TEXT.contents}</SheetTitle>
        </SheetHeader>
        <nav aria-label={STUDY_BAR_TEXT.contents} className="flex flex-col gap-8 px-6 pb-8 max-xs:px-4">
          {groups.map((g, gi) => (
            <section key={g.heading} aria-labelledby={`${headingBase}-${gi}`}>
              <h3 id={`${headingBase}-${gi}`} className="text-eyebrow border-b border-rule pb-2">
                {titleCase(g.heading)}
              </h3>
              <ul className="mt-1 flex flex-col">
                {g.entries.map((e) => (
                  <li key={e.href} className={cn(e.sections && "mt-3 first:mt-0")}>
                    <ContentsLink href={e.href} current={current(e.href)} onFollow={follow} className={cn(e.traditionKey && "font-serif text-[1.1875rem] leading-7 font-semibold")}>
                      {e.traditionKey ? <TraditionName traditionKey={e.traditionKey}>{titleCase(e.label)}</TraditionName> : titleCase(e.label)}
                    </ContentsLink>
                    {e.sections ? (
                      <ul aria-label={titleCase(e.label)} className="ml-4 border-l border-rule pl-4">
                        {e.sections.map((s) => (
                          <li key={s.href}>
                            <ContentsLink href={s.href} onFollow={follow}>
                              {titleCase(s.label)}
                            </ContentsLink>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function ContentsLink({ href, current, onFollow, className, children }: { href: string; current?: "page"; onFollow(href: string): void; className?: string; children: ReactNode }) {
  return (
    <TrackedLink href={href} aria-current={current} className={cn(LINK_CLASS, className)} onClick={() => onFollow(href)}>
      {children}
    </TrackedLink>
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
          <label htmlFor={fieldId} className="text-[0.875rem] leading-5 font-medium text-ink">
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
