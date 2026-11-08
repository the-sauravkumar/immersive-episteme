import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { FigureBalanceMatrix, rampStep, UNBALANCED_TEXT } from "@/components/cms/media/figure-balance";
import { ProofFrame } from "@/components/cms/proof-frame";
import { ClaimList, KnowledgeSheet } from "@/components/knowledge";
import type { FigureBalance } from "@/server/research/parity/engine";

import { fixtureView } from "../knowledge/harness";

vi.mock("next/navigation", () => ({ usePathname: () => "/cms/concepts/x", useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
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

describe("ProofFrame: the record preview", () => {
  it("shows the sheet once, offers no 3D panel and does not take focus", () => {
    const before = document.activeElement;
    const { container } = render(<ProofFrame sheet={sheet()} />);
    expect(document.activeElement).toBe(before);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/3D panel/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Record Preview" })).toBeInTheDocument();
    expect(within(container.querySelector<HTMLElement>("[data-slot=proof-viewport]")!).getByRole("heading", { level: 1 })).toHaveTextContent(new RegExp(c.title.split(" ")[0]!, "i"));
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
  layers: [],
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
    expect(within(table).getByText("Totals differ")).toBeInTheDocument();
  });

  it("maps counts onto the six-step sequential ramp", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(rampStep)).toEqual([1, 2, 3, 4, 5, 6, 6]);
  });
});
