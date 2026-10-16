/**
 * Plate 1 beside the home title (DR-058): the plan of the compiled demo
 * museum on lg and up, the tokens only, an accessible name counted from the model, the caption in
 * Title Case, and a fallback with the same frame and caption and nothing drawn.
 */
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/public/demo-plan", () => ({ getDemoMuseumPlan: async () => null }));

import { MuseumPlanPlateFrame, PLATE_CAPTION, planAccessibleName } from "@/components/public/museum-plan-plate";
import { PLAN_PLATE, planPlateData } from "@/features/immersive/plan-drawing";
import { buildSceneModel } from "@/features/immersive/scene-model";
import { titleCase } from "@/lib/text/title-case";

import { museumFixture } from "../immersive/fixtures";

const plan = planPlateData(buildSceneModel(museumFixture().manifest.manifest));

describe("Plate 1 (home)", () => {
  it("draws the rooms, gaps, exhibits, routes, numbers and the two labels, hidden below lg", () => {
    const { container } = render(<MuseumPlanPlateFrame plan={plan} />);
    const figure = container.querySelector("figure[data-slot=museum-plan-plate]")!;
    expect(figure.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(figure.className).toContain("lg:grid");
    expect(figure.className).toContain("lg:col-start-8");
    expect(figure.className).toContain("lg:col-span-5");
    const svg = figure.querySelector("svg[role=img]")!;
    expect(svg.getAttribute("aria-label")).toBe("Plan of the demo museum: an entrance lobby, three wings of seven numbered rooms each, a comparison hall and a shared commons");
    expect(svg.getAttribute("focusable")).toBeNull();
    expect(svg.querySelectorAll("rect")).toHaveLength(plan.rooms.length);
    expect(svg.querySelectorAll("line")).toHaveLength(plan.gaps.length + plan.labels.length);
    expect(svg.querySelectorAll("polyline")).toHaveLength(3);
    const marks = svg.querySelector("[data-slot=museum-plan-plate-exhibits]")!.getAttribute("d")!;
    expect(marks.match(/M/g)).toHaveLength(plan.exhibits.length);
    const texts = [...svg.querySelectorAll("text")].map((t) => t.textContent);
    expect(texts.filter((t) => /^\d+$/.test(t ?? "")).length).toBe(plan.numbers.length);
    expect(texts).toContain("Entrance");
    expect(texts).toContain("Comparison Hall");
    // No tradition is named on the plate.
    expect(svg.textContent).not.toMatch(/ajrakh|sanganeri|kalamkari/i);
  });

  it("uses the theme tokens only (no literal colours) and non-scaling strokes", () => {
    const { container } = render(<MuseumPlanPlateFrame plan={plan} />);
    const html = container.innerHTML;
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(html).not.toMatch(/rgb\(/i);
    for (const token of ["var(--ink)", "var(--ink-2)", "var(--indigo)", "var(--ground)"]) expect(html).toContain(token);
    for (const el of container.querySelectorAll("rect, line, polyline")) expect((el as SVGElement).style.vectorEffect).toBe("non-scaling-stroke");
    expect(PLAN_PLATE.outlinePx).toBe(1.5);
    expect(PLAN_PLATE.routePx).toBe(2);
    expect(PLAN_PLATE.exhibitPx).toBe(3);
  });

  it("captions it as Plate 1 in Title Case", () => {
    const { container } = render(<MuseumPlanPlateFrame plan={plan} />);
    const caption = container.querySelector("figcaption")!;
    expect(caption.textContent).toBe("Plate 1. The Demo Museum's Plan, Compiled From the Same Knowledge Model: Each Numbered Room Is a Section of the 2D Index.");
    expect(titleCase(PLATE_CAPTION)).toBe("The Demo Museum's Plan, Compiled From the Same Knowledge Model: Each Numbered Room Is a Section of the 2D Index.");
  });

  it("falls back to the same frame and caption with nothing drawn", () => {
    const live = render(<MuseumPlanPlateFrame plan={plan} />).container;
    const { container } = render(<MuseumPlanPlateFrame plan={null} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("figcaption")!.textContent).toBe(live.querySelector("figcaption")!.textContent);
    expect(container.querySelector("figure")!.className).toBe(live.querySelector("figure")!.className);
    // The drawing never sizes its row: the title block decides the height (h-0, min-h-full).
    const row = container.querySelector("figure > div")!;
    expect(row.className).toContain("h-0");
    expect(row.className).toContain("min-h-full");
  });

  it("counts the accessible name from the model", () => {
    expect(planAccessibleName({ wings: 2, roomsPerWing: null, entrance: true, hall: false, commons: false })).toBe("Plan of the demo museum: an entrance lobby and two wings of numbered rooms");
    expect(planAccessibleName({ wings: 0, roomsPerWing: null, entrance: false, hall: false, commons: false })).toBe("Plan of the demo museum");
  });
});
