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

  it("points every dependency inward", () => {
    const bad: string[] = [];
    for (const file of files) {
      const rank = LAYER_RANK[layerOf(file) ?? ""];
      for (const match of readFileSync(file, "utf8").matchAll(/from "(\.[^"]+|@\/features\/[^"]+)"/g)) {
        const target = layerOf(match[1]!);
        if (target && rank !== undefined && LAYER_RANK[target]! > rank) bad.push(`${relative(".", file)} -> ${match[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("has no comments in feature code", () => {
    const bad = files.filter((file) => LINE_OR_BLOCK_COMMENT.test(withoutStrings(readFileSync(file, "utf8"))));
    expect(bad).toEqual([]);
  });
});
