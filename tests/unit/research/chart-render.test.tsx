/**
 * The research charts as rendered by ECharts (SVG renderer) in jsdom (DESIGN.md 10; WP5 review):
 *  - the accessible name of every plot is the authored label ("Figure n. Title: values"), never
 *    ECharts' generated aria description, which used to overwrite it;
 *  - dot-and-interval plots print a direct label under each group ("2D (n = 3)", R-A13), 2D left;
 *  - value axes print each tick once, with the decimals of the tick interval and no "-0", and an
 *    axis pinned at zero starts at 0 even when an interval reaches below it.
 */
import { render, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CountBars, DotIntervalChart, groupLabel, SlopeChart } from "@/components/analytics/charts";
import { fixed, niceScale } from "@/components/analytics/encoding";

const restore: (() => void)[] = [];
beforeAll(() => {
  // jsdom has no layout: give every element a size so ECharts lays the chart out.
  for (const [prop, value] of [
    ["clientWidth", 640],
    ["clientHeight", 320],
  ] as const) {
    const before = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
    restore.push(() => (before ? Object.defineProperty(HTMLElement.prototype, prop, before) : undefined));
  }
  // ...and a text measurer (jsdom has no canvas): about 7 px per character at 12 px.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function () {
    return { font: "", measureText: (s: string) => ({ width: s.length * 7 }) };
  } as unknown as typeof getContext;
  restore.push(() => (HTMLCanvasElement.prototype.getContext = getContext));
  const g = globalThis as { ResizeObserver?: unknown };
  if (!g.ResizeObserver) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    restore.push(() => delete g.ResizeObserver);
  }
});
afterAll(() => restore.forEach((r) => r()));

const svgTexts = (el: Element) => [...el.querySelectorAll("svg text")].map((t) => t.textContent ?? "").filter(Boolean);

async function plot(container: HTMLElement, index = 0): Promise<HTMLElement> {
  const img = await waitFor(
    () => {
      const el = container.querySelectorAll<HTMLElement>("[role=img]")[index];
      if (!el?.querySelector("svg text")) throw new Error("chart not drawn yet");
      return el;
    },
    { timeout: 20_000 },
  );
  return img;
}

describe("chart accessible names", () => {
  it("keep the authored label, with the figure number, after ECharts has drawn", async () => {
    const { container } = render(
      <CountBars
        number={1}
        title="Allocation by condition"
        howToRead="Bars count allocated participants."
        categories={["Conventional 2D", "Immersive 3D"]}
        series={[{ name: "Allocated", kind: "other", kinds: ["2d", "3d"], values: [0, 7] }]}
        unit="participants"
      />,
    );
    const img = await plot(container);
    expect(img.getAttribute("aria-label")).toBe("Figure 1. Allocation by Condition: Conventional 2D, 0 participants; Immersive 3D, 7 participants.");
    expect(img.getAttribute("aria-label")).not.toMatch(/This is a chart/);
    expect(container.innerHTML).not.toMatch(/This is a chart/);
  }, 30_000);

  it("name every panel of a dot-and-interval figure with its figure, panel and values", async () => {
    const { container } = render(
      <DotIntervalChart
        number={4}
        title="Active minutes per session"
        howToRead="Points show sessions."
        panels={[
          {
            title: "Navigation",
            groups: [
              { name: "Immersive 3D", kind: "3d", values: [1, 2], center: 1.5, low: -4.85, high: 7.85 },
              { name: "Conventional 2D", kind: "2d", values: [1, 2, 3], center: 2, low: -0.48, high: 4.48 },
            ],
          },
        ]}
        digits={1}
        zero
      />,
    );
    const img = await plot(container);
    expect(img.getAttribute("aria-label")).toBe(
      "Figure 4. Active Minutes per Session, Navigation: Conventional 2D, n = 3: mean 2.0, 95% CI -0.5 to 4.5; Immersive 3D, n = 2: mean 1.5, 95% CI -4.8 to 7.8.",
    );
  }, 30_000);
});

