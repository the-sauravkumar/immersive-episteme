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
