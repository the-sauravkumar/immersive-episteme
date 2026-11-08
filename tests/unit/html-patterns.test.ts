import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("HTML pattern attributes", () => {
  it("compile under the v flag that browsers apply, so client validation is never silently off", () => {
    const found = sources("src").flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\bpattern="([^"]+)"/g)].map((m) => ({ file, pattern: m[1]! })));
    expect(found.length).toBeGreaterThan(0);
    const invalid = found.filter(({ pattern }) => {
      try {
        new RegExp(`^(?:${pattern})$`, "v");
        return false;
      } catch {
        return true;
      }
    });
    expect(invalid).toEqual([]);
  });
});
