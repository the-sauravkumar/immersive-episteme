import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

const files = walk(path.join(ROOT, "src")).map((f) => ({ rel: rel(f), text: stripComments(readFileSync(f, "utf8").replace(/\r\n/g, "\n")) }));
const SCENE = /^src\/features\/[^/]+\/(domain|application|infrastructure)\//;
const interfaceFiles = files.filter((f) => !SCENE.test(f.rel));

function hits(pattern: RegExp, scope = files, allow: readonly string[] = []): string[] {
  const out: string[] = [];
  const all = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (const f of scope) {
    if (allow.includes(f.rel)) continue;
    for (const m of f.text.matchAll(all)) out.push(`${f.rel}:${f.text.slice(0, m.index ?? 0).split("\n").length}: ${m[0].slice(0, 80)}`);
  }
  return out;
}

const ATLAS_COLOURS = [
  "ground", "field", "sunk", "wash", "ink", "ink-2", "ink-3", "rule", "rule-strong", "indigo", "indigo-hover", "on-indigo",
  "danger", "warn", "series-2d", "series-3d", "grid", "surface", "viz-seq-[1-6]", "focus-outer", "focus-inner",
  "paper", "ink-soft", "ink-muted", "brand", "brand-hover", "card-warm", "hairline", "hairline-strong", "panel",
  "background", "foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent-foreground", "destructive", "popover", "popover-foreground", "card-foreground", "input",
].join("|");
const UTILITY = "(?:bg|text|border|border-[trblxyse]|ring|ring-offset|fill|stroke|outline|divide|decoration|placeholder|from|to|via|accent|caret|shadow)";
const ATLAS_TYPE = "title|reading|claim-number|quote|lead|h2|h3|label|value|source|caption|credit|ui|timer|id|display-[123]|deck|body|table|stat|eyebrow|dl-label|dl-value|mono|kicker|hero";
const SECTION_4_HEX = new Set([
  "#0e1626", "#16264e", "#2c3850", "#efe8d6", "#b9b6ac", "#e4dcc6", "#14213f", "#e8a917", "#f4c04a", "#c48c0c", "#b02a20",
  "#f3a99f", "#9ccba6", "#5a6478", "#262f42", "#99a0ad", "#c8bfae", "#101d42", "#7a1610", "#d2c4b6", "#8d1c14",
  "#21356a", "#6b5238", "#0a1636", "#131314", "#8e918f", "#e3e3e3", "#4285f4", "#34a853", "#fbbc05", "#ea4335",
]);

describe("DESIGN.md is the one UI: no Atlas token survives (DR-119)", () => {
  it("no Atlas or shadcn colour utility", () => {
    expect(hits(new RegExp(`(?<![\\w-])${UTILITY}-(?:${ATLAS_COLOURS})(?![\\w-])`), interfaceFiles)).toEqual([]);
  });

  it("no Atlas custom property", () => {
    expect(hits(new RegExp(`--(?:${ATLAS_COLOURS}|sans-stack|code-stack|arabic-stack|font-atkinson|font-anek|radius-control|radius-card|radius-badge)(?![\\w-])`))).toEqual([]);
  });

  it("no Atlas type utility", () => {
    expect(hits(new RegExp(`(?<![\\w-])text-(?:${ATLAS_TYPE})(?![\\w-])`))).toEqual([]);
  });

  it("no theme switch, high contrast block or retired font", () => {
    expect(hits(/a11y-contrast|a11y-reduce-motion|next-themes|\bhc:|Atkinson|Anek|"Inter"|Space Grotesk/)).toEqual([]);
    expect(existsSync(path.join(ROOT, "docs/design/atlas-v1.md"))).toBe(false);
  });

  it("globals.css drops the default palette, fonts, radii and shadows and maps only the DESIGN tokens", () => {
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    for (const reset of ["--color-*: initial", "--font-*: initial", "--radius-*: initial", "--shadow-*: initial"]) expect(css).toContain(reset);
    const mapped = [...css.matchAll(/--color-([\w-]+):\s*var\(--([\w-]+)\)/g)].map((m) => [m[1], m[2]]);
    for (const [name, token] of mapped) expect(name).toBe(token);
  });
});

describe("DESIGN.md Sections 4, 5, 6 and 12 in interface code", () => {
  it("hex colours are Section 4 values only", () => {
    const out: string[] = [];
    for (const f of interfaceFiles) {
      for (const m of f.text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        if (!SECTION_4_HEX.has(m[0].toLowerCase())) out.push(`${f.rel}:${f.text.slice(0, m.index ?? 0).split("\n").length}: ${m[0]}`);
      }
    }
    expect(out).toEqual([]);
  });

  it("square corners: no radius utility but rounded-full on radios and rounded-none, no border-radius but 0 and radios", () => {
    expect(hits(/(?<![\w-])rounded(?:-(?!full\b|none\b)[\w[\]./-]+)?(?![\w-])/, interfaceFiles)).toEqual([]);
    expect(hits(/border-radius:\s*(?=\S)(?!0[;\s]|50%)/, interfaceFiles)).toEqual([]);
  });

  it("no drop shadows, blur or glass", () => {
    expect(hits(/(?<![\w-])shadow-(?:xs|sm|md|lg|xl|2xl|inner|\[)/, interfaceFiles)).toEqual([]);
    expect(hits(/box-shadow:\s*(?=\S)(?!none)|backdrop-filter|(?<![\w-])backdrop-blur|(?<![\w-])blur-/, interfaceFiles)).toEqual([]);
  });

  it("two families only: no monospace, serif or other face", () => {
    expect(hits(/(?<![\w-])font-(?:mono|serif)(?![\w-])|font-family:\s*(?=\S)(?!var\(--(?:disp|body)\)|Eczar|Mukta|inherit)/, interfaceFiles)).toEqual([]);
  });

  it("no uppercase labels, positive tracking or middle-dot joins", () => {
    expect(hits(/(?<![\w-])uppercase(?![\w-])|text-transform:\s*uppercase/, interfaceFiles)).toEqual([]);
    expect(hits(/(?<![\w-])tracking-(?:wide|wider|widest|\[0?\.\d+em\])(?![\w-])/, interfaceFiles)).toEqual([]);
    expect(hits(/ · /, interfaceFiles)).toEqual([]);
  });

  it("no left-edge accent bars", () => {
    expect(hits(/(?<![\w-])border-l-(?:2|3|4|\[\d+px\])(?![\w-])/, interfaceFiles, ["src/components/ui/tabs.tsx", "src/components/ui/sheet.tsx"])).toEqual([]);
  });
});

describe("no raw browser controls", () => {
  it("every select is the shared NativeSelect or a styled walking field", () => {
    expect(hits(/<select\b/, interfaceFiles, ["src/components/ui/native-select.tsx", "src/components/study/test-item-fields.tsx"])).toEqual([]);
  });

  it("no number spinners", () => {
    expect(hits(/type=["{]?"?number"?/, interfaceFiles)).toEqual([]);
  });

  it("the file input lives only inside FileInput", () => {
    expect(hits(/type="file"/, interfaceFiles, ["src/components/ui/file-input.tsx"])).toEqual([]);
  });

  it("every <summary> is the shared Disclosure or an allowed designed disclosure", () => {
    expect(hits(/<summary\b/, interfaceFiles, ["src/components/ui/disclosure.tsx", "src/components/knowledge/relation-group-details.tsx", "src/features/course/ui/product-panel.tsx", "src/features/course/ui/stage-panel.tsx"])).toEqual([]);
  });
});
