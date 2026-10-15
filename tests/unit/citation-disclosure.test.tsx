/**
 * CitationNote / CitationRecord (DESIGN.md 9.8; CitationDisclosure is the deprecated alias):
 * collapsed by default, keyboard-operable, non-modal, full details when expanded, the derived
 * short label ("first author, year · locator"), the quote at claim size, and citation telemetry
 * when a provider is present.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CitationDisclosure, CitationNote } from "@/components/citations";
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
  passages: [],
};

describe("CitationDisclosure", () => {
  it("is collapsed by default, shows a readable label and never the uuid", () => {
    render(
      <>
        <p>Learning content</p>
        <CitationDisclosure citation={citation} conceptId={CONCEPT} claimIndex={0} />
      </>,
    );
    const button = screen.getByRole("button", { name: "Source: Placeholder Author, 2001 · p. 12" });
    expect(button.className).toContain("min-h-11");
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
    // The evidence is as large as the claim: Source Serif 4 at claim size, with the indigo rule.
    const quote = region.querySelector("blockquote")!;
    expect(quote.className).toContain("text-quote");
    expect(quote.className).toContain("border-indigo");
    expect(quote.textContent).toBe("“a placeholder quote”");
    expect(region).toHaveTextContent("Kind of Source");
    expect(screen.getByRole("link", { name: /Open the source/ }).className).toContain("min-h-11");
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

describe("CitationNote is the one component (CitationDisclosure is an alias)", () => {
  it("exports the same function under both names", () => {
    expect(CitationDisclosure).toBe(CitationNote);
  });
});

describe("sourceDisplayLabel", () => {
  it("prefers author, then publisher, then a shortened title", () => {
    expect(sourceDisplayLabel({ author: "A. Author", publisher: "P", year: 1999, title: "T" })).toBe("A. Author 1999");
    expect(sourceDisplayLabel({ author: null, publisher: "Some Press", year: null, title: "T" })).toBe("Some Press");
    expect(sourceDisplayLabel({ author: " ", publisher: null, year: 2020, title: "A very long title ".repeat(10) }).endsWith("… (2020)")).toBe(true);
  });

  it("lists every located supporting passage with its locator and any curator note", async () => {
    const user = userEvent.setup();
    const withPassages: Citation = {
      ...citation,
      quote: "first placeholder passage",
      passages: [
        { locator: "PDF p. 4", quote: "first placeholder passage", note: null },
        { locator: '§ "Placeholder section"', quote: "second placeholder passage", note: "Check against the original page." },
      ],
    };
    render(<CitationDisclosure citation={withPassages} conceptId={CONCEPT} claimIndex={0} />);
    await user.click(screen.getByRole("button"));
    const list = screen.getByRole("list", { name: "Supporting passages" });
    for (const text of ["first placeholder passage", "PDF p. 4", "second placeholder passage", '§ "Placeholder section"', "Note: Check against the original page."]) {
      expect(list).toHaveTextContent(text);
    }
  });
});

describe("Arabic-script runs in a verbatim quote (DESIGN.md 5.1)", () => {
  it("sets each run right-to-left with the declared language and keeps the text unchanged", async () => {
    const user = userEvent.setup();
    const quote = "The word Ajrak ( Sindhi : اجرڪ ) derives from the Persian word ajar ( Persian : اجر )";
    render(<CitationNote citation={{ ...citation, quote }} conceptId={CONCEPT} claimIndex={0} />);
    await user.click(screen.getByRole("button"));
    const block = document.querySelector("blockquote")!;
    expect(block.textContent).toBe(`“${quote}”`);
    const spans = Array.from(block.querySelectorAll("span[dir=rtl]")).map((s) => [s.getAttribute("lang"), s.textContent]);
    expect(spans).toEqual([
      ["sd", "اجرڪ"],
      ["fa", "اجر"],
    ]);
  });
});
