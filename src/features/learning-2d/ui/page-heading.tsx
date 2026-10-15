"use client";

/**
 * The single h1 of a 2D page that is not a concept page (concept pages use the KnowledgeSheet's
 * own title, which takes focus when the concept opens), in `text-title`. After an in-app
 * navigation focus moves to it (focus management for keyboard and screen-reader users: the new
 * page is announced from its heading, and Tab continues from the top of the new content). The
 * first page of a load keeps the browser's default focus (the skip link stays first).
 *
 * In-app navigations are counted by the StudyBar, which the layout mounts once
 * (`useNavigationCounter`).
 */
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { titleCase, titleCaseNode } from "@/lib/text/title-case";

let navigations = 0;

/** Counts in-app navigations (path changes after the first render). Used once, by the 2D StudyBar. */
export function useNavigationCounter(pathname: string): void {
  // Compares paths (not "first run"), so React Strict Mode's repeated effects count nothing.
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    navigations++;
  }, [pathname]);
}

/**
 * `verbatim` follows the Title Case heading text as given, never re-cased (the learner's own
 * search words: "Results for “indigo”").
 */
export function PageHeading({ children, verbatim, className, id }: { children: ReactNode; verbatim?: string; className?: string; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (navigations === 0 || window.location.hash) return;
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} id={id} tabIndex={-1} className={cn("text-title text-ink outline-offset-4", className)}>
      {verbatim && typeof children === "string" ? casedBefore(children, verbatim) : titleCaseNode(children)}
      {verbatim ? <> {verbatim}</> : null}
    </h1>
  );
}

/**
 * `text` in Title Case as it reads before `verbatim` (so a trailing "for" stays lower case, as it
 * would mid-title): the whole heading is cased, then the verbatim part is cut off again.
 */
function casedBefore(text: string, verbatim: string): string {
  const whole = titleCase(`${text} ${verbatim}`);
  return whole.length === text.length + 1 + verbatim.length ? whole.slice(0, text.length) : titleCase(text);
}
