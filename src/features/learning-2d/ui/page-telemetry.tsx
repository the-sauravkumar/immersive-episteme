"use client";

/**
 * Page-level telemetry for every 2D page (EVT-01/02, 08, 09, 13):
 *  - `page_entered` (via, fromId) when the page becomes active, `page_exited` (dwellMs,
 *    scrollDepth) when it is left: unmounted, hidden by the router's <Activity>, or the tab is
 *    closed (pagehide, captured before the tracker's exit flush);
 *  - `concept_encountered` (mode "opened") on concept pages;
 *  - `item_revisited` when the page was entered before in this session (not on reload);
 *  - `tradition_crossed` when the page belongs to a different tradition than the last one.
 * React Strict Mode's simulated unmount/remount is absorbed (the exit is deferred one task and
 * cancelled when the same page re-enters), so development logs match production.
 */
import { useEffect, useRef } from "react";

import { useStableTracker } from "./use-stable-tracker";
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

import { shortCodeOrUndefined } from "../routes";

import { useVisitStore } from "./session";

export interface PageTelemetryProps {
  pageId: string;
  conceptId?: string;
  traditionId?: string;
  category?: KnowledgeCategoryCode;
}

const MAX_DWELL_MS = 24 * 60 * 60 * 1000;

function scrollDepthNow(): number {
  if (typeof document === "undefined") return 0;
  const el = document.documentElement;
  const total = el.scrollHeight;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (window.scrollY + window.innerHeight) / total));
}

export function usePageTelemetry({ pageId, conceptId, traditionId, category }: PageTelemetryProps): void {
  const tel = useStableTracker();
  const visits = useVisitStore();
  const live = useRef<{ pageId: string; enteredAt: number; maxDepth: number; exitTimer: ReturnType<typeof setTimeout> | null; exited: boolean } | null>(null);

  useEffect(() => {
    const context = { roomOrPageId: pageId, ...(conceptId ? { conceptId } : {}), ...(traditionId ? { traditionId } : {}), ...(category ? { category } : {}) };

    const prev = live.current;
    let cur: NonNullable<typeof prev>;
    if (prev && prev.pageId === pageId && prev.exitTimer !== null && !prev.exited) {
      // Strict Mode remount of the same page: keep the entry, cancel the pending exit.
      clearTimeout(prev.exitTimer);
      prev.exitTimer = null;
      cur = prev;
    } else {
      const entry = visits.enter(pageId, traditionId ?? null);
      cur = { pageId, enteredAt: performance.now(), maxDepth: scrollDepthNow(), exitTimer: null, exited: false };
      live.current = cur;
      const fromId = shortCodeOrUndefined(entry.fromId);
      void tel.pageEntered({ ...context, metadata: { via: entry.via, ...(fromId ? { fromId } : {}) } });
      if (entry.crossedFrom && traditionId) {
        void tel.traditionCrossed({ ...context, metadata: { fromTraditionId: entry.crossedFrom, toTraditionId: traditionId } });
      }
      if (conceptId) void tel.conceptEncountered({ ...context, metadata: { mode: "opened" } });
      if (entry.visitCount > 1 && entry.via !== "resume") {
        void tel.itemRevisited({ ...context, metadata: { itemKind: conceptId ? "concept" : "page", visitCount: entry.visitCount } });
      }
    }

    const exit = () => {
      if (cur.exited) return;
      cur.exited = true;
      cur.exitTimer = null;
      const dwellMs = Math.min(MAX_DWELL_MS, Math.max(0, Math.floor(performance.now() - cur.enteredAt)));
      const scrollDepth = Math.round(Math.max(cur.maxDepth, scrollDepthNow()) * 100) / 100;
      void tel.pageExited({ ...context, metadata: { dwellMs, scrollDepth } });
    };
    const onScroll = () => {
      cur.maxDepth = Math.max(cur.maxDepth, scrollDepthNow());
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Capture: runs before the tracker's own pagehide handler, so the exit joins the exit flush.
    window.addEventListener("pagehide", exit, { capture: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", exit, { capture: true });
      if (!cur.exited) cur.exitTimer = setTimeout(exit, 0);
    };
  }, [pageId, conceptId, traditionId, category, visits, tel]);
}

/** Component form of usePageTelemetry for server-rendered pages. */
export function PageTelemetry(props: PageTelemetryProps) {
  usePageTelemetry(props);
  return null;
}
