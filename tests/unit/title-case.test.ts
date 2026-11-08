import { describe, expect, it } from "vitest";

import { titleCase } from "@/lib/text/title-case";

describe("titleCase", () => {
  it.each([
    ["explore the demo", "Explore The Demo"],
    ["learning conditions", "Learning Conditions"],
    ["iron-tannin black", "Iron-Tannin Black"],
    ["the process of mordant printing", "The Process Of Mordant Printing"],
    ["what it is made of", "What It Is Made Of"],
    ["SUS and UMUX-LITE in 2D", "SUS And UMUX-LITE In 2D"],
    ["Ajrakh: the resist stages", "Ajrakh: The Resist Stages"],
    ["the artisan's decisions", "The Artisan's Decisions"],
    ["“dabu” mud resist", "“Dabu” Mud Resist"],
    ["  spaced  words ", "  Spaced  Words "],
    ["", ""],
  ])("%s -> %s", (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });

  it("is idempotent", () => {
    for (const s of ["Iron-Tannin Black", "The Process Of Mordant Printing", "Explore The Demo"]) {
      expect(titleCase(titleCase(s))).toBe(titleCase(s));
    }
  });
});
