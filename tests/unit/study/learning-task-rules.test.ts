import { describe, expect, it } from "vitest";

import { HELP_LINES, PAUSE_TEXT } from "@/features/process/domain/guidance";
import { learningTaskRules } from "@/features/study/learning-task-rules";

describe("the learning task introduction follows the study's exposure settings", () => {
  it("promises no time limit when the study sets none", () => {
    const rules = learningTaskRules({ allowEarlyFinish: true }).join(" ");
    expect(rules).toContain("There is no time limit.");
    expect(rules).not.toMatch(/\d+ minutes?/);
  });

  it("names the configured cap, not a fixed 30 minutes", () => {
    const rules = learningTaskRules({ minutes: 20, allowEarlyFinish: true }).join(" ");
    expect(rules).toContain("up to 20 minutes");
    expect(rules).not.toContain("30");
    expect(learningTaskRules({ minutes: 1, allowEarlyFinish: true }).join(" ")).toContain("up to 1 minute.");
  });

  it("says the questions wait for the time when an early finish is not allowed", () => {
    const rules = learningTaskRules({ minutes: 30, allowEarlyFinish: false }).join(" ");
    expect(rules).toContain("lasts 30 minutes");
    expect(rules).toContain("not before");
    expect(rules).not.toContain("The last stop leads on to the questions.");
  });

  it("says the same in Help and Pause in both doors: a limit keeps running while paused", () => {
    expect(PAUSE_TEXT).toContain("keeps running while you are paused");
    expect(HELP_LINES.join(" ")).not.toMatch(/30 minutes/);
    expect(HELP_LINES.join(" ")).toContain("keeps running while you pause");
  });
});
