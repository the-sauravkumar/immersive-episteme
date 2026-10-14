/**
 * Learning time budget: the study's fixed learning-phase duration, identical for both
 * conditions. The SERVER is authoritative: `startedAt` / `endsAt` are study_sessions timestamps
 * (migration 0009) and `serverNow` is the database clock when the context was resolved; the
 * client only counts down from them. Client-safe (types + pure math).
 */
export interface LearningTimeBudget {
  mode: "fixed_time" | "self_paced";
  /** Budget in seconds (fixed_time), else null. */
  budgetSeconds: number | null;
  /** fixed_time: may the participant finish before the budget ends? (study config) */
  allowEarlyFinish: boolean;
  /** Server timestamps (ISO). Null in demo/preview, where nothing is persisted. */
  startedAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  /** Database clock when the budget was read (ISO). */
  serverNow: string;
  /** True when start/end are stored server-side (study mode). */
  persisted: boolean;
}

export interface LearningTimeState {
  /** Seconds left (fixed_time), else null. Never negative. */
  remainingSeconds: number | null;
  /** Seconds since the learning phase started (null when no start is known). */
  elapsedSeconds: number | null;
  /** The fixed budget has run out, or the server recorded the end. */
  expired: boolean;
  /** May the UI offer "finish learning" now? */
  canFinish: boolean;
}

/**
 * The budget state at `serverNowMs` (milliseconds on the server clock: the caller adds the
 * monotonic time elapsed since `budget.serverNow` was read). In demo/preview mode with no stored
 * start, the phase is treated as starting at `budget.serverNow`.
 */
export function learningTimeState(budget: LearningTimeBudget, serverNowMs: number): LearningTimeState {
  const read = Date.parse(budget.serverNow);
  const start = budget.startedAt ? Date.parse(budget.startedAt) : budget.persisted ? null : read;
  const elapsedSeconds = start === null ? null : Math.max(0, Math.floor((serverNowMs - start) / 1000));
  if (budget.endedAt) return { remainingSeconds: budget.mode === "fixed_time" ? 0 : null, elapsedSeconds, expired: true, canFinish: false };
  if (budget.mode !== "fixed_time" || budget.budgetSeconds === null) {
    return { remainingSeconds: null, elapsedSeconds, expired: false, canFinish: true };
  }
  const end = budget.endsAt ? Date.parse(budget.endsAt) : start === null ? null : start + budget.budgetSeconds * 1000;
  const remainingSeconds = end === null ? budget.budgetSeconds : Math.max(0, Math.ceil((end - serverNowMs) / 1000));
  const expired = remainingSeconds === 0;
  return { remainingSeconds, elapsedSeconds, expired, canFinish: expired || budget.allowEarlyFinish };
}
