import { describe, expect, it } from "vitest";

import { restartStallClock, setStallRunning, showStallCue, stallDueInMs, startStallClock } from "@/features/process/application/stall-clock";
import { finishLabel, PRACTICE_HELP_LINES, sessionHelpLines, UNTIMED_SESSION } from "@/features/process/domain/guidance";

describe("help lines", () => {
  it("states the study's own limit, never a fixed 30 minutes", () => {
    expect(sessionHelpLines({ limitMinutes: 45 }).join(" ")).toContain("up to the session limit of 45 minutes");
    expect(sessionHelpLines({ limitMinutes: 1 }).join(" ")).toContain("limit of 1 minute.");
    expect(sessionHelpLines({ limitMinutes: 20 }).join(" ")).not.toContain("30");
  });

  it("states that there is no limit when no cap runs", () => {
    const lines = sessionHelpLines(UNTIMED_SESSION).join(" ");
    expect(lines).toContain("There is no time limit");
    expect(lines).not.toMatch(/\d+ minutes/);
  });

  it("keeps the practice help free of stages, sources and a time limit", () => {
    expect(PRACTICE_HELP_LINES.join(" ")).not.toMatch(/stage|source|minutes/i);
  });

  it("names the last button by what it leads to", () => {
    expect(finishLabel(true)).toBe("Questions");
    expect(finishLabel(false)).toBe("Finish");
  });
});

describe("stall clock", () => {
  it("counts only running time and fires once per stall", () => {
    let clock = startStallClock(60, true, 0);
    expect(stallDueInMs(clock, 10_000)).toBe(50_000);
    clock = setStallRunning(clock, false, 10_000);
    expect(stallDueInMs(clock, 500_000)).toBeNull();
    clock = setStallRunning(clock, true, 500_000);
    expect(stallDueInMs(clock, 520_000)).toBe(30_000);
    clock = showStallCue(clock, 550_000);
    expect(stallDueInMs(clock, 900_000)).toBeNull();
    clock = restartStallClock(clock, 900_000);
    expect(stallDueInMs(clock, 900_000)).toBe(60_000);
  });
});
