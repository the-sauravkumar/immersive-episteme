/**
 * Research charts take every colour from the CSS tokens (DESIGN.md 10 "Single palette source";
 * 18 WP5 acceptance: "Charts render in light, dark and HC with colours equal to the CSS tokens").
 *
 * `readVizTheme` is the function `use-echart.ts` runs over getComputedStyle(document.documentElement)
 * at mount and on every class change of <html>. Here it is fed the custom properties exactly as
 * the cascade resolves them on <html> in each of the four themes (root < dark < a11y-contrast <
 * dark.a11y-contrast, the order tests/unit/contrast.test.ts uses), parsed from globals.css, so
 * the chart theme cannot drift from the tokens. Source guards keep the deleted hard-coded palette
 * out and animation off.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { tableCsv } from "@/components/analytics/charts";
import { readVizTheme, VIZ_TOKENS } from "@/components/analytics/use-echart";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
const css = read("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match?.[1]) throw new Error(`Selector ${selector} not found in globals.css`);
  const out: Record<string, string> = {};
  for (const d of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (d[1] && d[2]) out[d[1]] = d[2].trim();
  return out;
}

const root = block(":root");
const dark = block(".dark");
const hc = block(".a11y-contrast");
const hcDark = block(".dark.a11y-contrast");
const THEMES = {
  light: root,
  dark: { ...root, ...dark },
  "hc-light": { ...root, ...hc },
  "hc-dark": { ...root, ...dark, ...hc, ...hcDark },
} as const;

/** What getPropertyValue returns for a custom property: its value with var() references resolved. */
function computed(vars: Record<string, string>) {
  const resolve = (name: string, depth = 0): string => {
    const raw = vars[name];
    if (raw === undefined) return "";
    const ref = /^var\((--[\w-]+)\)$/.exec(raw);
    return ref?.[1] && depth < 10 ? resolve(ref[1], depth + 1) : raw;
  };
  // getPropertyValue returns the value with its leading space in some engines; readVizTheme trims.
  return (name: string) => ` ${resolve(name)}`;
}

const lc = (s: string) => s.toLowerCase();

describe("chart theme equals the CSS tokens in every theme", () => {
  for (const [theme, vars] of Object.entries(THEMES)) {
    it(`${theme}: every VIZ colour is the token's computed value`, () => {
      const get = computed(vars);
      const t = readVizTheme(get, "Inter");
      const expectToken = (value: string, token: string) => {
        expect(value, token).not.toBe("");
        expect(lc(value), token).toBe(lc(get(token).trim()));
      };
      expectToken(t.series2d, VIZ_TOKENS.series2d);
      expectToken(t.series3d, VIZ_TOKENS.series3d);
      expectToken(t.ink, VIZ_TOKENS.ink);
      expectToken(t.ink2, VIZ_TOKENS.ink2);
      expectToken(t.ink3, VIZ_TOKENS.ink3);
      expectToken(t.grid, VIZ_TOKENS.grid);
      expectToken(t.rule, VIZ_TOKENS.rule);
      expectToken(t.surface, VIZ_TOKENS.surface);
      expectToken(t.sunk, VIZ_TOKENS.sunk);
      expectToken(t.onIndigo, VIZ_TOKENS.onIndigo);
      expect(t.ramp).toHaveLength(6);
      t.ramp.forEach((c, i) => expectToken(c, VIZ_TOKENS.ramp[i]!));
      // Cell labels: --ink on steps 1-3, --on-indigo on steps 4-6 (DESIGN.md 4.3).
      expect(t.rampLabel).toEqual([t.ink, t.ink, t.ink, t.onIndigo, t.onIndigo, t.onIndigo]);
      expect(t.fontFamily).toBe("Inter");
    });
  }

  it("light and dark series are the DESIGN.md 4.2 values (2D cool, 3D warm)", () => {
    const light = readVizTheme(computed(THEMES.light));
    const darkT = readVizTheme(computed(THEMES.dark));
    expect([lc(light.series2d), lc(light.series3d)]).toEqual(["#3a5da0", "#8e4d16"]);
    expect([lc(darkT.series2d), lc(darkT.series3d)]).toEqual(["#8faee8", "#e0a06a"]);
    expect(light.ramp.map(lc)).toEqual(["#e4e3e6", "#b9c3d6", "#8a9dc0", "#4f6a99", "#36548a", "#1b3360"]);
    expect(darkT.ramp.map(lc)).toEqual(["#2c2b33", "#33405a", "#465c86", "#6582b4", "#90aadb", "#c3d3f1"]);
  });

  it("high contrast changes what charts read (ink and surfaces follow the HC block)", () => {
    const hcT = readVizTheme(computed(THEMES["hc-light"]));
    const hcDarkT = readVizTheme(computed(THEMES["hc-dark"]));
    expect(lc(hcT.ink)).toBe("#111111");
    expect(lc(hcT.surface)).toBe("#fffdf8");
    expect(lc(hcDarkT.ink)).toBe("#ffffff");
    expect(lc(hcDarkT.surface)).toBe("#0d0b09");
  });
});

describe("chart sources hold no palette of their own", () => {
  const sources = ["src/components/analytics/use-echart.ts", "src/components/analytics/charts.tsx", "src/components/analytics/encoding.ts"].map((f) => [f, read(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")] as const);

  it("no colour literals (hex, rgb(), hsl() or named palette) in chart code", () => {
    for (const [file, src] of sources) {
      expect(src, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, file).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
      expect(src, file).not.toMatch(/(?:emerald|amber|red|green|blue|sky|orange)-\d{2,3}/);
    }
    // The deleted hard-coded palette never returns.
    const all = sources.map(([, s]) => s).join("\n").toLowerCase();
    for (const old of ["2a78d6", "eb6834", "1baf7a"]) expect(all).not.toContain(old);
  });

  it("animation is off and the theme is re-read when <html> changes class", () => {
    const hook = sources[0]![1];
    expect(hook).toMatch(/animation:\s*false/);
    expect(hook).not.toMatch(/animation:\s*true/);
    expect(hook).toMatch(/getComputedStyle\(document\.documentElement\)/);
    expect(hook).toMatch(/MutationObserver/);
    expect(hook).toMatch(/attributeFilter:\s*\[[^\]]*"class"/);
    expect(hook).toMatch(/renderer:\s*"svg"/);
  });

  it("condition encoding: 3D square marker and 4-2 dashes, 2D circle and solid (R-A12)", () => {
    const charts = sources[1]![1];
    expect(charts).toMatch(/kind === "3d" \? "rect" : "circle"/);
    expect(charts).toMatch(/kind === "3d" \? \[4, 2\] : "solid"/);
    expect(charts).not.toMatch(/legend\s*:/);
  });
});

describe("client CSV of a chart's data table", () => {
  it("quotes, blanks undefined cells and neutralises formulas", () => {
    const text = tableCsv({
      head: ["Condition", "n", "Note"],
      rows: [
        ["2D", 12, "a, b"],
        ["3D", null, '=HYPERLINK("x")'],
        ["Other", -0.25, "–"],
      ],
    });
    expect(text).toBe('Condition,n,Note\r\n2D,12,"a, b"\r\n3D,,"\'=HYPERLINK(""x"")"\r\nOther,-0.25,\r\n');
  });
});
