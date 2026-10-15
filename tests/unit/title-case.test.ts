import { describe, expect, it } from "vitest";

import { titleCase } from "@/lib/text/title-case";

describe("titleCase", () => {
  it.each([
    ["explore the demo", "Explore the Demo"],
    ["learning conditions", "Learning Conditions"],
    ["iron-tannin black", "Iron-Tannin Black"],
    ["the process of mordant printing", "The Process of Mordant Printing"],
    ["what it is made of", "What It Is Made Of"],
    ["SUS and UMUX-LITE in 2D", "SUS and UMUX-LITE in 2D"],
    ["Ajrakh: the resist stages", "Ajrakh: The Resist Stages"],
    ["the artisan's decisions", "The Artisan's Decisions"],
    ["“dabu” mud resist", "“Dabu” Mud Resist"],
    ["  spaced  words ", "  Spaced  Words "],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });

  it("is idempotent", () => {
    for (const s of ["Iron-Tannin Black", "The Process of Mordant Printing", "Explore the Demo"]) {
      expect(titleCase(titleCase(s))).toBe(titleCase(s));
    }
  });
});
