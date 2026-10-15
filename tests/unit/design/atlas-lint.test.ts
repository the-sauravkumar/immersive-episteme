/**
 * Atlas lint (DESIGN.md 13 "Contrast and colour" and 9; DR-022): the template tells and the raw
 * browser controls the redesign removed stay removed. Pure source scan of src/ (comments stripped),
 * so it runs with the unit tests; the visual result is measured by the e2e suites.
 *
 *  - no tracked uppercase labels (`uppercase`, positive `tracking-[…em]`);
 *  - no middle-dot joins (" · ") in source strings or JSX text;
 *  - no left-edge accent bars (`border-l-2`…`border-l-4`, `border-l-[Npx]`, inset left shadows);
 *  - no monospace outside code (`font-mono` only on the allowed JSON editors);
 *  - no raw browser controls: every <select> is the shared NativeSelect, no number spinner, the
 *    file input only inside FileInput, no `accent-color` checkboxes, and every <summary> belongs to
 *    the shared Disclosure or an allowed designed disclosure;
 *  - no decorative graphics (band, ticks, marker) and no shadows on surfaces.
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

const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/");

/** The 3D track's own files (scene, lettering, compiler) are checked by its own suites. */
const THREE_D = /^src\/(components\/museum\/three\/|components\/museum\/(museum-scene|museum-canvas)\.tsx$|features\/spatial\/)/;

const files = walk(path.join(ROOT, "src"))
  .map((f) => ({ rel: rel(f), text: stripComments(readFileSync(f, "utf8").replace(/\r\n/g, "\n")) }))
  .filter((f) => !THREE_D.test(f.rel));

function hits(pattern: RegExp, allow: readonly string[] = []): string[] {
  const out: string[] = [];
  const all = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (const f of files) {
    if (allow.includes(f.rel)) continue;
    for (const m of f.text.matchAll(all)) out.push(`${f.rel}:${f.text.slice(0, m.index ?? 0).split("\n").length}: ${m[0].slice(0, 80)}`);
  }
  return out;
}

describe("Atlas lint: template tells (DR-022)", () => {
  it("no uppercase labels and no positive letter tracking", () => {
    expect(hits(/(?<![\w-])uppercase(?![\w-])/)).toEqual([]);
    expect(hits(/(?<![\w-])tracking-\[0?\.\d+em\]/)).toEqual([]);
    expect(hits(/(?<![\w-])tracking-(?:wide|wider|widest)(?![\w-])/)).toEqual([]);
  });

  it('no middle-dot joins (" · ") in interface strings', () => {
    expect(hits(/ · /)).toEqual([]);
  });

  it("no left-edge accent bars", () => {
    // The vertical orientation of the Tabs primitive marks its active tab on the left edge, the
    // vertical equivalent of the underline; no page uses vertical tabs.
    expect(hits(/(?<![\w-])border-l-(?:2|3|4|\[\d+px\])(?![\w-])/, ["src/components/ui/tabs.tsx"])).toEqual([]);
    expect(hits(/shadow-\[inset_[234]px_0_0/)).toEqual([]);
  });

  it("no monospace outside code (the two JSON editors are code)", () => {
    expect(
      hits(/(?<![\w-])font-mono(?![\w-])/, [
        "src/app/(research)/research/assessments/[assessmentId]/page.tsx",
        "src/app/(research)/research/studies/[studyId]/page.tsx",
      ]),
    ).toEqual([]);
  });

  it("no decorative graphics and no surface shadows", () => {
    expect(hits(/\b(?:KnockoutBand|KnockoutField|RegistrationTicks|TickedFrame|TraditionMarker)\b/)).toEqual([]);
    expect(hits(/(?<![\w-])shadow-(?:sm|md|lg|xl|2xl|console|pop)(?![\w-])/)).toEqual([]);
    expect(hits(/(?<![\w-])(?:text|bg|border)-(?:madder|ochre|band)(?![\w-])/)).toEqual([]);
  });
});

describe("Atlas lint: no raw browser controls (DESIGN.md 9)", () => {
  it("every select is the shared NativeSelect", () => {
    expect(hits(/<select\b/, ["src/components/ui/native-select.tsx"])).toEqual([]);
  });

  it("no number spinners: numbers are text inputs with a numeric keyboard", () => {
    expect(hits(/type=["{]?"?number"?/)).toEqual([]);
  });

  it("the file input lives only inside FileInput", () => {
    expect(hits(/type="file"/, ["src/components/ui/file-input.tsx"])).toEqual([]);
  });

  it("checkboxes and radios use the shared skin, never accent-color", () => {
    expect(hits(/(?<![\w-])accent-(?:indigo|\(--indigo\))(?![\w-])/)).toEqual([]);
  });

  it("every <summary> is the shared Disclosure or an allowed designed disclosure", () => {
    expect(
      hits(/<summary\b/, [
        "src/components/ui/disclosure.tsx",
        // "About these links": the disclosure look with telemetry on toggle (shared by both conditions).
        "src/components/knowledge/relation-group-details.tsx",
        // The breadcrumb's "…" button that reveals the middle crumbs in place.
        "src/components/ui/breadcrumb.tsx",
      ]),
    ).toEqual([]);
  });
});
