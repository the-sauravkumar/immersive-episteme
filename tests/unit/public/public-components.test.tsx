/**
 * Public components (DESIGN.md 11.1-11.3, 13): the all-or-none photograph rule, the hidden
 * institution strip, the equal-weight condition schematics and Figure 1's number-free fallback.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConditionSchematic, pageMiniature, planMiniature, SCHEMATIC_BOX } from "@/components/public/condition-schematic";
import { FIGURE_ONE_TALL, FIGURE_ONE_WIDE, FigureOneCountList, FigureOneDiagram } from "@/components/public/figure-one";
import { InstitutionStrip, NO_INSTITUTION } from "@/components/public/institution-strip";
import { photosForAll, TraditionPlates, type TraditionPlateData } from "@/components/public/tradition-plates";

const PHOTO = { src: "/figures/x", width: 768, height: 512, alt: "A textile", credit: "Credit" };
const TRADITIONS: TraditionPlateData[] = [
  { slug: "ajrakh", name: "Ajrakh", shortName: "Ajrakh", region: "Kutch, Gujarat" },
  { slug: "sanganeri", name: "Sanganeri", shortName: "Sanganeri", region: "Jaipur, Rajasthan" },
];

describe("TraditionPlates", () => {
  it("shows typographic plates for all when any tradition lacks a photograph", () => {
    const mixed = [{ ...TRADITIONS[0]!, photo: PHOTO }, TRADITIONS[1]!];
    expect(photosForAll(mixed)).toBe(false);
    const { container } = render(<TraditionPlates traditions={mixed} />);
    expect(container.querySelector("[data-slot=tradition-plates]")).toHaveAttribute("data-plates", "typographic");
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("shows photographs only when every tradition has one, each with its credit", () => {
    const all = TRADITIONS.map((t) => ({ ...t, photo: PHOTO }));
    const { container } = render(<TraditionPlates traditions={all} />);
    expect(container.querySelector("[data-slot=tradition-plates]")).toHaveAttribute("data-plates", "photo");
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(screen.getAllByText("Credit")).toHaveLength(2);
  });

  it("gives every tradition the identical marker and heading markup", () => {
    const { container } = render(<TraditionPlates traditions={TRADITIONS} />);
    const markers = [...container.querySelectorAll("[data-slot=tradition-marker]")].map((m) => m.className);
    expect(new Set(markers).size).toBe(1);
    const headings = [...container.querySelectorAll("h3")].map((h) => h.className);
    expect(new Set(headings).size).toBe(1);
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

describe("Condition schematics", () => {
  it("draw one indigo accent each, in boxes of the same size", () => {
    for (const condition of ["2d", "immersive"] as const) {
      const { container, unmount } = render(<ConditionSchematic condition={condition} />);
      const fills = [...container.querySelectorAll("[data-layer=fill] rect")].map((r) => r.getAttribute("fill"));
      expect(fills.filter((f) => f === "var(--indigo)")).toHaveLength(1);
      expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 288 180");
      unmount();
    }
  });

  it("give both miniatures the same indigo area in the same box (11.3: neither condition looks richer)", () => {
    const indigoArea = (nodes: ReturnType<typeof pageMiniature>) =>
      nodes.filter((n) => n.fill === "indigo").reduce((sum, n) => sum + n.width * n.height, 0);
    // The Explore box, and Figure 1's wide and narrow boxes.
    for (const [w, h] of [
      [216, 144],
      [232, 140],
      [144, 112],
    ] as const) {
      const page = indigoArea(pageMiniature("p", 0, 0, w, h));
      const plan = indigoArea(planMiniature("q", 0, 0, w, h));
      expect(Math.abs(page - plan) / page, `${w} x ${h}`).toBeLessThan(0.05);
    }
  });
});

describe("TraditionPlates titles", () => {
  it("use the short display name, with the dataset's full name after the region", () => {
    const { container } = render(
      <TraditionPlates traditions={[{ slug: "bagh", name: "Bagh Print (Hand Block Printing of Bagh, Madhya Pradesh)", shortName: "Bagh", region: "Dhar, Madhya Pradesh" }]} />,
    );
    expect(container.querySelector("h3")?.textContent).toBe("Bagh");
    const texts = [...container.querySelectorAll("li > div:last-child > p")].map((el) => el.textContent);
    expect(texts.slice(-2)).toEqual(["Dhar, Madhya Pradesh", "Bagh Print (Hand Block Printing of Bagh, Madhya Pradesh)"]);
  });
});

describe("Figure 1", () => {
  it("shows no numbers in the fallback and the live counts otherwise", () => {
    const { container, unmount } = render(<FigureOneDiagram counts={null} />);
    // The claim numbers of the page miniature are digits; the counts are not drawn.
    expect(container.textContent).toContain("Traditions");
    expect(container.textContent).not.toMatch(/\d(Traditions|Concepts|Relations|Sources)/);
    unmount();
    render(<FigureOneCountList counts={{ traditions: 6, concepts: 1234, relationships: 5, sources: 7 }} />);
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });
});

describe("Diagram label size (7.4: Inter 13/600 never rendered below 13 px)", () => {
  // The narrowest box each geometry is shown in, measured in the browser: Figure 1 tall at 390 px
  // (324 px), Figure 1 wide from 1024 px (910 px), the Explore schematic at 768 px (296 px).
  it("authors each viewBox no wider than its narrowest rendered box", () => {
    expect(FIGURE_ONE_TALL.width).toBeLessThanOrEqual(324);
    expect(FIGURE_ONE_WIDE.width).toBeLessThanOrEqual(910);
    expect(SCHEMATIC_BOX.width).toBeLessThanOrEqual(296);
  });

  it("starts both branches of Figure 1 at the bracket that spans the whole cluster", () => {
    const { container } = render(<FigureOneDiagram counts={null} />);
    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs).toHaveLength(2);
    svgs.forEach((svg, i) => {
      const paths = [...svg.querySelectorAll("[data-layer=outline] path")].map((p) => p.getAttribute("d") ?? "");
      const nums = (paths[0] ?? "").match(/-?\d+/g)?.map(Number) ?? [];
      const starts = paths.slice(1).map((d) => d.split(" ").slice(0, 2).join(" "));
      expect(new Set(starts).size, "one trunk").toBe(1);
      const [x, y] = (starts[0] ?? "").slice(1).split(" ").map(Number);
      // The trunk leaves from the middle of the bracket's spine: wide "M336 80 H344 V320 H336",
      // tall "M8 264 V272 H312 V264".
      const [a = 0, b = 0, c = 0, d = 0] = nums;
      if (i === 0) expect([x, y]).toEqual([c, (b + d) / 2]);
      else expect([x, y]).toEqual([(a + d) / 2, c]);
    });
  });
});
