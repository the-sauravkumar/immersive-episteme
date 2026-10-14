/**
 * Asserts WCAG AA (>= 4.5:1) for the main text/background token pairs in every theme.
 * Token values are parsed from src/app/globals.css so this test cannot drift from the CSS.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseColor, type Rgba } from "@/lib/a11y/contrast";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function block(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match?.[1]) throw new Error(`Selector ${selector} not found in globals.css`);
  const out: Record<string, string> = {};
  for (const decl of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (decl[1] && decl[2]) out[decl[1]] = decl[2].trim();
  }
  return out;
}

const root = block(":root");
const themes: Record<string, Record<string, string>> = {
  light: root,
  dark: { ...root, ...block(".dark") },
  "high-contrast": { ...root, ...block(".a11y-contrast") },
};

function token(vars: Record<string, string>, name: string, depth = 0): string {
  const raw = vars[name];
  if (raw === undefined) throw new Error(`Token ${name} is undefined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(raw);
  if (ref?.[1]) {
    if (depth > 10) throw new Error(`Cyclic token ${name}`);
    return token(vars, ref[1], depth + 1);
  }
  return raw;
}

/** Resolve a surface token to an opaque colour (translucent fills sit on --background). */
function surface(vars: Record<string, string>, name: string): Rgba {
  const base = parseColor(token(vars, "--background"));
  const c = parseColor(token(vars, name));
  return c.a < 1 ? composite(c, base) : c;
}

const TEXT_PAIRS: ReadonlyArray<readonly [fg: string, bg: string]> = [
  ["--foreground", "--background"],
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--accent-foreground", "--accent"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--muted"],
  ["--muted-foreground", "--card"],
  ["--primary", "--background"], // links and brand text
  ["--primary", "--card"],
  ["--destructive", "--background"],
  ["--destructive", "--card"],
];

describe("contrast helper", () => {
  it("matches known WCAG reference values", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
    // catalogue §2.1: ink on paper 13.29:1, --faint 4.12:1 (fails AA, deliberately not ported)
    expect(contrastRatio("#2b2621", "#f5f1e8")).toBeCloseTo(13.29, 1);
    expect(contrastRatio("#7d7368", "#f5f1e8")).toBeLessThan(4.5);
  });
});

describe.each(Object.entries(themes))("%s theme tokens", (_theme, vars) => {
  it.each(TEXT_PAIRS)("%s on %s is >= 4.5:1", (fg, bg) => {
    const ratio = contrastRatio(token(vars, fg), surface(vars, bg));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("token rules", () => {
  it("does not define the failing --faint token", () => {
    expect(css).not.toMatch(/--faint\s*:/);
  });

  it("never uses yellow (#ffd400) — reserved for the guidance cue", () => {
    expect(css.toLowerCase()).not.toContain("#ffd400");
  });

  it("maps every shadcn semantic token in .dark", () => {
    const dark = block(".dark");
    for (const name of [
      "--background", "--foreground", "--card", "--card-foreground", "--popover",
      "--popover-foreground", "--primary", "--primary-foreground", "--secondary",
      "--secondary-foreground", "--muted", "--muted-foreground", "--accent",
      "--accent-foreground", "--destructive", "--border", "--input", "--ring",
    ]) {
      expect(dark, name).toHaveProperty(name);
    }
  });
});
