import type { ExposureLayer, NavigationSurface, PauseCause } from "@/features/telemetry/contracts";
import type { KnowledgeCategoryCode } from "@/lib/validation/enums";

import type { RawTrackFn } from "./events";

type IntervalEndReason = "switched" | "closed" | "exit" | "budget_ended";

interface IntervalContext {
  traditionId?: string;
  category?: KnowledgeCategoryCode;
  roomOrPageId?: string;
  target?: string;
}

interface OpenInterval {
  kind: "exposure" | "navigation";
  intervalId: string;
  conceptId: string | null;
  layer: ExposureLayer | null;
  surface: NavigationSurface | null;
  startMonoMs: number;
  context: IntervalContext;
}

interface TimingTotals {
  elapsedMs: number;
  exposureMs: number;
  navigationMs: number;
  pausedMs: number;
  idleMs: number;
}

export interface TimeAccountant {
  current(): OpenInterval | null;
  paused(): boolean;
  pauseCauses(): PauseCause[];
  beginExposure(conceptId: string, layer: ExposureLayer, context?: IntervalContext): string;
  beginNavigation(surface?: NavigationSurface, context?: IntervalContext): string;
  end(reason?: Exclude<IntervalEndReason, "switched">): void;
  endIf(intervalId: string, reason?: Exclude<IntervalEndReason, "switched">): void;
  pause(cause: PauseCause): void;
  resume(cause: PauseCause): void;
  totals(): TimingTotals;
}

export function createTimeAccountant(opts: { track: RawTrackFn; monotonicNow: () => number; newId?: () => string }): TimeAccountant {
  const { track, monotonicNow } = opts;
  let counter = 0;
  const createdAt = monotonicNow();
  const newId = opts.newId ?? (() => `iv-${Math.floor(createdAt).toString(36)}-${(counter++).toString(36)}`);
  let open: (OpenInterval & { pausedMs: number }) | null = null;
  const causes = new Set<PauseCause>();
  const seenCauses = new Set<PauseCause>();
  let pausedAt: number | null = null;
  const done = { exposureMs: 0, navigationMs: 0, pausedMs: 0 };

  const close = (reason: IntervalEndReason, at: number) => {
    if (!open) return;
    const iv = open;
    open = null;
    const pausedMs = iv.pausedMs + (pausedAt !== null ? at - pausedAt : 0);
    const active = Math.max(0, at - iv.startMonoMs - pausedMs);
    const metaEnd = { intervalId: iv.intervalId, startMonoMs: iv.startMonoMs, endMonoMs: at, activeMs: Math.floor(active), pausedMs: Math.floor(pausedMs), reason };
    if (iv.kind === "exposure") {
      done.exposureMs += active;
      void track("exposure_ended", { ...iv.context, conceptId: iv.conceptId!, metadata: { ...metaEnd, layer: iv.layer! } });
    } else {
      done.navigationMs += active;
      void track("navigation_ended", { ...iv.context, metadata: { ...metaEnd, ...(iv.surface ? { surface: iv.surface } : {}) } });
    }
  };

  const begin = (iv: Omit<OpenInterval, "startMonoMs" | "intervalId">): string => {
    const at = monotonicNow();
    close("switched", at);
    const intervalId = newId();
    open = { ...iv, intervalId, startMonoMs: at, pausedMs: pausedAt !== null ? -(at - pausedAt) : 0 };
    if (iv.kind === "exposure") {
      void track("exposure_started", { ...iv.context, conceptId: iv.conceptId!, metadata: { intervalId, layer: iv.layer!, startMonoMs: at } });
    } else {
      void track("navigation_started", { ...iv.context, metadata: { intervalId, startMonoMs: at, ...(iv.surface ? { surface: iv.surface } : {}) } });
    }
    return intervalId;
  };

  return {
    current: () => (open ? { kind: open.kind, intervalId: open.intervalId, conceptId: open.conceptId, layer: open.layer, surface: open.surface, startMonoMs: open.startMonoMs, context: open.context } : null),
    paused: () => pausedAt !== null,
    pauseCauses: () => [...causes],
    beginExposure: (conceptId, layer, context = {}) => begin({ kind: "exposure", conceptId, layer, surface: null, context }),
    beginNavigation: (surface, context = {}) => begin({ kind: "navigation", conceptId: null, layer: null, surface: surface ?? null, context }),
    end: (reason = "closed") => close(reason, monotonicNow()),
    endIf: (intervalId, reason = "closed") => {
      if (open?.intervalId === intervalId) close(reason, monotonicNow());
    },
    pause: (cause) => {
      if (causes.has(cause)) return;
      causes.add(cause);
      seenCauses.add(cause);
      if (pausedAt !== null) return;
      pausedAt = monotonicNow();
      void track("timing_paused", { metadata: { intervalKind: open?.kind ?? "none", cause, ...(open ? { intervalId: open.intervalId } : {}) } });
    },
    resume: (cause) => {
      if (!causes.delete(cause) || causes.size > 0 || pausedAt === null) return;
      const at = monotonicNow();
      const pausedMs = at - pausedAt;
      pausedAt = null;
      done.pausedMs += pausedMs;
      if (open) open.pausedMs += pausedMs;
      const all = [...seenCauses];
      seenCauses.clear();
      void track("timing_resumed", {
        metadata: { intervalKind: open?.kind ?? "none", pausedMs: Math.floor(pausedMs), causes: all, ...(open ? { intervalId: open.intervalId } : {}) },
      });
    },
    totals: () => {
      const at = monotonicNow();
      const runningPause = pausedAt !== null ? at - pausedAt : 0;
      const openActive = open ? Math.max(0, at - open.startMonoMs - (open.pausedMs + runningPause)) : 0;
      const exposureMs = done.exposureMs + (open?.kind === "exposure" ? openActive : 0);
      const navigationMs = done.navigationMs + (open?.kind === "navigation" ? openActive : 0);
      const pausedMs = done.pausedMs + runningPause;
      const elapsedMs = at - createdAt;
      return { elapsedMs, exposureMs, navigationMs, pausedMs, idleMs: elapsedMs - exposureMs - navigationMs - pausedMs };
    },
  };
}
