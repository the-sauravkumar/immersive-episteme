/**
 * Curation contract: the files in content/ (curated separately, still in progress) satisfy the
 * interchange format (content/FORMAT.md v1) losslessly. Read-only: never writes to content/.
 * No database needed. Skips files that do not exist yet.
 *
 * Runs in its own Vitest project ("content", `npm run test:content`) and its own CI job, so a
 * half-finished tradition file never turns the application's `npm test` red. The format itself
 * is guarded for the app by tests/unit/content-format-contract.test.ts (synthetic fixtures).
 *
 * Every test is self-contained: each one parses the files it needs (memoised), so running a
 * single test with `-t`, or a parse failure in one file, reports the real error.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RELATIONSHIP_TYPES } from "../../db/seeds/reference-data";
import {
  checkCrossFileReferences,
  contentPackageFileSchema,
  slugFromConceptKey,
  type ContentPackageFile,
} from "../../src/features/knowledge/contracts";

const CONTENT = join(process.cwd(), "content");

function contentFiles(): string[] {
  const files = [join(CONTENT, "shared", "craft-science.json"), join(CONTENT, "comparisons.json")];
  const tdir = join(CONTENT, "traditions");
  if (existsSync(tdir)) {
    for (const d of readdirSync(tdir)) files.push(join(tdir, d, "tradition.json"));
  }
  return files.filter((f) => existsSync(f));
}

const files = contentFiles();
const label = (file: string) => file.slice(CONTENT.length + 1);

type ParseResult = { ok: true; data: ContentPackageFile } | { ok: false; error: string };
const cache = new Map<string, ParseResult>();

function parseFile(file: string): ParseResult {
  const hit = cache.get(file);
  if (hit) return hit;
  let result: ParseResult;
  try {
    const parsed = contentPackageFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
    result = parsed.success
      ? { ok: true, data: parsed.data }
      : {
          ok: false,
          error: parsed.error.issues
            .slice(0, 10)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("\n"),
        };
  } catch (err) {
    result = { ok: false, error: `invalid JSON: ${(err as Error).message}` };
  }
  cache.set(file, result);
  return result;
}

/** All files parsed, or one error naming every file that does not parse. */
function parseAll(): ContentPackageFile[] {
  const parsed: ContentPackageFile[] = [];
  const failures: string[] = [];
  for (const f of files) {
    const r = parseFile(f);
    if (r.ok) parsed.push(r.data);
    else failures.push(`${label(f)} does not satisfy contentPackageFileSchema:\n${r.error}`);
  }
  if (failures.length > 0) throw new Error(failures.join("\n\n"));
  return parsed;
}

describe.skipIf(files.length === 0)("content/ interchange files", () => {
  it.each(files.map((f) => [label(f), f]))("%s satisfies contentPackageFileSchema", (_label, file) => {
    const r = parseFile(file);
    if (!r.ok) throw new Error(r.error);
  });

  it("references only known concepts and registered relationship types across files", () => {
    const parsed = parseAll();
    expect(checkCrossFileReferences(parsed)).toEqual([]);
    const registered = new Set(RELATIONSHIP_TYPES.map((t) => t.code));
    const unknown = parsed.flatMap((f) => f.relationships.filter((r) => !registered.has(r.type)).map((r) => r.type));
    expect(unknown).toEqual([]);
  });

  it("derives unique concept slugs and never marks imported content as verified", () => {
    const parsed = parseAll();
    const keys = parsed.flatMap((f) => f.concepts.map((c) => c.key));
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys.map(slugFromConceptKey)).size).toBe(keys.length);
    const states = new Set(parsed.flatMap((f) => [...f.concepts, ...f.relationships].map((x) => x.verification_state)));
    expect([...states].every((s) => s === "under_review" || s === "needs_evidence")).toBe(true);
    // No real content namespace may collide with the demo prefix.
    expect(keys.some((k) => k.startsWith("demo"))).toBe(false);
    expect(parsed.some((f) => f.slug.startsWith("demo"))).toBe(false);
  });

  it("only uses ordinals on PRECEDES (the only ordered type)", () => {
    const parsed = parseAll();
    const bad = parsed.flatMap((f) => f.relationships.filter((r) => r.ordinal != null && r.type !== "PRECEDES"));
    expect(bad).toEqual([]);
  });
});
