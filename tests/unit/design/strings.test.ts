/**
 * P20 (DESIGN.md 12.4, 12.1 rule 2): every learner-visible interface string of both conditions
 * comes from one module (src/features/learning/strings.ts). Neither route declares its own
 * `*_TEXT` table, and no file on either route repeats a shared string as a literal (a copy that
 * could drift from the other condition's wording). The same check feeds the interface parity
 * report (tests/e2e/parity.spec.ts).
 */
import { describe, expect, it } from "vitest";

import * as strings from "@/features/learning/strings";

import { stringTableParity } from "./static-checks";

describe("P20: one string table for both conditions", () => {
  const result = stringTableParity(strings);

  it("declares no interface string table outside strings.ts", () => {
    expect(result.inlineTables).toEqual([]);
  });

  it("repeats no shared string as a local literal", () => {
    expect(result.duplicates).toEqual([]);
  });

  it("the onboarding movement paragraphs differ by at most 10% of words (P23)", () => {
    const words = (s: string) => s.trim().split(/\s+/).length;
    const a = words(strings.ONBOARDING_TEXT.movement["2d"]);
    const b = words(strings.ONBOARDING_TEXT.movement.immersive);
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThanOrEqual(0.1);
  });
});
