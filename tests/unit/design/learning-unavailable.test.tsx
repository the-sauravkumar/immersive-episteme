/**
 * P23, StateMessage "unavailable" (DESIGN.md 9.7, 12.1 rule 1): the 2D content-unavailable page and
 * the museum's unavailable screen render ONE shared message. A working demo session cannot be put
 * into the unavailable state from a browser run, so the interface parity report lists this part of
 * P23 as not measured in the rendered shells; this test is its code-level evidence: both condition
 * files render `LearningUnavailable` and neither sets its own unavailable wording, and the message
 * itself is the same for every reason a condition can report.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LearningUnavailable } from "@/components/learning/learning-unavailable";
import { UNAVAILABLE_TEXT } from "@/features/learning/strings";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("learning unavailable message (P23)", () => {
  it("both conditions render the shared component, with no wording of their own", () => {
    for (const file of ["src/features/learning-2d/ui/frame.tsx", "src/app/(learning)/learn/immersive/page.tsx"]) {
      const src = read(file);
      expect(src, file).toMatch(/import \{ LearningUnavailable \} from "@\/components\/learning\/learning-unavailable"/);
      expect(src, file).toMatch(/<LearningUnavailable reason=\{/);
      expect(src, file).not.toMatch(/UNAVAILABLE_TEXT/);
    }
  });

  it("renders the same markup for the same reason, with the reason as its detail line", () => {
    const a = render(<LearningUnavailable reason="session_not_found" />).container.innerHTML;
    const b = render(<LearningUnavailable reason="session_not_found" />).container.innerHTML;
    expect(a).toBe(b);
    expect(a).toContain(UNAVAILABLE_TEXT.session_not_found);
    expect(a).toContain("Reason: session_not_found.");
    expect(a).toContain('role="status"');
    const other = render(<LearningUnavailable reason="no_review_snapshot" />).container.innerHTML;
    expect(other).toContain(UNAVAILABLE_TEXT.no_content);
  });
});
