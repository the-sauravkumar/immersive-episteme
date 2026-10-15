/**
 * Static parity checks over the source tree (DESIGN.md 12.4 P19 and P20, 12.1 rules 1-2), shared
 * by the unit tests in this folder and by tests/e2e/parity.spec.ts, which records their results in
 * the interface parity report. Pure file reading: no build, no database.
 *
 *  - P19 import graph: the runtime import graphs of the two learning routes (2D concept page and
 *    the 3D museum), followed through static, re-exported and dynamic imports (type-only imports
 *    are not runtime and are skipped), must resolve the shared knowledge components from the SAME
 *    module files. Any module of the shared folders that one route reaches must be reached by the
 *    other, and no condition folder may declare its own copy of a shared component (an adapter
 *    that maps data onto the shared one and imports it is allowed).
 *  - P20 string table: every learner-visible interface string table of either route lives in
 *    src/features/learning/strings.ts (or guidance.ts, which it re-exports), and no file on either
 *    route repeats one of the shared strings as its own literal.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(ROOT, "src");

const rel = (abs: string) => path.relative(ROOT, abs).replace(/\\/g, "/");

function read(abs: string): string {
  return readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Source without comments (a `//` inside a string such as a URL is kept). Block comments keep
 * their line breaks, so line numbers stay those of the file.
 */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, "")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function resolveFile(base: string): string | null {
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function resolveSpecifier(spec: string, fromFile: string): string | null {
  if (spec.startsWith("@/")) return resolveFile(path.join(SRC, spec.slice(2)));
  if (spec.startsWith("@db/")) return resolveFile(path.join(ROOT, "db", spec.slice(4)));
  if (spec.startsWith(".")) return resolveFile(path.resolve(path.dirname(fromFile), spec));
  return null; // a package
}

/** Runtime import specifiers of one file: static imports and re-exports (not `import type`), and dynamic import(). */
export function runtimeImports(text: string): string[] {
  const code = stripComments(text);
  const out: string[] = [];
  const stat = /(^|\n)\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of code.matchAll(stat)) {
    if (m[3]) continue; // `import type ... from` / `export type ... from`
    const clause = m[4] ?? "";
    // `import { type A, type B } from`: only types, no runtime edge.
    const braces = clause.match(/^\{([\s\S]*)\}$/);
    if (braces && braces[1]!.split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
    out.push(m[5]!);
  }
  for (const m of code.matchAll(/(^|\n)\s*import\s+["']([^"']+)["']/g)) out.push(m[2]!);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]!);
  return out;
}

/** Every source file reachable at runtime from `roots` (repository-relative paths). */
export function reachable(roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = roots.map((r) => path.join(ROOT, r));
  while (stack.length > 0) {
    const f = stack.pop()!;
    const key = rel(f);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!/\.(ts|tsx)$/.test(f)) continue;
    for (const spec of runtimeImports(read(f))) {
      const to = resolveSpecifier(spec, f);
      if (to && !seen.has(rel(to))) stack.push(to);
    }
  }
  return seen;
}

/** The layout chain and page of each learning route measured by the parity suite. */
export const ROUTE_ROOTS = {
  "2d": [
    "src/app/layout.tsx",
    "src/app/(learning)/learn/2d/layout.tsx",
    "src/app/(learning)/learn/2d/(content)/layout.tsx",
    "src/app/(learning)/learn/2d/(content)/concepts/[conceptKey]/page.tsx",
  ],
  immersive: ["src/app/layout.tsx", "src/app/(learning)/learn/immersive/layout.tsx", "src/app/(learning)/learn/immersive/page.tsx"],
} as const;

/** The modules both conditions must import from the same file (DESIGN.md 12.1 rule 1). */
export const SHARED_MODULES = [
  "src/components/knowledge/knowledge-sheet.tsx",
  "src/components/knowledge/sheet-parts.tsx",
  "src/components/knowledge/claim-list.tsx",
  "src/components/knowledge/knowledge-figure.tsx",
  "src/components/knowledge/figure-lightbox.tsx",
  "src/components/knowledge/structure-diagram.tsx",
  "src/components/knowledge/layer-tabs.tsx",
  "src/components/knowledge/layer-parts.tsx",
  "src/components/knowledge/concept-chooser.tsx",
  "src/components/knowledge/related-concepts.tsx",
  "src/components/knowledge/pager.tsx",
  "src/components/knowledge/state-message.tsx",
  "src/components/knowledge/tradition-marker.tsx",
  "src/components/citations/citation-disclosure.tsx",
  "src/components/citations/reference-list.tsx",
  "src/components/learning/study-bar.tsx",
  "src/components/learning/guidance.tsx",
  "src/components/learning/learning-phase.tsx",
  "src/components/learning/unverified-content-notice.tsx",
  "src/components/shell/learning-shell.tsx",
  "src/components/shell/display-settings.tsx",
  "src/features/learning/strings.ts",
  "src/features/learning/labels.ts",
] as const;

/** Folders whose modules are shared by construction: reaching one from one route only is asymmetric. */
const SHARED_FOLDERS = ["src/components/knowledge/", "src/components/learning/", "src/components/citations/"];

