import { describe, expect, it } from "vitest";

import { PAUSE_TEXT, sessionHelpLines } from "@/features/process/domain/guidance";
import { learningTaskRules } from "@/features/study/learning-task-rules";

describe("the learning task introduction follows the study's cap", () => {
  it("promises no time limit when the study sets none", () => {
    const rules = learningTaskRules({}).join(" ");
    expect(rules).toContain("There is no time limit.");
    expect(rules).not.toMatch(/\d+ minutes?/);
  });

  it("names the configured cap, not a fixed 30 minutes", () => {
    const rules = learningTaskRules({ minutes: 20 }).join(" ");
    expect(rules).toContain("up to 20 minutes");
    expect(rules).not.toContain("30");
    expect(learningTaskRules({ minutes: 1 }).join(" ")).toContain("up to 1 minute.");
  });

  it("says the same in Help and Pause in both doors: a limit keeps running while paused", () => {
    expect(PAUSE_TEXT).toContain("keeps running while you are paused");
    const help = sessionHelpLines({ limitMinutes: 25 }).join(" ");
    expect(help).not.toMatch(/30 minutes/);
    expect(help).toContain("keeps running while you pause");
  });
});
