import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/a11y/contrast";

const css = readFileSync(new URL("../../src/styles/walking-tokens.css", import.meta.url), "utf8");

function rootTokens(): Record<string, string> {
  const match = /(?:^|\n):root\s*\{([^}]*)\}/.exec(css);
  if (!match?.[1]) throw new Error(":root not found in walking-tokens.css");
  const out: Record<string, string> = {};
  for (const decl of match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) if (decl[1] && decl[2]) out[decl[1]] = decl[2].trim().toLowerCase();
  return out;
}

const tokens = rootTokens();
const truncated = (ratio: number) => Math.floor(ratio * 100 + 1e-9) / 100;
const ratio = (fg: string, bg: string) => {
  const a = tokens[fg];
  const b = tokens[bg];
  if (!a || !b) throw new Error(`missing token ${a ? bg : fg}`);
  return truncated(contrastRatio(a, b));
};

const SECTION_4 = {
  vat: "#0e1626",
  "vat-2": "#16264e",
  line: "#2c3850",
  lime: "#efe8d6",
  "lime-dim": "#b9b6ac",
  cotton: "#e4dcc6",
  stamp: "#14213f",
  turmeric: "#e8a917",
  "turmeric-hi": "#f4c04a",
  "turmeric-lo": "#c48c0c",
  madder: "#b02a20",
  "madder-text": "#f3a99f",
  ok: "#9ccba6",
  thread: "#5a6478",
  "off-bg": "#262f42",
  "off-fg": "#99a0ad",
  plaster: "#c8bfae",
  "wall-ink": "#101d42",
  "hall-paint": "#7a1610",
} as const;

const NAMED_EXTRAS = {
  "still-ground": "#d2c4b6",
  "madder-lo": "#8d1c14",
  "raised-hover": "#21356a",
  "product-rail": "#6b5238",
  "row-hover": "rgba(22, 38, 78, 0.55)",
  backdrop: "rgba(6, 10, 20, 0.78)",
  "google-fill": "#131314",
  "google-stroke": "#8e918f",
  "google-text": "#e3e3e3",
  "google-blue": "#4285f4",
  "google-green": "#34a853",
  "google-yellow": "#fbbc05",
  "google-red": "#ea4335",
} as const;

describe("the token file holds exactly the DESIGN.md Section 4 values", () => {
  it.each(Object.entries(SECTION_4))("--%s is %s", (name, hex) => {
    expect(tokens[name]).toBe(hex);
  });

  it.each(Object.entries(NAMED_EXTRAS))("named extra --%s is %s", (name, value) => {
    expect(tokens[name]).toBe(value);
  });

  it("defines no colour beyond Section 4 and its named extras", () => {
    const colours = Object.entries(tokens).filter(([, v]) => /^(#|rgba?\()/.test(v)).map(([k]) => k);
    expect(colours.sort()).toEqual([...Object.keys(SECTION_4), ...Object.keys(NAMED_EXTRAS)].sort());
  });
});

describe("DESIGN.md Section 4 contrast column", () => {
  it.each([
    ["lime", "vat", 14.8],
    ["lime", "vat-2", 12.09],
    ["lime-dim", "vat", 8.91],
    ["lime-dim", "vat-2", 7.28],
    ["stamp", "cotton", 11.64],
    ["turmeric", "vat", 8.71],
    ["turmeric-hi", "vat", 10.75],
    ["turmeric-lo", "vat", 6.12],
    ["lime", "madder", 5.37],
    ["madder-text", "vat", 9.46],
    ["madder-text", "vat-2", 7.73],
    ["ok", "vat", 9.91],
    ["thread", "vat", 3.04],
    ["off-fg", "off-bg", 5.09],
    ["wall-ink", "plaster", 9.02],
    ["hall-paint", "plaster", 5.91],
  ] as const)("%s on %s is %s:1, within the rounding of the table", (fg, bg, expected) => {
    expect(Math.abs(ratio(fg, bg) - expected)).toBeLessThanOrEqual(0.011);
  });
});

describe("pairs the study and staff screens draw (Rule 15: 4.5:1 text, 3:1 non-text)", () => {
  it.each([
    ["lime", "raised-hover"],
    ["lime-dim", "raised-hover"],
    ["turmeric", "vat-2"],
    ["turmeric", "raised-hover"],
    ["madder-text", "raised-hover"],
    ["ok", "vat-2"],
    ["ok", "raised-hover"],
    ["vat", "turmeric"],
    ["vat", "turmeric-hi"],
    ["vat", "turmeric-lo"],
    ["lime", "madder-lo"],
    ["stamp", "cotton"],
  ] as const)("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["lime-dim", "vat"],
    ["lime-dim", "vat-2"],
    ["turmeric", "vat"],
    ["turmeric", "vat-2"],
    ["madder-text", "vat"],
    ["lime", "vat-2"],
    ["thread", "vat"],
  ] as const)("boundary %s on %s is at least 3:1", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
