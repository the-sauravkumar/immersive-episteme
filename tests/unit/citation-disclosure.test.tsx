/**
 * CitedClaim / CitationRecord / ReferenceList (DESIGN.md 9.9; DR-022 Addendum A): a quiet numbered
 * marker [n] after the claim, collapsed by default, a 44 x 44 px box that keeps the 30 px reading
 * line, an accessible name with the number and the short label; the record expands IN PLACE under
 * the claim (locator, labelled verbatim evidence, "Open the source") and closes again on the second
 * activation or Escape (focus back to the marker); the reference list gives each source once with
 * its full details; citation telemetry is unchanged.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CitedClaim, ReferenceList, referenceDetail, referenceHead } from "@/components/citations";
import { referenceNumbers, referencesOf, sourceDisplayLabel, type Citation } from "@/features/knowledge/read/view";
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
  accessedOn: "2026-01-02",
  reliability: "high",
  verificationState: "under_review",
  locator: "p. 12",
  quote: "a placeholder quote",
  passages: [],
};
const other: Citation = { ...citation, id: "0190f0a0-0000-7000-8000-0000000000cc", author: null, publisher: "Other Press", title: "Other title", year: null, locator: "§ 2", url: null, reliability: null, accessedOn: null };

const one = (c: Citation = citation, number = 1, claimIndex = 0) => <CitedClaim text="A placeholder statement." citations={[{ citation: c, number }]} conceptId={CONCEPT} claimIndex={claimIndex} />;

describe("CitedClaim: the numbered marker", () => {
  it("ends the claim with a quiet [n] marker, collapsed by default, with the number and short label in its name", () => {
    render(one());
    const claim = document.querySelector("[data-slot=claim]")!;
    expect(claim.tagName).toBe("P");
    expect(claim.className).toContain("text-reading");
    expect(claim.querySelector("[data-slot=claim-text]")!.textContent).toBe("A placeholder statement.");
    const marker = screen.getByRole("button", { name: /^Source 1: Placeholder Author \(2001\), p\.\s12$/ });
    expect(claim.contains(marker)).toBe(true);
    expect(marker).toHaveAttribute("aria-expanded", "false");
    // The visible marker is "[1]"; its name carries the number (label in name).
    expect(marker.textContent).toBe("[1]");
    // 44 x 44 px box; negative block margins keep the 30 px reading line box.
    expect(marker.className).toMatch(/\bh-11\b/);
    expect(marker.className).toMatch(/\bmin-w-11\b/);
    expect(marker.className).toContain("-my-[0.4375rem]");
    // Collapsed: no record text, never the uuid.
    expect(screen.queryByText("a placeholder quote", { exact: false })).toBeNull();
    expect(document.body.textContent).not.toContain(citation.id);
  });

  it("expands the record in place under the claim and closes it again on the second activation", async () => {
    const user = userEvent.setup();
    render(one(citation, 3, 2));
    const marker = screen.getByRole("button", { name: /^Source 3:/ });
    await user.click(marker);
    expect(marker).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", { name: /^Source 3: Placeholder Author \(2001\), p\.\s12$/ });
    // In place: the record directly follows the claim paragraph, not a jump to a list.
    expect(document.querySelector("[data-slot=claim]")!.nextElementSibling).toBe(region);
    expect(marker.getAttribute("aria-controls")).toBe(region.id);
    expect(region).toHaveTextContent("Source 3");
    expect(region).toHaveTextContent("p. 12");
    expect(region).toHaveTextContent("Verbatim from the source");
    const quote = region.querySelector("blockquote")!;
    expect(quote.className).toContain("text-quote");
    expect(quote.className).toContain("bg-sunk");
    expect(quote.className).not.toMatch(/border-l/);
    expect(quote.textContent).toBe("“a placeholder quote”");
    // Lean: the full record table moved to the reference list.
    expect(region.querySelector("dl")).toBeNull();
    expect(region).not.toHaveTextContent("Placeholder Press");
    expect(within(region).getByRole("link", { name: /Open the source/ }).className).toContain("min-h-11");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(marker);
    expect(marker).toHaveAttribute("aria-expanded", "false");
    expect(region).not.toBeVisible();
  });

  it("closes on Escape inside the record and returns focus to its marker", async () => {
    const user = userEvent.setup();
    render(one());
    await user.tab();
    await user.keyboard("{Enter}");
    const marker = screen.getByRole("button");
    expect(marker).toHaveAttribute("aria-expanded", "true");
    await user.tab();
    expect(screen.getByRole("link", { name: /Open the source/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(marker).toHaveAttribute("aria-expanded", "false");
    expect(marker).toHaveFocus();
    await user.keyboard(" ");
    expect(marker).toHaveAttribute("aria-expanded", "true");
  });

  it("gives a claim with several citations one marker and one record each", async () => {
    const user = userEvent.setup();
    render(
      <CitedClaim
        text="A placeholder statement."
        citations={[
          { citation, number: 1 },
          { citation: other, number: 2 },
        ]}
        conceptId={CONCEPT}
        claimIndex={0}
      />,
    );
    const markers = screen.getAllByRole("button");
    expect(markers.map((m) => m.getAttribute("data-citation-number"))).toEqual(["1", "2"]);
    await user.click(markers[1]!);
    expect(markers[0]).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("region", { name: /^Source 2:/ })).toHaveTextContent(/Other Press, §\s2/);
  });

  it("records citation_opened and citation_closed with concept, source and claim index", async () => {
    const user = userEvent.setup();
    const outbox = new MemoryOutbox();
    render(
      <TelemetryProvider
        config={{ sessionId: SESSION, contentVersion: "review-test", appBuild: "test", mode: "study", storage: outbox, lifecycle: false, fetchImpl: (() => new Promise(() => undefined)) as typeof fetch, sendBeacon: null }}
      >
        {one(citation, 1, 1)}
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
    render(one(withPassages));
    await user.click(screen.getByRole("button"));
    const list = screen.getByRole("list", { name: "Supporting passages" });
    for (const text of ["first placeholder passage", "PDF p. 4", "second placeholder passage", '§ "Placeholder section"', "Note: Check against the original page."]) {
      expect(list).toHaveTextContent(text);
    }
  });
});

describe("referencesOf and ReferenceList", () => {
  it("numbers each source once, in order of first citation", () => {
    const claims = [{ evidence: [other] }, { evidence: [citation, other] }, { evidence: [] }, { evidence: [citation] }];
    expect(referencesOf(claims).map((c) => c.id)).toEqual([other.id, citation.id]);
    expect([...referenceNumbers(claims)]).toEqual([
      [other.id, 1],
      [citation.id, 2],
    ]);
  });

  it("gives each source's full details once under its number, with no links and no middle dots", () => {
    render(<ReferenceList sources={[citation, other]} headingId="refs" />);
    const section = screen.getByRole("region", { name: "References" });
    expect(within(section).getByRole("heading", { level: 2, name: "References" })).toBeInTheDocument();
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("[1]");
    expect(items[0]).toHaveTextContent("Placeholder Author (2001). Placeholder title. Placeholder Press.");
    expect(items[0]).toHaveTextContent("Kind of source: historical documentation. Reliability: high. Accessed 2026-01-02.");
    expect(items[1]).toHaveTextContent("[2]");
    expect(items[1]).toHaveTextContent("Other Press. Other title.");
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(section.textContent).not.toContain("·");
  });

  it("formats a reference without author, year or reliability", () => {
    expect(referenceHead(other)).toBe("Other Press. Other title.");
    expect(referenceDetail(other)).toBe("Kind of source: historical documentation.");
  });

  it("renders nothing for a view without citations", () => {
    const { container } = render(<ReferenceList sources={[]} headingId="refs" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("sourceDisplayLabel", () => {
  it("prefers author, then publisher, then a shortened title", () => {
    expect(sourceDisplayLabel({ author: "A. Author", publisher: "P", year: 1999, title: "T" })).toBe("A. Author 1999");
    expect(sourceDisplayLabel({ author: null, publisher: "Some Press", year: null, title: "T" })).toBe("Some Press");
    expect(sourceDisplayLabel({ author: " ", publisher: null, year: 2020, title: "A very long title ".repeat(10) }).endsWith("… (2020)")).toBe(true);
  });
});

describe("Arabic-script runs in a verbatim quote (DESIGN.md 5.1)", () => {
  it("sets each run right-to-left with the declared language and keeps the text unchanged", async () => {
    const user = userEvent.setup();
    const quote = "The word Ajrak ( Sindhi : اجرڪ ) derives from the Persian word ajar ( Persian : اجر )";
    render(one({ ...citation, quote }));
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
