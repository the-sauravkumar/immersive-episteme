/**
 * P19 (DESIGN.md 12.4, 12.1 rule 1): both learning routes resolve the shared knowledge components
 * from the same module files, neither reaches a shared-folder module the other does not (apart
 * from the explained allow-list), and no condition folder keeps its own copy of a shared
 * component. The same check feeds the interface parity report (tests/e2e/parity.spec.ts).
 */
import { describe, expect, it } from "vitest";

import { importGraphParity, reachable, ROUTE_ROOTS, runtimeImports } from "./static-checks";

describe("P19: one source of truth for the shared components", () => {
  const result = importGraphParity();

  it("follows runtime imports only (type-only imports are no edge)", () => {
    expect(runtimeImports(`import type { A } from "@/a";\nimport { type B } from "@/b";\nimport { C, type D } from "@/c";\nexport { E } from "./e";\nconst F = dynamic(() => import("./f"));`)).toEqual(["@/c", "./e", "./f"]);
  });

  it("reaches the routes' own pages", () => {
    expect(reachable(ROUTE_ROOTS["2d"]).has("src/components/knowledge/knowledge-sheet.tsx")).toBe(true);
    expect(reachable(ROUTE_ROOTS.immersive).has("src/components/museum/overlays/info-panel.tsx")).toBe(true);
  });

  it("both routes import every shared module from the same file", () => {
    expect(result.shared.filter((s) => !(s.in2d && s.in3d))).toEqual([]);
  });

  it("no shared-folder module is reached by one route only", () => {
    expect(result.oneSided).toEqual([]);
  });

  it("no condition folder declares its own copy of a shared component", () => {
    expect(result.copies).toEqual([]);
  });
});
