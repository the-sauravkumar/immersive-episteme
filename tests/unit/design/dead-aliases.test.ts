/**
 * Dead-alias test (DESIGN.md 18 WP8 task 4, residual risk 6): no file in src/ uses a deprecated
 * token name, utility, primitive size or variant, so the aliases can be (and are) removed from
 * src/app/globals.css and the primitives.
 *
 * The scan runs on source text with comments stripped (prose about the old names is allowed), on
 * whole files so JSX attributes that span lines are found. It also asserts that the alias
 * definitions themselves are gone.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Source without block and line comments (a `//` inside a string such as a URL is kept). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

const UTILITY = "(?:text|bg|border|border-[trblxy]|fill|stroke|decoration|outline|ring|divide|from|to|via|accent|caret|placeholder)";
const OLD_COLOURS = "(?:paper|ink-soft|ink-muted|brand|brand-hover|card-warm|hairline|hairline-strong|panel)";
const OLD_SIZES = "(?:xs|sm|lg|icon-xs|icon-sm|icon-lg)";
/** The attributes of one JSX element before the one sought (no "<" or ">" other than an arrow's "=>"). */
const ATTRS = "(?:[^<>]|=>)*?";
const Q = "[\"']";

/** A bare class token inside a className string or a cn(...) argument on one line. */
function classToken(token: string): RegExp {
  return new RegExp("(?:className=|cn\\()[^\\n]*?[\"'`](?:[^\"'`\\n]*\\s)?" + token + "(?:\\s[^\"'`\\n]*)?[\"'`]");
}

/** Each deprecated name, with the pattern that finds a use of it. */
const DEPRECATED: readonly { name: string; pattern: RegExp }[] = [
  { name: "colour alias utility (paper, ink-soft, ink-muted, brand, card-warm, hairline, panel)", pattern: new RegExp("(?<![\\w-])" + UTILITY + "-" + OLD_COLOURS + "(?![\\w-])") },
  { name: "colour alias variable", pattern: /var\(--(?:paper|ink-soft|ink-muted|brand|brand-hover|card-warm|hairline|hairline-strong|panel-bg|panel-bg-solid|panel-blur|shadow-panel-v)\)/ },
  { name: "kicker utility", pattern: classToken("kicker") },
  { name: "panel utility", pattern: classToken("panel") },
  { name: "text-kicker / text-label / text-hero", pattern: /(?<![\w-])text-(?:kicker|label|hero)(?![\w-])/ },
  { name: "font-display", pattern: /(?<![\w-])font-display(?![\w-])/ },
  { name: "shadow-card / shadow-panel", pattern: /(?<![\w-])shadow-(?:card|panel)(?![\w-])/ },
  {
    name: "deprecated Button size (xs, sm, lg, icon-xs, icon-sm, icon-lg)",
    pattern: new RegExp("<(?:Button|StudyBarButton)\\b" + ATTRS + "\\bsize=" + Q + OLD_SIZES + Q + "|buttonVariants\\(\\{[^}]*\\bsize:\\s*" + Q + OLD_SIZES + Q),
  },
  { name: "SelectTrigger size sm", pattern: new RegExp("<SelectTrigger\\b" + ATTRS + "\\bsize=" + Q + "sm" + Q) },
  {
    name: "Button or Badge variant secondary",
    pattern: new RegExp("<(?:Button|Badge)\\b" + ATTRS + "\\bvariant=" + Q + "secondary" + Q + "|(?:button|badge)Variants\\(\\{[^}]*\\bvariant:\\s*" + Q + "secondary" + Q),
  },
  {
    name: "Badge variant default, outline, ghost or destructive",
    pattern: new RegExp("<Badge\\b" + ATTRS + "\\bvariant=" + Q + "(?:default|outline|ghost|destructive)" + Q + "|badgeVariants\\(\\{[^}]*\\bvariant:\\s*" + Q + "(?:default|outline|ghost|destructive)" + Q),
  },
  { name: "Tabs variant line", pattern: new RegExp("<TabsList\\b" + ATTRS + "\\bvariant=" + Q + "line" + Q) },
  { name: "Alert variant default", pattern: new RegExp("<Alert\\b" + ATTRS + "\\bvariant=" + Q + "default" + Q) },
  { name: "PlaceholderNotice", pattern: /\bPlaceholderNotice\b/ },
  { name: "kicker class group in the tailwind-merge config", pattern: /"type-token":[^\n]*"kicker"/ },
];

const files = walk(SRC);
const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

describe("no deprecated design alias is used in src/", () => {
  for (const { name, pattern } of DEPRECATED) {
    it(name, () => {
      const hits: string[] = [];
      const all = new RegExp(pattern.source, pattern.flags + "g");
      for (const f of files) {
        const text = stripComments(readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
        for (const m of text.matchAll(all)) {
          hits.push(`${path.relative(ROOT, f).replace(/\\/g, "/")}:${lineOf(text, m.index ?? 0)}: ${m[0].replace(/\s+/g, " ").slice(0, 140)}`);
        }
      }
      expect(hits).toEqual([]);
    });
  }
});

describe("the alias definitions are removed", () => {
  const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
  it("globals.css defines no deprecated colour, font, shadow or size alias", () => {
    for (const re of [
      /--color-(?:paper|ink-soft|ink-muted|brand|brand-hover|card-warm|hairline|hairline-strong|panel):/,
      /--font-display:/,
      /--shadow-(?:card|panel|panel-v):/,
      /--text-(?:kicker|label|hero)(?:--line-height)?:/,
      /@utility (?:kicker|panel) \{/,
    ]) {
      expect(css, String(re)).not.toMatch(re);
    }
  });
  it("the primitives define no deprecated size or variant", () => {
    const button = readFileSync(path.join(SRC, "components/ui/button.tsx"), "utf8");
    expect(button).not.toMatch(/^\s*(?:xs|sm|lg|"icon-xs"|"icon-sm"|"icon-lg"): "/m);
    expect(button).not.toMatch(/^\s*secondary: /m);
    const badge = readFileSync(path.join(SRC, "components/ui/badge.tsx"), "utf8");
    expect(badge).not.toMatch(/^\s*(?:default|secondary|outline|ghost|destructive): /m);
    const tabs = readFileSync(path.join(SRC, "components/ui/tabs.tsx"), "utf8");
    expect(tabs).not.toMatch(/^\s*line: ""/m);
    const alert = readFileSync(path.join(SRC, "components/ui/alert.tsx"), "utf8");
    expect(alert).not.toMatch(/^\s*default: "/m);
    const select = readFileSync(path.join(SRC, "components/ui/select.tsx"), "utf8");
    expect(select).not.toMatch(/size\?: "sm" \| "default"/);
  });
});
