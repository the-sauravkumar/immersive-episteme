import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripComments } from "./strip-comments";

const ROOT = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

describe("focus ring (DESIGN.md Section 6: 3 px turmeric outline, offset 2)", () => {
  it("no ui primitive carries outline-none", () => {
    const offenders = walk(path.join(ROOT, "src/components/ui")).filter((f) => /(?<![\w:-])outline-none(?![\w-])/.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("outline-none or outline-hidden only on programmatic focus targets (tabIndex -1)", () => {
    const BARE = /(?<![\w:-])outline-(?:none|hidden)(?![\w-])/g;
    const offenders: string[] = [];
    for (const f of walk(path.join(ROOT, "src"))) {
      const text = stripComments(readFileSync(f, "utf8"));
      for (const m of text.matchAll(BARE)) {
        const at = m.index ?? 0;
        let tagStart = -1;
        for (const t of text.slice(0, at).matchAll(/<[A-Za-z][\w.]*[\s>]/g)) tagStart = t.index ?? -1;
        const next = text.slice(at).search(/<\/?[A-Za-z]/);
        const element = tagStart === -1 ? "" : text.slice(tagStart, next === -1 ? undefined : at + next);
        if (/\btabIndex=\{-1\}/.test(element)) continue;
        offenders.push(`${rel(f)}:${text.slice(0, at).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no file removes the ring on focus or focus-visible", () => {
    const offenders = walk(path.join(ROOT, "src")).filter((f) => /\bfocus(?:-visible)?:outline-(?:none|hidden)\b/.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders.map(rel)).toEqual([]);
  });

  it("globals.css draws one turmeric ring everywhere and none on programmatic targets", () => {
    const css = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--turmeric\);\s*outline-offset:\s*2px;/);
    expect(css).toMatch(/\[tabindex="-1"\]:focus-visible\s*\{\s*outline:\s*none;/);
    expect(css).toMatch(/\.ie-segmented__input:focus-visible \+ \.ie-segmented__label\s*\{[^}]*outline:\s*3px solid var\(--turmeric\);/);
    expect(css).toMatch(/\.ie-file__input:focus-visible \+ \.ie-file__button\s*\{\s*outline:\s*3px solid var\(--turmeric\);/);
  });
});
