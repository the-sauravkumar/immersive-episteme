"use client";

/**
 * Logs one `query_submitted` per search results page (EVT-06; spec name "search_performed").
 * Only the query's length and the number of results are logged, never the query text.
 * Rendered only when the study enables search.
 */
import { useEffect } from "react";

import { pageId2d } from "../routes";

import { useStableTracker } from "./use-stable-tracker";

export function SearchTelemetry({ queryLength, resultCount }: { queryLength: number; resultCount: number }) {
  const tracker = useStableTracker();
  useEffect(() => {
    if (queryLength === 0) return;
    void tracker.querySubmitted({ roomOrPageId: pageId2d.search(), metadata: { queryLength, resultCount } });
  }, [tracker, queryLength, resultCount]);
  return null;
}
