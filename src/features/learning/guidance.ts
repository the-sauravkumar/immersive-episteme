/**
 * Hybrid guidance (study decision D6), SHARED by both learning conditions: the wording, the
 * telemetry ids and the stall rule. Pure and client-safe; the React binding is
 * src/components/learning/guidance.tsx.
 *
 * Stall rule: the stall cue is due when no NEW concept has been exposed for `stallSeconds` of
 * active time spent without content on screen. "Exposed" is the shared time accountant's exposure
 * interval (the shared sheet-open rule, DR-050: 2D: the concept page is shown; 3D: its information panel is
 * open), the same definition the timing metrics use, so the cue fires on the same behaviour in
 * both conditions. Time while content is exposed (reading, also re-reading) and paused time (tab
 * hidden, window blurred, a non-content modal) do not count: a stall is time spent moving or
 * browsing without reaching anything new. The cue shows once per stall: it is due again only
 * after another new concept has been exposed and `stallSeconds` have passed once more.
 */

/** `cueId` of the guidance_cue_used events (same metadata in both conditions). */
export const GUIDANCE_CUE_IDS = { hint: "guidance.hint", stall: "guidance.stall" } as const;

/** Interface wording, identical in both conditions (not craft content). */
export const GUIDANCE_TEXT = {
  hintLabel: "Hint",
  hintTitle: "Hint",
  stallCue: "You have not opened anything new for a while.",
  stallAction: "Show the hint",
  dismiss: "Dismiss",
  /** Shown by the hint in the familiarisation practice instead of the study's hint (no task content). */
  practiceHint: "Practice: in the learning task, the hint written for the study appears here.",
} as const;

export interface StallTick {
  /** Monotonic time in ms (performance.now()). */
  nowMs: number;
  /** Concept of the open exposure interval, or null. */
  exposedConceptId: string | null;
  /** True while interval timing is paused. */
  paused: boolean;
}

export interface StallDetector {
  /** Feeds one observation; returns true exactly when the stall cue becomes due. */
  tick(t: StallTick): boolean;
  /** Active ms without content on screen since the last newly exposed concept (or the start). */
  activeMsSinceNew(): number;
  /** Concepts exposed so far. */
  seenCount(): number;
}

export function createStallDetector(stallSeconds: number): StallDetector {
  const stallMs = Math.max(0, stallSeconds) * 1000;
  const seen = new Set<string>();
  let lastMs: number | null = null;
  /** Whether the time since the previous tick counts (nothing on screen, not paused). */
  let counting = false;
  let activeSinceNew = 0;
  let armed = true;
  return {
    tick({ nowMs, exposedConceptId, paused }) {
      // The time since the previous tick is attributed to the state observed at that tick.
      const dt = lastMs === null || !counting ? 0 : Math.max(0, nowMs - lastMs);
      lastMs = nowMs;
      counting = !paused && !exposedConceptId;
      if (exposedConceptId && !seen.has(exposedConceptId)) {
        seen.add(exposedConceptId);
        activeSinceNew = 0;
        armed = true;
        return false;
      }
      activeSinceNew += dt;
      if (armed && activeSinceNew >= stallMs) {
        armed = false;
        return true;
      }
      return false;
    },
    activeMsSinceNew: () => activeSinceNew,
    seenCount: () => seen.size,
  };
}
