/**
 * Contrast of the Apparatus tokens (DESIGN.md 4.3 and 4.4), parsed from src/app/globals.css so
 * this test cannot drift from the CSS.
 *
 * Ratios are TRUNCATED to two decimals, never rounded (WCAG Understanding 1.4.3, R-A2:
 * "4.499:1 would not meet the 4.5:1 threshold"). The expected values are the DESIGN.md tables;
 * an equality failure means the CSS and the spec disagree (the spec wins, DESIGN.md header).
 *
 * Four blocks are parsed: `:root` (light), `.dark`, `.a11y-contrast` (HC light) and
 * `.dark.a11y-contrast` (HC dark). The cascade on <html class="dark a11y-contrast"> is
 * root < dark < a11y-contrast < dark.a11y-contrast, which is how the theme maps are merged.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseColor, relativeLuminance, type Rgba } from "@/lib/a11y/contrast";

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

const rootBlock = block(":root");
const darkBlock = block(".dark");
const hcBlock = block(".a11y-contrast");
const hcDarkBlock = block(".dark.a11y-contrast");

type Vars = Record<string, string>;
const themes = {
  light: rootBlock,
  dark: { ...rootBlock, ...darkBlock },
  "hc-light": { ...rootBlock, ...hcBlock },
  "hc-dark": { ...rootBlock, ...darkBlock, ...hcBlock, ...hcDarkBlock },
} satisfies Record<string, Vars>;
type Theme = keyof typeof themes;

function token(vars: Vars, name: string, depth = 0): string {
  const raw = vars[name];
  if (raw === undefined) throw new Error(`Token ${name} is undefined`);
  const ref = /^var\((--[\w-]+)\)$/.exec(raw);
  if (ref?.[1]) {
    if (depth > 10) throw new Error(`Cyclic token ${name}`);
    return token(vars, ref[1], depth + 1);
  }
  return raw;
}

/** Resolve a token to an opaque colour (translucent fills sit on --background). */
function colour(vars: Vars, name: string): Rgba {
  const c = parseColor(token(vars, name));
  return c.a < 1 ? composite(c, parseColor(token(vars, "--background"))) : c;
}

/** WCAG ratio truncated (never rounded) to two decimals (R-A2). */
function truncated(ratio: number): number {
  return Math.floor(ratio * 100 + 1e-9) / 100;
}

function ratio(theme: Theme, fg: string, bg: string): number {
  const vars = themes[theme];
  return truncated(contrastRatio(colour(vars, fg), colour(vars, bg)));
}

const literal = (fg: string, bg: string) => truncated(contrastRatio(fg, bg));

describe("contrast helper", () => {
  it("matches known WCAG reference values", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#fff")).toBeCloseTo(1, 5);
    // The admin `--faint #7d7368` (4.12:1 on the old paper) fails AA and is deliberately absent.
    expect(contrastRatio("#7d7368", "#f5f1e8")).toBeLessThan(4.5);
  });

  it("truncates instead of rounding (4.499 does not meet 4.5)", () => {
    expect(truncated(4.499)).toBe(4.49);
    expect(truncated(4.5)).toBe(4.5);
    expect(truncated(9.169)).toBe(9.16);
  });
});

// ---- DESIGN.md 4.3: foreground on ground / surface / sunk / wash -----------------------------
const SURFACES = ["--ground", "--surface", "--sunk", "--wash"] as const;
type Row = readonly [fg: string, values: readonly (number | null)[]];

const LIGHT_TABLE: readonly Row[] = [
  ["--ink", [14.85, 15.79, 13.36, 13.38]],
  ["--ink-2", [11.02, 11.72, 9.92, 9.93]],
  ["--ink-3", [5.99, 6.37, 5.39, 5.39]],
  ["--indigo", [9.16, 9.74, 8.24, 8.25]],
  ["--indigo-hover", [11.49, 12.22, 10.34, 10.35]],
  ["--danger", [6.54, 6.96, 5.89, 5.89]],
  ["--madder", [7.18, 7.63, 6.46, null]],
  ["--ochre", [5.41, 5.75, 4.86, null]],
  ["--ok", [5.73, 6.1, 5.16, null]],
  ["--warn", [6.08, 6.47, 5.48, null]],
];

