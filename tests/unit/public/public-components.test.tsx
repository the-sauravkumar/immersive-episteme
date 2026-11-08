import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FIGURE_ONE_TALL, FIGURE_ONE_WIDE, FigureOneCountList, FigureOneDiagram } from "@/components/public/figure-one";
import { InstitutionStrip, NO_INSTITUTION } from "@/components/public/institution-strip";
import { TraditionIndex, type TraditionIndexData } from "@/components/public/tradition-plates";

const TRADITIONS: TraditionIndexData[] = [
  { slug: "ajrakh", name: "Ajrakh", shortName: "Ajrakh", region: "Kutch, Gujarat" },
  { slug: "sanganeri", name: "Sanganeri Hand Block Printing", shortName: "Sanganeri", region: "Jaipur, Rajasthan" },
];

describe("TraditionIndex (DR-022)", () => {
  it("lists every tradition as an equal row in the given order, with no image and no marker", () => {
    const { container } = render(<TraditionIndex traditions={TRADITIONS} />);
    const rows = [...container.querySelectorAll("[data-slot=tradition-index] > li")];
    expect(rows.map((r) => r.getAttribute("data-tradition-key"))).toEqual(["ajrakh", "sanganeri"]);
    expect(new Set(rows.map((r) => r.className)).size).toBe(1);
    expect(new Set([...container.querySelectorAll("h3")].map((h) => h.className)).size).toBe(1);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector("[data-slot=tradition-marker]")).toBeNull();
    expect(screen.getByText("Sanganeri Hand Block Printing")).toBeInTheDocument();
  });
});

describe("InstitutionStrip", () => {
  it("renders nothing while every field is null", () => {
    const { container } = render(<InstitutionStrip institution={NO_INSTITUTION} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders only the fields that are set", () => {
    render(<InstitutionStrip institution={{ ...NO_INSTITUTION, affiliation: "An Institute" }} />);
    expect(screen.getByText("An Institute")).toBeInTheDocument();
    expect(screen.queryByText("Ethics approval")).not.toBeInTheDocument();
  });
});

describe("TraditionIndex titles", () => {
  it("use the short display name, then the dataset's full name and the region", () => {
    const { container } = render(
      <TraditionIndex traditions={[{ slug: "bagh", name: "Bagh Print (Hand Block Printing of Bagh, Madhya Pradesh)", shortName: "Bagh", region: "Dhar, Madhya Pradesh" }]} />,
    );
    expect(container.querySelector("h3")?.textContent).toBe("Bagh");
    const texts = [...container.querySelectorAll("li > p")].map((el) => el.textContent);
    expect(texts).toEqual(["Bagh Print (Hand Block Printing of Bagh, Madhya Pradesh)", "Dhar, Madhya Pradesh"]);
  });
});

describe("Figure 1", () => {
  it("shows no numbers in the fallback and the live counts otherwise", () => {
    const { container, unmount } = render(<FigureOneDiagram counts={null} />);
    expect(container.textContent).toContain("Traditions");
    expect(container.textContent).not.toMatch(/\d(Traditions|Concepts|Relations|Sources)/);
    unmount();
    render(<FigureOneCountList counts={{ traditions: 6, concepts: 1234, relationships: 5, sources: 7 }} />);
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });
});

describe("Diagram label size (7.4: Inter 13/600 never rendered below 13 px)", () => {
  it("authors each viewBox no wider than its narrowest rendered box", () => {
    expect(FIGURE_ONE_TALL.width).toBeLessThanOrEqual(324);
    expect(FIGURE_ONE_WIDE.width).toBeLessThanOrEqual(910);
  });

  it("draws one knowledge model and its four counts inside each viewBox, with no branches", () => {
    const { container } = render(<FigureOneDiagram counts={null} />);
    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      const [, , width, height] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
      const rects = [...svg.querySelectorAll("[data-layer=fill] rect")];
      expect(rects).toHaveLength(5);
      for (const r of rects) {
        expect(Number(r.getAttribute("x")) + Number(r.getAttribute("width"))).toBeLessThanOrEqual(width!);
        expect(Number(r.getAttribute("y")) + Number(r.getAttribute("height"))).toBeLessThanOrEqual(height!);
      }
      expect(svg.querySelectorAll("[data-layer=outline] path")).toHaveLength(0);
    }
  });
});
