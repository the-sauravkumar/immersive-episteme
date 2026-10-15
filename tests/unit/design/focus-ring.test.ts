/**
 * Focus ring guard (DESIGN.md 9.1, R-A5; section 15 "Focus indicator present on every focusable
 * element"). The ring is drawn once, by the global `:focus-visible` rule in globals.css. Tailwind's
 * `outline-none` is a utility, so on a primitive it beats that base-layer rule and hides the ring on
 * every surface that uses the primitive, in both conditions. This test keeps it out of the
 * primitives, and keeps any `focus-visible:outline-none` out of src/.
 *
 * Allowed: `outline-none` on programmatic focus targets that are not controls (`<main
 * tabIndex={-1}>`, the scroll container of the 3D panel); menu and select items that use
 * `outline-hidden` and draw a 2 px indigo inset bar on focus instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Block comments keep their line breaks, so reported line numbers match the file.
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

describe("focus ring", () => {
  it("no ui primitive carries outline-none", () => {
    const offenders = walk(path.join(ROOT, "src/components/ui")).filter((f) => /(?<![\w:-])outline-none(?![\w-])/.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no bare outline-none or outline-hidden anywhere in src outside the allow-list", () => {
    // A field-class constant with `outline-none` (the WP8 review's blocker: CONTROL and fieldClass)
    // removes the ring from every input that uses it, so the scan covers all of src/, not only the
    // primitives. An occurrence is allowed only when it sits on:
    //  - a programmatic focus target: the enclosing JSX opening tag carries `tabIndex={-1}`;
    //  - a menu or select item that draws the 2 px indigo inset bar on focus instead;
    //  - an entry in EXPLICIT below, each with its reason.
    const EXPLICIT: Record<string, { count: number; reason: string }> = {
      "src/components/museum/overlays/minimap.tsx": { count: 1, reason: "Radix Dialog Content: a tabindex=-1 focus container set by Radix; its controls draw the global ring" },
    };
    const BARE = /(?<![\w:-])outline-(?:none|hidden)(?![\w-])/g;
    const INSET_BAR = "focus:shadow-[inset_2px_0_0_var(--indigo)]";
    const offenders: string[] = [];
    const explicitSeen: Record<string, number> = {};
    for (const f of walk(path.join(ROOT, "src"))) {
      const text = stripComments(readFileSync(f, "utf8"));
      for (const m of text.matchAll(BARE)) {
        const at = m.index ?? 0;
        const eol = text.indexOf("\n", at);
        const line = text.slice(text.lastIndexOf("\n", at) + 1, eol === -1 ? undefined : eol);
        if (line.includes(INSET_BAR)) continue;
        // The enclosing JSX element: from the last `<Tag` before the match to the next tag after it.
        let tagStart = -1;
        for (const t of text.slice(0, at).matchAll(/<[A-Za-z][\w.]*[\s>]/g)) tagStart = t.index ?? -1;
        const next = text.slice(at).search(/<\/?[A-Za-z]/);
        const element = tagStart === -1 ? "" : text.slice(tagStart, next === -1 ? undefined : at + next);
        if (/\btabIndex=\{-1\}/.test(element)) continue;
        const r = rel(f);
        if (EXPLICIT[r]) {
          explicitSeen[r] = (explicitSeen[r] ?? 0) + 1;
          continue;
        }
        offenders.push(`${r}:${text.slice(0, at).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
    // The explicit allow-list stays exact, so a second occurrence in an allowed file is caught too.
    for (const [r, { count }] of Object.entries(EXPLICIT)) expect(explicitSeen[r] ?? 0, r).toBe(count);
  });

  it("no file removes the ring on focus or focus-visible", () => {
    const offenders = walk(path.join(ROOT, "src")).filter((f) => /\bfocus(?:-visible)?:outline-(?:none|hidden)\b/.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("globals.css draws the two-tone ring for every theme and none on programmatic targets (DR-022)", () => {
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    // One rule for every theme: the tones are tokens (black outside and white inside in light and
    // HC light, the reverse in dark), so no per-theme override can drift.
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--focus-outer\);\s*outline-offset:\s*2px;\s*box-shadow:\s*0 0 0 2px var\(--focus-inner\);/);
    expect(css).not.toMatch(/\.a11y-contrast :focus-visible/);
    expect(css).toMatch(/\[tabindex="-1"\]:focus-visible\s*\{\s*outline:\s*none;/);
    // Skinned controls that hide the native input draw the same ring on their visible label.
    expect(css).toMatch(/\.ie-segmented__input:focus-visible \+ \.ie-segmented__label\s*\{\s*outline:\s*2px solid var\(--focus-outer\);/);
    expect(css).toMatch(/\.ie-file__input:focus-visible \+ \.ie-file__button\s*\{\s*outline:\s*2px solid var\(--focus-outer\);/);
  });
});
