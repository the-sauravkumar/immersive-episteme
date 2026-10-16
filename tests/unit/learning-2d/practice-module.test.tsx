/**
 * The 2D practice page's module evaluates: its module-level constants are declared before they are
 * used (a constant used before its declaration threw "Cannot access before initialization" when
 * the production server first loaded the page).
 */
import { describe, expect, it } from "vitest";

describe("2D practice module", () => {
  it("evaluates and exports the page component", async () => {
    const mod = await import("@/features/learning-2d/ui/practice");
    expect(typeof mod.Practice2d).toBe("function");
    // A cold import compiles the whole 2D learning UI (the sheet, rail and index), which takes
    // longer than the default 5 s on this machine when the other test files run beside it.
  }, 60_000);
});
