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
    ["lime", "vat"],
    ["lime", "madder"],
    ["turmeric-hi", "vat"],
    ["madder-text", "vat"],
    ["madder-text", "vat-2"],
    ["off-fg", "off-bg"],
    ["wall-ink", "plaster"],
    ["hall-paint", "plaster"],
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
