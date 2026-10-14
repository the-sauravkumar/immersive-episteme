/**
 * CitationDisclosure: collapsed by default, keyboard-operable, non-modal, full details when
 * expanded, human-readable label, and citation telemetry when a provider is present.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CitationDisclosure } from "@/components/citations";
import { sourceDisplayLabel, type Citation } from "@/features/knowledge/read/view";
import { MemoryOutbox, TelemetryProvider } from "@/features/telemetry/client";

const SESSION = "0190f0a0-0000-7000-8000-000000000001";
const CONCEPT = "0190f0a0-0000-7000-8000-0000000000aa";

const citation: Citation = {
  id: "0190f0a0-0000-7000-8000-0000000000bb",
  label: sourceDisplayLabel({ author: "Placeholder Author", publisher: null, year: 2001, title: "Placeholder title" }),
  kind: "historical_documentation",
  title: "Placeholder title",
  author: "Placeholder Author",
  publisher: "Placeholder Press",
  year: 2001,
  url: "https://example.org/source",
  accessedOn: null,
  reliability: "high",
  verificationState: "under_review",
  locator: "p. 12",
  quote: "a placeholder quote",
};

describe("CitationDisclosure", () => {
  it("is collapsed by default, shows a readable label and never the uuid", () => {
    render(
      <>
        <p>Learning content</p>
        <CitationDisclosure citation={citation} conceptId={CONCEPT} claimIndex={0} />
      </>,
    );
    const button = screen.getByRole("button", { name: /Source: Placeholder Author 2001/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("p. 12")).toBeNull();
    expect(document.body.textContent).not.toContain(citation.id);
    expect(screen.getByText("Learning content")).toBeVisible();
  });

  it("opens and closes with the keyboard, inline and non-modal, with full details", async () => {
    const user = userEvent.setup();
    render(<CitationDisclosure citation={citation} conceptId={CONCEPT} claimIndex={2} />);
    await user.tab();
    await user.keyboard("{Enter}");
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", { name: /Source details/ });
    for (const text of ["Placeholder title", "Placeholder Press", "2001", "p. 12", "Historical documentation", "High"]) {
      expect(region).toHaveTextContent(text);
    }
    expect(region).toHaveTextContent("a placeholder quote");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByText(/Open the source/));
    await user.keyboard("{Escape}");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveFocus();
    await user.keyboard(" ");
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("records citation_opened and citation_closed with concept, source and claim index", async () => {
    const user = userEvent.setup();
    const outbox = new MemoryOutbox();
    render(
      <TelemetryProvider
        config={{ sessionId: SESSION, contentVersion: "review-test", appBuild: "test", mode: "study", storage: outbox, lifecycle: false, fetchImpl: (() => new Promise(() => undefined)) as typeof fetch, sendBeacon: null }}
      >
        <CitationDisclosure citation={citation} conceptId={CONCEPT} claimIndex={1} />
      </TelemetryProvider>,
    );
    const button = screen.getByRole("button");
    await user.click(button);
    await user.click(button);
    await waitFor(async () => expect((await outbox.list(SESSION)).length).toBe(2));
    const events = await outbox.list(SESSION);
    expect(events.map((e) => e.type)).toEqual(["citation_opened", "citation_closed"]);
    expect(events[0]).toMatchObject({ conceptId: CONCEPT, metadata: { sourceId: citation.id, claimIndex: 1 } });
    expect(events[1]!.metadata).toHaveProperty("openMs");
  });
});

describe("sourceDisplayLabel", () => {
  it("prefers author, then publisher, then a shortened title", () => {
    expect(sourceDisplayLabel({ author: "A. Author", publisher: "P", year: 1999, title: "T" })).toBe("A. Author 1999");
    expect(sourceDisplayLabel({ author: null, publisher: "Some Press", year: null, title: "T" })).toBe("Some Press");
    expect(sourceDisplayLabel({ author: " ", publisher: null, year: 2020, title: "A very long title ".repeat(10) }).endsWith("… (2020)")).toBe(true);
  });
});
