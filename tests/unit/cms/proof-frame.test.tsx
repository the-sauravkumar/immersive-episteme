/**
 * WP6 (DESIGN.md 11.10, 12.3 rule 9):
 *  - the concept editor's Proof renders the real KnowledgeSheet, and its "Preview as: 2D column |
 *    3D panel" switch changes only the container: the sheet's DOM is identical in both placements;
 *    the proof never moves focus into itself (autoFocusTitle off);
 *  - the Figure Balance matrix shows the engine's counts with the value printed in every cell, in
 *    canonical tradition order, and an unbalanced row says so in words with an icon.
 * Fixtures are the placeholder knowledge-graph fixtures (no craft facts).
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { FigureBalanceMatrix, rampStep, UNBALANCED_TEXT } from "@/components/cms/media/figure-balance";
import { ProofFrame } from "@/components/cms/proof-frame";
import { ClaimList, KnowledgeSheet } from "@/components/knowledge";
import type { FigureBalance } from "@/server/research/parity/engine";

import { fixtureView } from "../learning-2d/harness";

vi.mock("next/navigation", () => ({ usePathname: () => "/cms/concepts/x", useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
// The figure-balance module also exports a server loader; its server imports are not exercised here.
vi.mock("@/server/content/review-snapshot", () => ({ buildReviewSnapshotFromDb: vi.fn() }));
vi.mock("@/server/cms/media/service", () => ({ listIllustrationLinks: vi.fn() }));

const view = fixtureView();
const c = view.getConcept("alpha.process_stage.stage-two")!;

function sheet() {
  return (
    <KnowledgeSheet
      placement="page"
      autoFocusTitle={false}
      concept={{ id: c.id, title: c.title, type: c.type, category: c.category, localTerms: c.localTerms, tradition: c.tradition ? { slug: c.tradition.slug, name: c.tradition.name } : null, verificationState: c.verificationState }}
    >
      <ClaimList conceptId={c.id} claims={c.claims} />
    </KnowledgeSheet>
  );
}

/** Normalises React's generated ids (useId) so two renders can be compared. */
function normalise(html: string): string {
  const ids = new Map<string, string>();
  return html.replace(/(«r[0-9a-z]+»|_r_[0-9a-z]+_|:r[0-9a-z]+:)/g, (m) => {
    if (!ids.has(m)) ids.set(m, `ID${ids.size}`);
    return ids.get(m)!;
  });
}

describe("ProofFrame: one sheet, two placements", () => {
  it("renders the identical sheet DOM in the 2D column and the 3D panel, and changes only the container", async () => {
    const user = userEvent.setup();
    const before = document.activeElement;
    const { container } = render(<ProofFrame sheet={sheet()} />);
    // The proof never takes focus when the editor opens.
    expect(document.activeElement).toBe(before);

    const visible = () => container.querySelector<HTMLElement>("[data-slot=proof-viewport]")!;
    const page = visible();
    expect(page.dataset.placement).toBe("page");
    const pageSheet = normalise(page.innerHTML);

    await user.click(screen.getByRole("radio", { name: "3D panel" }));
    const panel = visible();
    expect(panel.dataset.placement).toBe("panel");
    expect(panel).toHaveAttribute("role", "region");
    expect(panel.className).toContain("overflow-y-auto");
    expect(normalise(panel.innerHTML)).toBe(pageSheet);
    expect(within(panel).getByRole("heading", { level: 1 })).toHaveTextContent(new RegExp(c.title.split(" ")[0]!, "i"));
    expect(document.activeElement).not.toBe(within(panel).getByRole("heading", { level: 1 }));
  });
});

const balance = (counts: [string, number, number, number][]): FigureBalance => ({
  traditionSlugs: ["ajrakh", "machilipatnam-kalamkari", "sanganeri"],
  traditionNames: { ajrakh: "Ajrakh (long name)", "machilipatnam-kalamkari": "Machilipatnam (long name)", sanganeri: "Sanganeri (long name)" },
  rows: counts.map(([id, a, m, s]) => ({
    sectionId: id,
    title: id,
    layer: id === "process" ? "process" : "overview",
    counts: { ajrakh: a, "machilipatnam-kalamkari": m, sanganeri: s },
    balanced: a === m && m === s,
  })),
  shown: [],
  issues: [],
  metrics: { diagrams: 0, photos: 0, photosHeldBack: 0 },
});

describe("FigureBalanceMatrix", () => {
  it("prints every count in canonical order and names an unbalanced row in words", () => {
    render(<FigureBalanceMatrix balance={balance([["context", 1, 1, 1], ["process", 2, 2, 1]])} caption="Figures" />);
    const table = screen.getByRole("table");
    const heads = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads.slice(1, 4)).toEqual(["Ajrakh", "Machilipatnam Kalamkari", "Sanganeri"]);
    const process = within(table).getByRole("rowheader", { name: "process" }).closest("tr")!;
    expect([...process.querySelectorAll("td")].slice(0, 3).map((td) => td.textContent)).toEqual(["2", "2", "1"]);
    expect(process).toHaveAttribute("data-balanced", "false");
    expect(within(process).getByText(UNBALANCED_TEXT)).toBeInTheDocument();
    const context = within(table).getByRole("rowheader", { name: "context" }).closest("tr")!;
    expect(within(context).getByText("Balanced")).toBeInTheDocument();
    // Totals: 3, 3, 2 differ.
    expect(within(table).getByText("Totals differ")).toBeInTheDocument();
  });

  it("maps counts onto the six-step sequential ramp", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(rampStep)).toEqual([1, 2, 3, 4, 5, 6, 6]);
  });
});
