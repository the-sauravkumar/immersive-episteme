/**
 * Scripts in the curated content (DESIGN.md 5.1). No Indic webfont is loaded while content/
 * holds no Indic characters; this test fails as soon as one appears, so the team adds the matching
 * Noto Serif face (preload off, single script subset) for EVERY script present, never for one
 * tradition only. Arabic-script text (a Sindhi/Persian quote) renders through the system stack
 * inside `lang` and `dir`, identically in both conditions, and is counted here for the record.
 *
 * Read-only: never writes to content/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CONTENT = join(process.cwd(), "content");

function jsonFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) jsonFiles(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Unicode blocks of the Indic scripts the platform could meet (DESIGN.md 5.1). */
const INDIC: Record<string, RegExp> = {
  Devanagari: /[ऀ-ॿ꣠-ꣿ]/gu,
  Bengali: /[ঀ-৿]/gu,
  Gurmukhi: /[਀-੿]/gu,
  Gujarati: /[઀-૿]/gu,
  Oriya: /[଀-୿]/gu,
  Tamil: /[஀-௿]/gu,
  Telugu: /[ఀ-౿]/gu,
  Kannada: /[ಀ-೿]/gu,
  Malayalam: /[ഀ-ൿ]/gu,
};
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/gu;

describe("scripts in content/ (DESIGN.md 5.1)", () => {
  const files = jsonFiles(CONTENT);
  const text = files.map((f) => readFileSync(f, "utf8")).join("\n");

  it("reads the curated files", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("holds no Indic-script character (no Indic webfont is loaded)", () => {
    const found = Object.entries(INDIC)
      .map(([script, re]) => [script, (text.match(re) ?? []).length] as const)
      .filter(([, n]) => n > 0)
      .map(([script, n]) => `${script}: ${n}`);
    expect(found, "add the matching Noto Serif face for every script found, for all traditions").toEqual([]);
  });

  it("counts the Arabic-script characters (rendered through the system stack with lang and dir)", () => {
    const n = (text.match(ARABIC) ?? []).length;
    // Recorded, not limited: the count documents what the system stack has to render.
    expect(n).toBeGreaterThanOrEqual(0);
  });
});
