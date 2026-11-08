import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UnverifiedContentNotice } from "@/components/learning/unverified-content-notice";

describe("the under-review notice", () => {
  it("renders the strip the notice rules wait for", () => {
    render(<UnverifiedContentNotice />);
    const strip = screen.getByRole("complementary", { name: "Content state" });
    expect(strip.getAttribute("data-slot")).toBe("unverified-notice");
    expect(strip.textContent).toContain("under review");
  });
});
