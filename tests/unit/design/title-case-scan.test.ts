import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { titleCase } from "@/lib/text/title-case";

import { stripComments } from "./strip-comments";

const ROOT = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

export function headings(code: string): { tag: string; inner: string; index: number }[] {
  const out: { tag: string; inner: string; index: number }[] = [];
  for (const m of code.matchAll(/<(h[123]|Heading)\b(?:=>|[^<>])*?>([\s\S]*?)<\/\1>/g)) out.push({ tag: m[1]!, inner: m[2]!, index: m.index ?? 0 });
  return out;
}

function children(inner: string): string {
  return inner.replace(/<\/?[A-Za-z][\w.]*(?:=>|[^<>])*?\/?>|<\/?>/g, "  ");
}

function expressions(raw: string): string[] {
  const inner = children(raw);
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "{") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) out.push(inner.slice(start, i).trim());
    }
  }
  return out;
}

function literalText(raw: string): string[] {
  const noExpr = children(raw).replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "  ");
  return noExpr
    .split(/\s{2,}|\n/)
    .map((s) => s.trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

const NOT_PHRASES: readonly { file: RegExp; expr: RegExp; why: string }[] = [
  { file: /./, expr: /^(?:children|props\.children)$/, why: "a wrapper that receives already title-cased children from its callers (each caller's heading is checked where it is written)" },
  { file: /./, expr: /^(?:icon|Icon|marker|heading|title)$/, why: "a node prop whose callers pass titleCase(...) or an element (checked at the call site)" },
  { file: /./, expr: /^["'`]\s*["'`]$|^" "$|^' '$|^["'`][·:,)(–—-]?\s*["'`]$/, why: "a space or punctuation" },
  { file: /./, expr: /\.length$|\bcount\b|\.toLocaleString\(|\bformat\(|^\d+$|^[a-z]\w*(?:Count|Total|Index|Number|N)$/, why: "a number" },
  { file: /./, expr: /^$/, why: "an empty expression (a JSX comment)" },
  { file: /./, expr: /^[\w.!]+\s*(?:===?\s*[\w."']+\s*)?\?\s*:\s*(?:null)?$/, why: "a choice between two elements (icons), no text" },
  { file: /consent\/page\.tsx$/, expr: /^consent\.version$/, why: "a version identifier, kept verbatim" },
  { file: /spatial\/studio\.tsx$/, expr: /^ex\.element\.kind$/, why: "a manifest element kind code in parentheses after the title-cased label (an identifier)" },
  { file: /page-heading\.tsx$/, expr: /verbatim/, why: "the learner's own search words, shown verbatim after the title-cased heading" },
];

function titleCasedNames(code: string): Set<string> {
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:const|let)\s+(\w+)\s*=\s*titleCase\(/g)) out.add(m[1]!);
  for (const m of code.matchAll(/(\w+)\s*:\s*titleCase\(/g)) out.add(m[1]!);
  return out;
}

const files = walk(path.join(ROOT, "src")).map((f) => f.replace(/\\/g, "/")).filter((f) => !/src\/features\/(course|walkthrough)\//.test(f));

describe("every h1-h3 in src/ passes through titleCase()", () => {
  it("finds headings to check", () => {
    const n = files.reduce((s, f) => s + headings(stripComments(readFileSync(f, "utf8"))).length, 0);
    expect(n).toBeGreaterThan(50);
  });

  it("literal heading text is Title Case and every heading expression is title-cased", () => {
    const problems: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
      if (!/<(?:h[123]|Heading)\b/.test(code)) continue;
      const derived = titleCasedNames(code);
      const where = (index: number) => `${path.relative(ROOT, f).replace(/\\/g, "/")}:${code.slice(0, index).split("\n").length}`;
      for (const h of headings(code)) {
        for (const text of literalText(h.inner)) {
          if (titleCase(text) !== text) problems.push(`${where(h.index)} literal "${text}" (Title Case: "${titleCase(text)}")`);
        }
        for (const expr of expressions(h.inner)) {
          if (/\btitleCase\w*\(/.test(expr)) continue;
          const root = expr.replace(/^\(|\)$/g, "").split(/[.?[(\s]/)[0]!;
          if (derived.has(root)) continue;
          if (NOT_PHRASES.some((n) => n.file.test(f) && n.expr.test(expr))) continue;
          problems.push(`${where(h.index)} {${expr.replace(/\s+/g, " ").slice(0, 80)}}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
