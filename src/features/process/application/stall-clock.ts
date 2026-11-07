export interface StallClock {
  readonly stallMs: number;
  readonly countedMs: number;
  readonly runningSince: number | null;
  readonly cueShown: boolean;
}

export function startStallClock(stallSeconds: number, running: boolean, nowMs: number): StallClock {
  return { stallMs: stallSeconds * 1000, countedMs: 0, runningSince: running ? nowMs : null, cueShown: false };
}

const counted = (clock: StallClock, nowMs: number): number => clock.countedMs + (clock.runningSince === null ? 0 : nowMs - clock.runningSince);

export function setStallRunning(clock: StallClock, running: boolean, nowMs: number): StallClock {
  if ((clock.runningSince !== null) === running) return clock;
  return { ...clock, countedMs: counted(clock, nowMs), runningSince: running ? nowMs : null };
}

export function restartStallClock(clock: StallClock, nowMs: number): StallClock {
  return { ...clock, countedMs: 0, runningSince: clock.runningSince === null ? null : nowMs, cueShown: false };
}

export function stallDueInMs(clock: StallClock, nowMs: number): number | null {
  if (clock.cueShown || clock.runningSince === null) return null;
  return Math.max(0, clock.stallMs - counted(clock, nowMs));
}

export function showStallCue(clock: StallClock, nowMs: number): StallClock {
  return { ...clock, countedMs: counted(clock, nowMs), runningSince: clock.runningSince === null ? null : nowMs, cueShown: true };
}
