import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURES = ["src/features/process", "src/features/walkthrough", "src/features/course"];
const LAYER_RANK: Record<string, number> = { domain: 0, application: 1, infrastructure: 2, ui: 2 };
const FORBIDDEN_IN_INNER = [/from "three/, /from "react/, /from "next/, /from "pg/, /from "drizzle/, /@\/server/, /@\/components/];
const LINE_OR_BLOCK_COMMENT = /(^|\s)\/\/|\/\*/;

function filesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function layerOf(path: string): string | null {
  const parts = path.split(/[\\/]/);
  return parts.find((part) => part in LAYER_RANK) ?? null;
}

function withoutStrings(source: string): string {
  return source
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/\/(?![*/])(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, "0");
}

function outwardImports(file: string, source: string): string[] {
  const from = layerOf(file);
  const rank = LAYER_RANK[from ?? ""];
  if (rank === undefined) return [];
  const bad: string[] = [];
  for (const match of source.matchAll(/(?:from |import\()\s*"(\.[^"]+|@\/features\/[^"]+)"/g)) {
    const target = layerOf(match[1]!);
    if (!target || target === from) continue;
    if (LAYER_RANK[target]! >= rank) bad.push(`${relative(".", file)} -> ${match[1]}`);
  }
  return bad;
}

describe("clean architecture", () => {
  const files = FEATURES.flatMap(filesUnder);

  it("keeps every feature file inside a layer", () => {
    expect(files.filter((file) => layerOf(file) === null)).toEqual([]);
  });

  it("keeps domain and application free of frameworks", () => {
    const bad = files
      .filter((file) => (LAYER_RANK[layerOf(file) ?? ""] ?? 9) <= 1)
      .filter((file) => FORBIDDEN_IN_INNER.some((pattern) => pattern.test(readFileSync(file, "utf8"))));
    expect(bad).toEqual([]);
  });

  it("points every dependency inward, with ui and infrastructure apart", () => {
    expect(files.flatMap((file) => outwardImports(file, readFileSync(file, "utf8")))).toEqual([]);
  });

  it("catches a planted ui to infrastructure import and other outward imports", () => {
    const planted = (file: string, line: string) => outwardImports(file, line);
    expect(planted("src/features/walkthrough/ui/planted.tsx", `import { WalkRuntime } from "../infrastructure/walk-runtime";`)).toHaveLength(1);
    expect(planted("src/features/walkthrough/ui/planted.tsx", `import { WalkRuntime } from "@/features/walkthrough/infrastructure/walk-runtime";`)).toHaveLength(1);
    expect(planted("src/features/walkthrough/ui/planted.tsx", `const load = () => import("../infrastructure/walk-runtime");`)).toHaveLength(1);
    expect(planted("src/features/walkthrough/infrastructure/planted.ts", `import { WalkthroughSession } from "../ui/walkthrough-session";`)).toHaveLength(1);
    expect(planted("src/features/walkthrough/application/planted.ts", `import { WalkRuntime } from "../infrastructure/walk-runtime";`)).toHaveLength(1);
    expect(planted("src/features/walkthrough/domain/planted.ts", `import type { WalkEngine } from "../application/walk-engine";`)).toHaveLength(1);
    expect(planted("src/features/walkthrough/ui/planted.tsx", `import type { WalkEngine } from "../application/walk-engine";`)).toEqual([]);
    expect(planted("src/features/walkthrough/ui/planted.tsx", `import { practiceStation } from "../domain/route-plan";`)).toEqual([]);
    expect(planted("src/features/walkthrough/ui/planted.tsx", `import "./walkthrough.css";`)).toEqual([]);
    expect(planted("src/features/walkthrough/ui/planted.tsx", `import { Other } from "./other-ui";`)).toEqual([]);
  });

  it("has no comments in feature code", () => {
    const bad = files.filter((file) => LINE_OR_BLOCK_COMMENT.test(withoutStrings(readFileSync(file, "utf8"))));
    expect(bad).toEqual([]);
  });
});
