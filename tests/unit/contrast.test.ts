/**
 * Contrast of the Atlas tokens (DESIGN.md 4.3 and 4.4; DR-022), parsed from src/app/globals.css so
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
    // The old admin `--faint #7d7368` (4.12:1 on the retired cream paper) fails AA and stays absent.
    expect(contrastRatio("#7d7368", "#f5f1e8")).toBeLessThan(4.5);
  });

  it("truncates instead of rounding (4.499 does not meet 4.5)", () => {
    expect(truncated(4.499)).toBe(4.49);
    expect(truncated(4.5)).toBe(4.5);
    expect(truncated(9.169)).toBe(9.16);
  });
});

// ---- DESIGN.md 4.3 (Atlas, DR-022): foreground on ground / field / sunk / wash ---------------
const SURFACES = ["--ground", "--field", "--sunk", "--wash"] as const;
type Row = readonly [fg: string, values: readonly (number | null)[]];

const LIGHT_TABLE: readonly Row[] = [
  ["--ink", [21, 17.67, 18.85, 17.37]],
  ["--ink-2", [12.08, 10.17, 10.84, 9.99]],
  ["--ink-3", [7, 5.89, 6.28, 5.79]],
  ["--indigo", [10.32, 8.69, 9.27, 8.54]],
  ["--indigo-hover", [12.95, 10.9, 11.63, 10.71]],
  ["--danger", [7.37, 6.21, 6.62, 6.1]],
  ["--ok", [6.46, 5.44, 5.8, 5.35]],
  ["--warn", [6.86, 5.77, 6.16, 5.67]],
];

const DARK_TABLE: readonly Row[] = [
  ["--ink", [14.54, 15.99, 12.91, 11.35]],
  ["--ink-2", [10.57, 11.63, 9.39, 8.25]],
  ["--ink-3", [6.55, 7.21, 5.82, 5.11]],
  ["--indigo", [9.01, 9.91, 8, 7.04]],
  ["--indigo-hover", [11.42, 12.57, 10.14, 8.92]],
  ["--danger", [7.41, 8.15, 6.58, 5.79]],
  ["--ok", [8.69, 9.56, 7.71, 6.78]],
  ["--warn", [8.47, 9.32, 7.52, 6.62]],
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

  it("labels on indigo fills and the destructive fill", () => {
    expect(ratio("light", "--on-indigo", "--indigo")).toBe(10.32);
    expect(ratio("light", "--on-indigo", "--indigo-hover")).toBe(12.95);
    expect(ratio("light", "--on-indigo", "--danger")).toBe(7.37);
  });
});

describe("DESIGN.md 4.3 dark theme", () => {
  it.each(tableCases(DARK_TABLE))("%s on %s is %s:1", (fg, bg, expected) => {
    expect(ratio("dark", fg, bg)).toBe(expected);
    expect(ratio("dark", fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("labels on indigo fills and the destructive fill", () => {
    expect(ratio("dark", "--on-indigo", "--indigo")).toBe(9.91);
    expect(ratio("dark", "--on-indigo", "--indigo-hover")).toBe(12.57);
    expect(ratio("dark", "--on-indigo", "--danger")).toBe(8.15);
    // Never white on dark danger: the destructive fill label is --on-indigo.
    expect(literal("#ffffff", token(themes.dark, "--danger"))).toBe(2.28);
  });
});

describe("DESIGN.md 4.3 non-text contrast (WCAG 1.4.11 needs 3:1)", () => {
  it.each([
    ["light", "--rule-strong", "--ground", 4.22],
    ["light", "--rule-strong", "--field", 3.55],
    ["light", "--rule-strong", "--sunk", 3.78],
    ["light", "--rule-strong", "--wash", 3.49],
    ["dark", "--rule-strong", "--ground", 4.4],
    ["dark", "--rule-strong", "--field", 4.84],
    ["dark", "--rule-strong", "--sunk", 3.91],
    ["dark", "--rule-strong", "--wash", 3.44],
    ["light", "--indigo", "--wash", 8.54], // indigo as a state fill or bar
    ["dark", "--indigo", "--wash", 7.04],
    ["light", "--series-2d", "--ground", 6.45],
    ["light", "--series-3d", "--ground", 6.51],
    ["dark", "--series-2d", "--ground", 7.56],
    ["dark", "--series-3d", "--ground", 7.57],
    ["light", "--ink", "--rule", 14.47], // reading-progress bar
    ["dark", "--ink", "--rule", 9.87],
  ] as const)("%s: %s on %s is %s:1", (theme, fg, bg, expected) => {
    expect(ratio(theme, fg, bg)).toBe(expected);
    expect(ratio(theme, fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("every control boundary is at least 3.44:1 on every surface, in every theme (DR-022)", () => {
    for (const theme of Object.keys(themes) as Theme[]) {
      for (const bg of SURFACES) expect(ratio(theme, "--rule-strong", bg), `${theme} ${bg}`).toBeGreaterThanOrEqual(3.44);
    }
  });

  it("decorative hairlines and gridlines are exempt and stay faint", () => {
    expect(ratio("light", "--rule", "--ground")).toBe(1.45);
    expect(ratio("dark", "--rule", "--ground")).toBe(1.47);
    expect(ratio("light", "--grid", "--ground")).toBe(1.32);
    expect(ratio("dark", "--grid", "--ground")).toBe(1.27);
  });
});

describe("DESIGN.md 4.3 watch pairs", () => {
  it("indigo is close to ink, so links are always underlined", () => {
    expect(ratio("light", "--indigo", "--ink")).toBe(2.03);
    expect(ratio("dark", "--indigo", "--ink")).toBe(1.61);
  });
  it("danger is close to indigo, so danger always carries an icon and the word", () => {
    expect(ratio("light", "--danger", "--indigo")).toBe(1.39);
    expect(ratio("dark", "--danger", "--indigo")).toBe(1.21);
  });
  it("paper and field are close, so every docked pane carries a 1 px rule-strong edge", () => {
    expect(ratio("light", "--ground", "--field")).toBe(1.18);
    expect(ratio("light", "--rule-strong", "--field")).toBe(3.55);
  });
  it("series-2d is close to indigo, so there are no links inside chart plot areas", () => {
    expect(ratio("light", "--series-2d", "--indigo")).toBe(1.59);
  });
});

describe("DESIGN.md 4.3 sequential ramp cell labels", () => {
  const steps = [1, 2, 3, 4, 5, 6].map((n) => `--viz-seq-${n}`);
  it.each([
    ["light", [16.42, 11.83, 7.66, 5.44, 7.52, 12.43]],
    ["dark", [12.03, 8.93, 5.75, 4.78, 7.93, 12.32]],
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
const HC_TABLE: Record<"hc-light" | "hc-dark", readonly Row[]> = {
  "hc-light": [
    ["--ink", [21, 21, 18.42, 17.41]],
    ["--ink-2", [17.4, 17.4, 15.27, 14.43]],
    ["--ink-3", [15.13, 15.13, 13.27, 12.55]],
    ["--indigo", [13.25, 13.25, 11.63, 10.99]],
    ["--danger", [9.33, 9.33, 8.19, 7.74]],
  ],
  "hc-dark": [
    ["--ink", [21, 21, 18.42, 14.34]],
    ["--ink-2", [18.42, 18.42, 16.16, 12.59]],
    ["--ink-3", [15.9, 15.9, 13.95, 10.87]],
    ["--indigo", [14.48, 14.48, 12.7, 9.89]],
    ["--danger", [12.05, 12.05, 10.57, 8.23]],
  ],
};

describe.each(["hc-light", "hc-dark"] as const)("DESIGN.md 4.4 %s", (theme) => {
  const cases = HC_TABLE[theme].flatMap(([fg, values]) =>
    values.map((expected, i) => [fg, SURFACES[i]!, expected!] as const),
  );
  it.each(cases)("%s on %s is %s:1", (fg, bg, expected) => {
    expect(ratio(theme, fg, bg)).toBe(expected);
  });

  it("button label, rules and surfaces", () => {
    const vars = themes[theme];
    expect(ratio(theme, "--on-indigo", "--indigo")).toBe(theme === "hc-light" ? 13.25 : 14.48);
    expect(ratio(theme, "--rule", "--ground")).toBe(21);
    // Surfaces become opaque and flat; the field equals the paper; every rule becomes solid ink.
    expect(token(vars, "--field")).toBe(token(vars, "--ground"));
    expect(token(vars, "--rule")).toBe(token(vars, "--ink"));
    expect(token(vars, "--rule-strong")).toBe(token(vars, "--ink"));
    expect(token(vars, "--ok")).toBe(token(vars, "--ink"));
    expect(token(vars, "--warn")).toBe(token(vars, "--ink"));
    for (const name of ["--ground", "--field", "--sunk", "--wash"]) {
      expect(parseColor(token(vars, name)).a, name).toBe(1);
    }
  });

  it("indigo-hover and destructive fills keep AA", () => {
    expect(ratio(theme, "--on-indigo", "--indigo-hover")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(theme, "--on-indigo", "--danger")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the two-tone focus ring (DESIGN.md 9.1, DR-022)", () => {
  it("is black and white in light and HC light, white and black in dark and HC dark", () => {
    expect(token(themes.light, "--focus-outer")).toBe("#000000");
    expect(token(themes.light, "--focus-inner")).toBe("#ffffff");
    expect(token(themes["hc-light"], "--focus-outer")).toBe("#000000");
    expect(token(themes.dark, "--focus-outer")).toBe("#ffffff");
    expect(token(themes.dark, "--focus-inner")).toBe("#000000");
    expect(token(themes["hc-dark"], "--focus-outer")).toBe("#ffffff");
  });

  it("keeps at least 4.58:1 (the better tone) against any colour of a 16-step RGB grid and every grey", () => {
    let worst = 21;
    const steps = Array.from({ length: 16 }, (_, i) => i * 17);
    const better = (r: number, g: number, b: number) => {
      const c = `rgb(${r} ${g} ${b})`;
      return Math.max(contrastRatio("#000000", c), contrastRatio("#ffffff", c));
    };
    for (const r of steps) for (const g of steps) for (const b of steps) worst = Math.min(worst, better(r, g, b));
    for (let v = 0; v < 256; v++) worst = Math.min(worst, better(v, v, v));
    expect(truncated(worst)).toBeGreaterThanOrEqual(4.58);
  });
});

it("the dark high-contrast block sets every token the light high-contrast block sets", () => {
  for (const name of Object.keys(hcBlock)) expect(hcDarkBlock, name).toHaveProperty(name);
});

// ---- Acceptance minimums (DESIGN.md 13), and semantic pairs in every theme -------------------
describe("DESIGN.md 13 acceptance minimums", () => {
  it.each([
    ["light", 5.35],
    ["dark", 5.11],
    ["hc-light", 7.74],
    ["hc-dark", 8.23],
  ] as const)("%s: the minimum text pair on any surface is %s:1", (theme, minimum) => {
    let min = 21;
    for (const fg of ["--ink", "--ink-2", "--ink-3", "--indigo", "--indigo-hover", "--danger", "--ok", "--warn"]) {
      for (const bg of SURFACES) min = Math.min(min, ratio(theme, fg, bg));
    }
    expect(min).toBe(minimum);
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
  "--background": "--ground", "--foreground": "--ink", "--card": "--ground",
  "--card-foreground": "--ink", "--popover": "--ground", "--popover-foreground": "--ink",
  "--primary": "--indigo", "--primary-foreground": "--on-indigo", "--secondary": "--sunk",
  "--secondary-foreground": "--ink", "--muted": "--sunk", "--muted-foreground": "--ink-3",
  "--accent": "--sunk", "--accent-foreground": "--ink", "--destructive": "--danger",
  "--border": "--rule", "--input": "--rule-strong", "--ring": "--focus-outer",
};

describe("token rules", () => {
  it.each([
    [":root", rootBlock],
    [".dark", darkBlock],
    [".a11y-contrast", hcBlock],
    [".dark.a11y-contrast", hcDarkBlock],
  ] as const)("%s maps every shadcn semantic token onto the Atlas tokens", (_sel, b) => {
    for (const name of SEMANTIC) expect(b[name], name).toBe(`var(${SHADCN_MAP[name]})`);
  });

  it("keeps the light ground the smoke test pins (rgb(255, 255, 255), white paper)", () => {
    expect(parseColor(token(themes.light, "--ground"))).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it("has no cream, madder, ochre or band token (DR-022)", () => {
    expect(css).not.toMatch(/--(?:madder|ochre|ochre-deco|band|band-lozenge)\s*:/);
    expect(css.toLowerCase()).not.toContain("#f5f1e8");
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

  it("has no glass and no shadows: no backdrop blur, no translucent panel or shadow tokens", () => {
    expect(css).not.toMatch(/backdrop-filter:\s*(?!none)[^;]*blur/);
    expect(css).not.toMatch(/--panel-bg/);
    expect(css).not.toMatch(/--shadow-console\s*:/);
  });

  it("uses no small caps or old-style figures (R-T8)", () => {
    expect(css).not.toMatch(/font-variant-caps/);
    expect(css).not.toMatch(/oldstyle-nums|"onum"/);
  });
});
