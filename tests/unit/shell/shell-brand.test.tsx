import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { chartFigureLabel, claimNumber, countOf, figureLabel, plateLabel, tableLabel } from "@/components/brand/numbering";
import { OutlineDiagram } from "@/components/brand/outline-diagram";
import { TraditionName } from "@/components/knowledge/tradition-marker";
import { PageHeader } from "@/components/shell/page-header";
import { StudyShell } from "@/components/shell/study-shell";

vi.mock("@/server/auth/actions", () => ({ endPublicDemo: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/about", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("StudyShell", () => {
  it("is a study root with no outbound link and a Study label", () => {
    const { container } = render(
      <StudyShell>
        <p>Body</p>
      </StudyShell>,
    );
    const root = container.firstElementChild!;
    expect(root).toHaveClass("study-root");
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByText("Study")).toHaveClass("t-label");
    expect(screen.getByText(/ask the study facilitator/)).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("title-cases the h1 and draws no band and no rule (DR-022)", () => {
    const header = renderToStaticMarkup(<PageHeader title="questions before learning" />);
    expect(header).toContain("Questions Before Learning");
    expect(header).not.toContain("ie-band");
    expect(header).not.toContain("data-rule");
  });

});

describe("brand components", () => {
  it("names a tradition in words only, with no marker on any key (P17)", () => {
    const keys = ["ajrakh", "bagh", "bagru", "dabu", "machilipatnam-kalamkari", "sanganeri"];
    const markup = keys.map((k) => renderToStaticMarkup(<TraditionName traditionKey={k}>Name</TraditionName>).replace(/ data-tradition-key="[^"]*"/, ""));
    expect(new Set(markup).size).toBe(1);
    expect(markup[0]).toBe('<span data-slot="tradition-name" class="inline">Name</span>');
  });

  it("numbering labels", () => {
    expect(claimNumber(0)).toBe("1");
    expect(figureLabel(2)).toBe("Fig. 2");
    expect(plateLabel(1)).toBe("Plate 1");
    expect(chartFigureLabel(3)).toBe("Figure 3");
    expect(tableLabel(1)).toBe("Table 1");
    expect(countOf("Question", 4, 20)).toBe("Question 4 of 20");
    expect(() => figureLabel(0)).toThrow(RangeError);
  });

  it("line diagrams draw the fill layer under the outline layer, static (no draw-on motion)", () => {
    const { container } = render(
      <OutlineDiagram
        width={200}
        height={100}
        nodes={[
          { id: "a", x: 10, y: 10, width: 60, height: 40, fill: "hover", label: "Page" },
          { id: "b", x: 130, y: 10, width: 60, height: 40, fill: "accent", label: ["Floor", "plan"] },
        ]}
        edges={[{ id: "e", d: "M70 30 H130", arrow: true, draw: true }]}
      />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    const layers = [...svg.querySelectorAll("g[data-layer]")].map((g) => g.getAttribute("data-layer"));
    expect(layers).toEqual(["fill", "outline", "text"]);
    const fills = svg.querySelectorAll('g[data-layer="fill"] rect');
    const outlines = svg.querySelectorAll('g[data-layer="outline"] rect');
    expect(fills).toHaveLength(2);
    for (const [i, f] of [...fills].entries()) {
      for (const attr of ["x", "y", "width", "height"]) expect(outlines[i]!.getAttribute(attr)).toBe(f.getAttribute(attr));
    }
    expect(svg.querySelector("path[data-draw]")).toBeNull();
    expect(svg.querySelectorAll('g[data-layer="outline"] path')).toHaveLength(1);
    expect(container.innerHTML).not.toMatch(/madder/);
  });
});
