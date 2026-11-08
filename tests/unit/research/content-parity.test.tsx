import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContentParity } from "@/components/parity/content-parity";
import type { ContentParityRow } from "@/server/research/parity/summary";

const row = (latest: ContentParityRow["latest"]): ContentParityRow => ({ studyId: "s-1", title: "Pilot", slug: "pilot", status: "active", isDemo: false, latest });

describe("ContentParity", () => {
  it("shows the stored report's real figures and verdict", () => {
    render(
      <ContentParity
        rows={[row({ id: "r-1", createdAt: "2026-11-07T10:20:30.000Z", passed: false, criticalFailures: 2, warnings: 1, checks: 14, passedChecks: 11, snapshotLabel: "snap-3" })]}
        number={1}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("11 of 14")).toBeTruthy();
    expect(within(table).getByText("snap-3")).toBeTruthy();
    expect(within(table).getByText("2026-11-07 10:20")).toBeTruthy();
    expect(within(table).getByText("Fail")).toBeTruthy();
  });

  it("says Not run for a study with no stored report, and says so when there is no study", () => {
    const { unmount } = render(<ContentParity rows={[row(null)]} />);
    expect(screen.getByText("Not run")).toBeTruthy();
    unmount();
    render(<ContentParity rows={[]} />);
    expect(screen.getByText("No studies yet, so no content parity report exists.")).toBeTruthy();
  });
});