describe("dot-and-interval direct labels and axis", () => {
  it("print each group's key and n under it, 2D first, and tidy ticks from zero", async () => {
    const { container } = render(
      <DotIntervalChart
        title="Active minutes"
        howToRead="Points show sessions."
        panels={[
          {
            title: "",
            groups: [
              { name: "Demo: Immersive 3D", kind: "3d", values: [0.01, 0.02], center: 0.015, low: -0.05, high: 0.08 },
              { name: "Demo: Conventional 2D", kind: "2d", values: [0, 0.1, 0.02], center: 0.04, low: -0.1, high: 0.1 },
            ],
          },
        ]}
        digits={1}
        zero
      />,
    );
    const texts = svgTexts(await plot(container));
    const i2 = texts.indexOf("2D (n = 3)");
    const i3 = texts.indexOf("3D (n = 2)");
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i3).toBeGreaterThan(i2);
    const ticks = texts.filter((t) => /^-?\d+(\.\d+)?$/.test(t));
    expect(ticks[0]).toBe("0.00");
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks.some((t) => t.startsWith("-"))).toBe(false);
  }, 30_000);

  it("label any other group by its name", () => {
    expect(groupLabel({ name: "Not yet allocated", kind: "other", values: [1] })).toBe("Not yet allocated (n = 1)");
  });
});

describe("slope chart axis", () => {
  it("prints distinct ticks with the interval's decimals", async () => {
    const { container } = render(
      <SlopeChart
        title="Pre/post score"
        howToRead="Thin lines are participants."
        lines={[
          { id: "P-1", condition: "2D", kind: "2d", pre: 0.1, post: 0.4 },
          { id: "P-2", condition: "3D", kind: "3d", pre: 0.2, post: 0.35 },
        ]}
      />,
    );
    const ticks = svgTexts(await plot(container)).filter((t) => /^-?\d+(\.\d+)?$/.test(t));
    expect(ticks.length).toBeGreaterThan(2);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks.every((t) => t.split(".")[1]?.length === 1)).toBe(true);
  }, 30_000);
});

describe("niceScale and fixed", () => {
  it("never print a negative zero", () => {
    expect(fixed(-0.04, 1)).toBe("0.0");
    expect(fixed(-0, 2)).toBe("0.00");
    expect(fixed(-0.06, 1)).toBe("-0.1");
    expect(fixed(null, 2)).toBe("–");
  });

  it("derive decimals from the interval and pin at zero on request", () => {
    expect(niceScale([-0.1, 0.12], true)).toEqual({ min: 0, max: 0.15, interval: 0.05, decimals: 2 });
    expect(niceScale([0.1, 0.9])).toEqual({ min: 0, max: 1, interval: 0.2, decimals: 1 });
    expect(niceScale([3, 47], true)).toEqual({ min: 0, max: 50, interval: 10, decimals: 0 });
    expect(niceScale([-0.3, 0.25])).toEqual({ min: -0.4, max: 0.4, interval: 0.2, decimals: 1 });
    expect(niceScale([2, 2])).toEqual({ min: 1, max: 3, interval: 0.5, decimals: 1 });
    expect(niceScale([null, Number.NaN])).toBeNull();
  });

  it("cover every value with ticks that print distinctly", () => {
    for (const [lo, hi, zero] of [
      [0, 0.0333, true],
      [-2.5, 17.2, false],
      [0.001, 0.0042, false],
      [120, 3600, true],
    ] as const) {
      const s = niceScale([lo, hi], zero)!;
      expect(s.min).toBeLessThanOrEqual(zero ? 0 : lo);
      expect(s.max).toBeGreaterThanOrEqual(hi);
      const ticks: string[] = [];
      for (let v = s.min; v <= s.max + s.interval / 2; v += s.interval) ticks.push(fixed(v, s.decimals));
      expect(new Set(ticks).size).toBe(ticks.length);
    }
  });
});
