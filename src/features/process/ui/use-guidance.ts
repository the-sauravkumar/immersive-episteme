"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { restartStallClock, setStallRunning, showStallCue, stallDueInMs, startStallClock, type StallClock } from "../application/stall-clock";
import { HINT_CUE_ID, STALL_CUE_ID, type DoorGuidance, type GuidanceAction, type GuidanceCueId } from "../domain/guidance";

export type GuidanceReport = (action: GuidanceAction, cueId: GuidanceCueId) => void;

export interface GuidanceOptions {
  readonly guidance: DoorGuidance;
  readonly progress: string;
  readonly suspended: boolean;
  readonly report?: GuidanceReport;
}

export interface GuidanceControls {
  readonly hint: string | null;
  readonly hintOpen: boolean;
  readonly cueVisible: boolean;
  readonly openHint: () => void;
  readonly closeHint: () => void;
  readonly followCue: () => void;
  readonly dismissCue: () => void;
}

export function useGuidance({ guidance, progress, suspended, report }: GuidanceOptions): GuidanceControls {
  const { hint, stallSeconds } = guidance;
  const [hintOpen, setHintOpen] = useState(false);
  const [cueVisible, setCueVisible] = useState(false);
  const [seenProgress, setSeenProgress] = useState(progress);
  const reportRef = useRef(report);
  const clock = useRef<StallClock | null>(null);
  const cueing = hint !== null && stallSeconds !== null;
  const running = cueing && !suspended && !hintOpen && !cueVisible;

  if (seenProgress !== progress) {
    setSeenProgress(progress);
    setCueVisible(false);
  }

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  useEffect(() => {
    if (!cueing || stallSeconds === null) {
      clock.current = null;
      return;
    }
    const now = Date.now();
    clock.current = clock.current && clock.current.stallMs === stallSeconds * 1000 ? restartStallClock(clock.current, now) : startStallClock(stallSeconds, false, now);
  }, [cueing, stallSeconds, progress]);

  useEffect(() => {
    if (!clock.current) return;
    const now = Date.now();
    clock.current = setStallRunning(clock.current, running, now);
    const due = stallDueInMs(clock.current, now);
    if (due === null) return;
    const timer = setTimeout(() => {
      if (!clock.current) return;
      clock.current = showStallCue(clock.current, Date.now());
      setCueVisible(true);
      reportRef.current?.("shown", STALL_CUE_ID);
    }, due);
    return () => clearTimeout(timer);
  }, [running, cueing, stallSeconds, progress]);

  const resolveCue = useCallback((action: GuidanceAction) => {
    if (clock.current) clock.current = restartStallClock(clock.current, Date.now());
    setCueVisible(false);
    reportRef.current?.(action, STALL_CUE_ID);
  }, []);

  const openHint = useCallback(() => {
    setHintOpen(true);
    reportRef.current?.("followed", HINT_CUE_ID);
  }, []);
  const closeHint = useCallback(() => setHintOpen(false), []);
  const followCue = useCallback(() => {
    resolveCue("followed");
    setHintOpen(true);
  }, [resolveCue]);
  const dismissCue = useCallback(() => resolveCue("dismissed"), [resolveCue]);

  return { hint, hintOpen, cueVisible, openHint, closeHint, followCue, dismissCue };
}
