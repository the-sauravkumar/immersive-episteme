import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REVEALING_PHRASES } from "../../fixtures/blinding";

const PARTICIPANT_SURFACE = [
  "src/app/layout.tsx",
  "src/app/error.tsx",
  "src/app/global-error.tsx",
  "src/app/not-found.tsx",
  "src/app/(public)",
  "src/app/(study)",
  "src/app/(learning)",
  "src/components/public",
  ...["error-state", "gate-fallback", "learning-shell", "page-header", "public-nav", "public-shell", "sign-in-form", "state-page", "study-shell"].map((name) => `src/components/shell/${name}.tsx`),
  "src/components/study",
  "src/config",
  "src/lib/text",
  "src/features/learning",
  "src/features/process/domain/guidance.ts",
  "src/server/public",
  "db/seeds/demo.ts",
];

function files(path: string): string[] {
  const full = join(process.cwd(), path);
  if (statSync(full).isFile()) return [path];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

describe("participant-reachable surface is blind to the study design (DR-132)", () => {
  it.each(PARTICIPANT_SURFACE.flatMap(files).filter((f) => /\.tsx?$/.test(f)))("%s names no second way to learn", (file) => {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    expect(text.match(REVEALING_PHRASES)?.[0] ?? null).toBeNull();
  });

  it("catches the phrases it guards against", () => {
    for (const leak of ["Try both ways of learning", "the two conditions", "Door 2", "a visual course and a walkthrough", "the learning condition you were allocated to"]) {
      expect(leak).toMatch(REVEALING_PHRASES);
    }
  });
});
