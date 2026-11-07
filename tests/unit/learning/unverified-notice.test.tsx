import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UnverifiedContentNotice } from "@/components/learning/unverified-content-notice";

const css = (path: string) => readFileSync(path, "utf8");

describe("the under-review notice", () => {
  it("renders the strip the notice rules wait for", () => {
    render(<UnverifiedContentNotice />);
    const strip = screen.getByRole("complementary", { name: "Content state" });
    expect(strip.getAttribute("data-slot")).toBe("unverified-notice");
    expect(strip.textContent).toContain("under review");
  });

  it("is merged into the access notice for visitors and moves both doors below it", () => {
    expect(css("src/app/globals.css")).toContain('[data-condition]:has([data-slot="unverified-notice"]) [data-access-notice] [data-notice-variant="review"]');
    expect(css("src/app/globals.css")).not.toContain("museum-root");
    expect(css("src/features/course/ui/course.css")).toContain(':has(> [data-access-notice], > [data-slot="unverified-notice"]) .course');
    expect(css("src/features/walkthrough/ui/walkthrough.css")).toContain(':has(> [data-access-notice], > [data-slot="unverified-notice"]) .walkthrough');
  });

  it("is rendered by the shared door session when a caption the learner will see is under review", () => {
    expect(css("src/app/(learning)/learn/door-session.tsx")).toContain("anyCaptionUnderReview(templates) ? <UnverifiedContentNotice /> : null");
  });
});
