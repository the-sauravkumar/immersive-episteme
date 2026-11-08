import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { tableCsv } from "@/components/analytics/charts";
import { readVizTheme, VIZ_TOKENS } from "@/components/analytics/use-echart";

const read = (rel: string) => readFileSync(new URL(`../../../${rel}`, import.meta.url), "utf8");
const css = read("src/styles/walking-tokens.css");

function rootTokens(): Record<string, string> {
  const match = /(?:^|\n):root\s*\{([^}]*)\}/.exec(css);
  if (!match?.[1]) throw new Error(":root not found in walking-tokens.css");
  const out: Record<string, string> = {};
  for (const d of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) if (d[1] && d[2]) out[d[1]] = d[2].trim();
  return out;
}

const tokens = rootTokens();
const get = (name: string) => ` ${tokens[name] ?? ""}`;
const lc = (s: string) => s.toLowerCase();

describe("chart theme equals the DESIGN.md Section 4 tokens", () => {
  it("every chart colour is the token's value", () => {
    const t = readVizTheme(get, "Mukta");
    const expectToken = (value: string, token: string) => {
      expect(value, token).not.toBe("");
      expect(lc(value), token).toBe(lc(get(token).trim()));
    };
    expectToken(t.series2d, VIZ_TOKENS.series2d);
    expectToken(t.series3d, VIZ_TOKENS.series3d);
    expectToken(t.text, VIZ_TOKENS.text);
    expectToken(t.textDim, VIZ_TOKENS.textDim);
    expectToken(t.line, VIZ_TOKENS.line);
    expectToken(t.page, VIZ_TOKENS.page);
    expect(t.ramp).toHaveLength(6);
    t.ramp.forEach((c, i) => expectToken(c, VIZ_TOKENS.ramp[i]!));
    const vat = lc(get("--vat").trim());
    expect(t.rampLabel.map(lc)).toEqual([lc(t.text), lc(t.text), lc(t.text), vat, vat, vat]);
    expect(t.fontFamily).toBe("Mukta");
  });

  it("the series are lime for 2D and turmeric for 3D, and the ramp rises from vat-2 to turmeric-hi", () => {
    const t = readVizTheme(get);
    expect([lc(t.series2d), lc(t.series3d)]).toEqual(["#efe8d6", "#e8a917"]);
    expect(t.ramp.map(lc)).toEqual(["#16264e", "#2c3850", "#5a6478", "#c48c0c", "#e8a917", "#f4c04a"]);
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
    const all = sources.map(([, s]) => s).join("\n").toLowerCase();
    for (const old of ["2a78d6", "eb6834", "1baf7a"]) expect(all).not.toContain(old);
  });

  it("animation is off and the theme is read from the document's tokens", () => {
    const hook = sources[0]![1];
    expect(hook).toMatch(/animation:\s*false/);
    expect(hook).not.toMatch(/animation:\s*true/);
    expect(hook).toMatch(/getComputedStyle\(document\.documentElement\)/);
    expect(hook).toMatch(/renderer:\s*"svg"/);
  });

  it("condition encoding: 3D square marker and 4-2 dashes, 2D circle and solid", () => {
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