/**
 * Modules of the shared folders that only one route may reach, each with the reason. Kept empty
 * unless a difference is allowed by DESIGN.md 12.1 rule 3 or is dead code in both conditions.
 */
export const ONE_SIDED_ALLOWED: Readonly<Record<string, string>> = {
  "src/components/learning/onboarding.tsx":
    "Imported by the museum's OnboardingScreen, which is switched off (CONDITION_ONBOARDING = false in museum-app.tsx); neither condition shows an onboarding screen (P23: 0 in both).",
  "src/components/learning/index.ts": "Barrel file; the modules it re-exports are compared individually.",
};

/** Component names that exist once (12.1 rule 1); a condition folder may only adapt them. */
const SHARED_NAMES = [
  "KnowledgeSheet",
  "ClaimList",
  "CitedClaim",
  "CitationRecord",
  "ReferenceList",
  "KnowledgeFigure",
  "FigureLightbox",
  "LayerTabs",
  "LayeredField",
  "RelatedConcepts",
  "Pager",
  "StudyBar",
  "HintControl",
  "StallCue",
  "LearningTimer",
  "StateMessage",
  "Onboarding",
  "DisplaySettings",
  "SequenceList",
  "LayerConceptHead",
  "ComparisonBlocks",
  "ConceptChooser",
  "TraditionName",
];
const CONDITION_FOLDERS = ["src/features/learning-2d", "src/components/museum", "src/app/(learning)"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

export interface ImportGraphResult {
  /** Shared modules reached by each route. */
  shared: { module: string; in2d: boolean; in3d: boolean }[];
  /** Modules of the shared folders reached by one route only (not allowed). */
  oneSided: string[];
  /** Condition-folder declarations of a shared name that are not adapters of the shared one. */
  copies: string[];
  passed: boolean;
}

export function importGraphParity(): ImportGraphResult {
  const two = reachable(ROUTE_ROOTS["2d"]);
  const three = reachable(ROUTE_ROOTS.immersive);
  const shared = SHARED_MODULES.map((m) => ({ module: m, in2d: two.has(m), in3d: three.has(m) }));
  const oneSided = [...new Set([...two, ...three])]
    .filter((f) => SHARED_FOLDERS.some((d) => f.startsWith(d)))
    .filter((f) => two.has(f) !== three.has(f))
    .filter((f) => !(f in ONE_SIDED_ALLOWED))
    .sort();
  const copies: string[] = [];
  for (const dir of CONDITION_FOLDERS) {
    for (const f of walk(path.join(ROOT, dir))) {
      const code = stripComments(read(f));
      for (const name of SHARED_NAMES) {
        const declares = new RegExp(`(?:function|const|class)\\s+${name}\\b`).test(code);
        if (!declares) continue;
        // An adapter imports the shared component it adapts (aliased or re-exported).
        const adapts = new RegExp(`\\b${name}\\b[^;\\n]*from\\s+["']@/components/(?:knowledge|learning|citations)`).test(code) || new RegExp(`import\\s*\\{[^}]*\\b${name}\\s+as\\s+\\w+[^}]*\\}\\s*from\\s+["']@/components/`).test(code);
        if (!adapts) copies.push(`${rel(f)}: ${name}`);
      }
    }
  }
  const passed = shared.every((s) => s.in2d && s.in3d) && oneSided.length === 0 && copies.length === 0;
  return { shared, oneSided, copies, passed };
}

// ---------------------------------------------------------------------------------------
// P20: one string table
// ---------------------------------------------------------------------------------------

/** Where learner-visible interface wording of both conditions may be declared as a table. */
const STRING_MODULES = new Set(["src/features/learning/strings.ts", "src/features/learning/guidance.ts"]);

function flattenStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) flattenStrings(v, out);
  return out;
}

export interface StringTableResult {
  /** `const X_TEXT = {` tables declared on either route outside the strings module. */
  inlineTables: string[];
  /** Literals on either route that repeat a shared string instead of importing it. */
  duplicates: string[];
  passed: boolean;
}

/**
 * `tables` are the exported string tables of the strings module (the caller imports the module so
 * this file stays free of app imports).
 */
export function stringTableParity(tables: Readonly<Record<string, unknown>>): StringTableResult {
  const files = new Set([...reachable(ROUTE_ROOTS["2d"]), ...reachable(ROUTE_ROOTS.immersive)]);
  const inlineTables: string[] = [];
  const duplicates: string[] = [];
  // Shared strings worth guarding: several words (single words such as "Close" or "Next" are
  // common UI vocabulary of the console primitives too).
  const shared = new Set(flattenStrings(tables).filter((s) => s.trim().includes(" ") && s.length >= 8));
  for (const f of files) {
    if (STRING_MODULES.has(f) || !/\.(ts|tsx)$/.test(f) || !f.startsWith("src/")) continue;
    const code = stripComments(read(path.join(ROOT, f)));
    for (const m of code.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*_TEXT)\s*=\s*\{/g)) inlineTables.push(`${f}: ${m[1]}`);
    for (const m of code.matchAll(/(["'])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      if (shared.has(m[2]!)) duplicates.push(`${f}: "${m[2]}"`);
    }
  }
  return { inlineTables: inlineTables.sort(), duplicates: [...new Set(duplicates)].sort(), passed: inlineTables.length === 0 && duplicates.length === 0 };
}