const DARK_TABLE: readonly Row[] = [
  ["--ink", [14.77, 13.81, 12.68, 10.88]],
  ["--ink-2", [12.14, 11.35, 10.42, 8.94]],
  ["--ink-3", [7.02, 6.56, 6.02, 5.17]],
  ["--indigo", [9.51, 8.9, 8.16, 7.01]],
  ["--indigo-hover", [12.05, 11.28, 10.35, 8.88]],
  ["--danger", [7.82, 7.31, 6.71, 5.76]],
  ["--madder", [7.6, 7.1, 6.52, null]],
  ["--ochre", [8.56, 8.01, 7.35, null]],
  ["--ok", [9.17, 8.58, 7.87, null]],
  ["--warn", [8.94, 8.36, 7.68, null]],
];

function tableCases(table: readonly Row[]) {
  return table.flatMap(([fg, values]) =>
    values.flatMap((expected, i) => (expected === null ? [] : [[fg, SURFACES[i]!, expected] as const])),
  );
}

describe("DESIGN.md 4.3 light theme", () => {
  it.each(tableCases(LIGHT_TABLE))("%s on %s is %s:1", (fg, bg, expected) => {
    expect(ratio("light", fg, bg)).toBe(expected);
    expect(ratio("light", fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("labels on indigo fills, the band and the destructive fill", () => {
    expect(ratio("light", "--on-indigo", "--indigo")).toBe(9.74);
    expect(ratio("light", "--on-indigo", "--indigo-hover")).toBe(12.22);
    expect(ratio("light", "--ground", "--band")).toBe(9.16);
    expect(ratio("light", "--on-indigo", "--danger")).toBe(6.96);
    // No focusable element ever sits on a band: the indigo ring on the light band is 1.00:1.
    expect(ratio("light", "--indigo", "--band")).toBe(1);
  });
});

describe("DESIGN.md 4.3 dark theme", () => {
  it.each(tableCases(DARK_TABLE))("%s on %s is %s:1", (fg, bg, expected) => {
    expect(ratio("dark", fg, bg)).toBe(expected);
    expect(ratio("dark", fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("labels on indigo fills, the band and the destructive fill", () => {
    expect(ratio("dark", "--on-indigo", "--indigo")).toBe(9.56);
    expect(ratio("dark", "--on-indigo", "--indigo-hover")).toBe(12.12);
    expect(ratio("dark", "--ink", "--band")).toBe(11.34);
    expect(ratio("dark", "--on-indigo", "--danger")).toBe(7.86);
    // Never white on dark danger (2.28): the destructive fill label is --on-indigo.
    expect(literal("#ffffff", token(themes.dark, "--danger"))).toBe(2.28);
  });
});

describe("DESIGN.md 4.3 non-text contrast (WCAG 1.4.11 needs 3:1)", () => {
  it.each([
    ["light", "--rule-strong", "--ground", 3.72],
    ["light", "--rule-strong", "--surface", 3.96],
    ["light", "--rule-strong", "--sunk", 3.35],
    ["light", "--rule-strong", "--wash", 3.35],
    ["dark", "--rule-strong", "--ground", 3.83],
    ["dark", "--rule-strong", "--surface", 3.59],
    ["dark", "--rule-strong", "--sunk", 3.29],
    ["light", "--indigo", "--ground", 9.16],
    ["dark", "--indigo", "--ground", 9.51],
    ["light", "--series-2d", "--surface", 6.08],
    ["light", "--series-3d", "--surface", 6.14],
    ["dark", "--series-2d", "--surface", 7.46],
    ["dark", "--series-3d", "--surface", 7.47],
    ["light", "--ochre-deco", "--band", 4.01],
    ["dark", "--ochre-deco", "--band", 5.33],
    ["light", "--ink", "--rule", 9.71], // reading-progress bar (9.11)
    ["dark", "--ink", "--rule", 9.95],
  ] as const)("%s: %s on %s is %s:1", (theme, fg, bg, expected) => {
    expect(ratio(theme, fg, bg)).toBe(expected);
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("rule-strong on dark wash is 2.82, which is why a selected row also carries the indigo bar", () => {
    expect(ratio("dark", "--rule-strong", "--wash")).toBe(2.82);
    expect(ratio("dark", "--indigo", "--wash")).toBe(7.01);
  });

  it("decorative hairlines and gridlines are exempt and stay faint", () => {
    expect(ratio("light", "--rule", "--ground")).toBe(1.52);
    expect(ratio("dark", "--rule", "--ground")).toBe(1.48);
    expect(ratio("light", "--grid", "--surface")).toBe(1.38);
    expect(ratio("dark", "--grid", "--surface")).toBe(1.24);
  });
});

describe("DESIGN.md 4.3 watch pairs", () => {
  it("madder is indistinguishable from danger, so it is public-only", () => {
    expect(ratio("light", "--madder", "--danger")).toBe(1.09);
    expect(ratio("dark", "--madder", "--danger")).toBe(1.02);
  });
  it("series-2d is close to indigo, so there are no links inside chart plot areas", () => {
    expect(ratio("light", "--series-2d", "--indigo")).toBe(1.59);
  });
  it("indigo is close to ink, so links are always underlined", () => {
    expect(ratio("light", "--indigo", "--ink")).toBe(1.62);
    expect(ratio("dark", "--indigo", "--ink")).toBe(1.55);
  });
});

describe("DESIGN.md 4.3 sequential ramp cell labels", () => {
  const steps = [1, 2, 3, 4, 5, 6].map((n) => `--viz-seq-${n}`);
  it.each([
    ["light", [13.09, 9.43, 6.1, 5.14, 7.09, 11.72]],
    ["dark", [11.58, 8.59, 5.54, 4.61, 7.65, 11.88]],
  ] as const)("%s: ink on steps 1-3, on-indigo on steps 4-6", (theme, expected) => {
    const got = steps.map((step, i) => ratio(theme, i < 3 ? "--ink" : "--on-indigo", step));
    expect(got).toEqual(expected);
    for (const r of got) expect(r).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dashboard condition series (DESIGN.md 4.2, 15)", () => {
  it.each(["light", "dark"] as const)("%s: series-2d and series-3d luminance within 2%%", (theme) => {
    const a = relativeLuminance(colour(themes[theme], "--series-2d"));
    const b = relativeLuminance(colour(themes[theme], "--series-3d"));
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.02);
  });
});

// ---- DESIGN.md 4.4: high contrast ------------------------------------------------------------
const HC_SURFACES = ["--ground", "--sunk", "--wash"] as const;
const HC_TABLE: Record<"hc-light" | "hc-dark", readonly Row[]> = {
  "hc-light": [
    ["--ink", [18.57, 16.03, 15.66]],
    ["--ink-2", [14.72, 12.71, 12.41]],
    ["--ink-3", [12.07, 10.42, 10.18]],
    ["--indigo", [13.03, 11.25, 10.99]],
    ["--danger", [9.18, 7.92, 7.74]],
  ],
  "hc-dark": [
    ["--ink", [19.64, 17.65, 14.34]],
    ["--ink-2", [16.55, 14.87, 12.09]],
    ["--ink-3", [14.29, 12.84, 10.43]],
    ["--indigo", [13.55, 12.17, 9.89]],
    ["--danger", [11.27, 10.13, 8.23]],
  ],
};

describe.each(["hc-light", "hc-dark"] as const)("DESIGN.md 4.4 %s", (theme) => {
  const cases = HC_TABLE[theme].flatMap(([fg, values]) =>
    values.map((expected, i) => [fg, HC_SURFACES[i]!, expected!] as const),
  );
  it.each(cases)("%s on %s is %s:1", (fg, bg, expected) => {
    expect(ratio(theme, fg, bg)).toBe(expected);
  });

  it("button label, rules and surfaces", () => {
    const vars = themes[theme];
    expect(ratio(theme, "--on-indigo", "--indigo")).toBe(theme === "hc-light" ? 13.03 : 13.55);
    expect(ratio(theme, "--rule", "--ground")).toBe(theme === "hc-light" ? 18.57 : 19.64);
    // Surfaces become opaque and flat; every rule becomes solid ink.
    expect(token(vars, "--surface")).toBe(token(vars, "--ground"));
    expect(token(vars, "--rule")).toBe(token(vars, "--ink"));
    expect(token(vars, "--rule-strong")).toBe(token(vars, "--ink"));
    expect(token(vars, "--shadow-console")).toBe("none");
    for (const name of ["--ground", "--surface", "--sunk", "--wash"]) {
      expect(parseColor(token(vars, name)).a, name).toBe(1);
    }
  });

  it("indigo-hover and destructive fills keep AA", () => {
    expect(ratio(theme, "--on-indigo", "--indigo-hover")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(theme, "--on-indigo", "--danger")).toBeGreaterThanOrEqual(4.5);
  });
});

it("the focus double ring is 21:1 (black and white)", () => {
  expect(literal("#000000", "#ffffff")).toBe(21);
  expect(css).toMatch(/\.a11y-contrast :focus-visible\s*\{[^}]*outline: 3px solid #000/);
});

it("the dark high-contrast block sets every token the light high-contrast block sets", () => {
  for (const name of Object.keys(hcBlock)) expect(hcDarkBlock, name).toHaveProperty(name);
});

// ---- Section 15 minimums, and semantic pairs in every theme ---------------------------------
describe("DESIGN.md 15 acceptance minimums", () => {
  it.each([
    ["--ink", "--ground", 14.85, 14.77],
    ["--ink-3", "--sunk", 5.39, 6.02],
    ["--indigo", "--ground", 9.16, 9.51],
    ["--on-indigo", "--indigo", 9.74, 9.56],
    ["--danger", "--ground", 6.54, 7.82],
    ["--rule-strong", "--sunk", 3.35, 3.29],
  ] as const)("%s on %s", (fg, bg, light, dark) => {
    expect(ratio("light", fg, bg)).toBeGreaterThanOrEqual(light);
    expect(ratio("dark", fg, bg)).toBeGreaterThanOrEqual(dark);
  });
  it("HC ink on ground", () => {
    expect(ratio("hc-light", "--ink", "--ground")).toBeGreaterThanOrEqual(18.57);
    expect(ratio("hc-dark", "--ink", "--ground")).toBeGreaterThanOrEqual(19.64);
  });
});

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
  ["--primary", "--background"], // links
  ["--primary", "--card"],
  ["--destructive", "--background"],
  ["--destructive", "--card"],
];

describe.each(Object.keys(themes) as Theme[])("%s semantic text pairs", (theme) => {
  it.each(TEXT_PAIRS)("%s on %s is >= 4.5:1", (fg, bg) => {
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("control boundaries (--input) are >= 3:1 on background and card", () => {
    expect(ratio(theme, "--input", "--background")).toBeGreaterThanOrEqual(3);
    expect(ratio(theme, "--input", "--card")).toBeGreaterThanOrEqual(3);
  });
});

// ---- Token file rules --------------------------------------------------------------------------
const SEMANTIC = [
  "--background", "--foreground", "--card", "--card-foreground", "--popover",
  "--popover-foreground", "--primary", "--primary-foreground", "--secondary",
  "--secondary-foreground", "--muted", "--muted-foreground", "--accent",
  "--accent-foreground", "--destructive", "--border", "--input", "--ring",
];
const SHADCN_MAP: Record<string, string> = {
  "--background": "--ground", "--foreground": "--ink", "--card": "--surface",
  "--card-foreground": "--ink", "--popover": "--surface", "--popover-foreground": "--ink",
  "--primary": "--indigo", "--primary-foreground": "--on-indigo", "--secondary": "--sunk",
  "--secondary-foreground": "--ink", "--muted": "--sunk", "--muted-foreground": "--ink-3",
  "--accent": "--sunk", "--accent-foreground": "--ink", "--destructive": "--danger",
  "--border": "--rule", "--input": "--rule-strong", "--ring": "--indigo",
};

describe("token rules", () => {
  it.each([
    [":root", rootBlock],
    [".dark", darkBlock],
    [".a11y-contrast", hcBlock],
    [".dark.a11y-contrast", hcDarkBlock],
  ] as const)("%s maps every shadcn semantic token onto the Apparatus tokens", (_sel, b) => {
    for (const name of SEMANTIC) expect(b[name], name).toBe(`var(${SHADCN_MAP[name]})`);
  });

  it("keeps the light ground the smoke test pins (rgb(245, 241, 232))", () => {
    expect(parseColor(token(themes.light, "--ground"))).toEqual({ r: 245, g: 241, b: 232, a: 1 });
  });

  it("does not define the failing --faint token", () => {
    expect(css).not.toMatch(/--faint\s*:/);
  });

  it("never uses yellow (#ffd400 or any saturated yellow); it is reserved for the guidance cue", () => {
    expect(css.toLowerCase()).not.toContain("#ffd400");
    for (const hex of css.match(/#[0-9a-f]{6}\b/gi) ?? []) {
      const { r, g, b } = parseColor(hex);
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const l = (max + min) / 2;
      const d = max - min;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      let h = 0;
      if (d !== 0 && max === r / 255) h = (60 * ((g - b) / 255 / d) + 360) % 360;
      else if (d !== 0 && max === g / 255) h = 60 * ((b - r) / 255 / d + 2);
      const yellow = h >= 45 && h <= 70 && s >= 0.6 && l >= 0.45;
      expect(yellow, hex).toBe(false);
    }
  });

  it("has no glass: no backdrop blur and no translucent panel tokens", () => {
    expect(css).not.toMatch(/backdrop-filter:\s*(?!none)[^;]*blur/);
    expect(css).not.toMatch(/--panel-bg/);
  });

  it("uses no small caps or old-style figures (the served fonts lack them, R-T8)", () => {
    expect(css).not.toMatch(/font-variant-caps/);
    expect(css).not.toMatch(/oldstyle-nums|"onum"/);
  });
});
