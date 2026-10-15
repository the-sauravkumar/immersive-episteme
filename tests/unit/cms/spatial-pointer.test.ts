import { describe, expect, it } from "vitest";

import { applyPointer, checkOverride, parsePointer, PROTECTED_ELEMENT_FIELDS } from "../../../src/server/cms/spatial/pointer";
import { applyOverrides, overridesRuleSetName } from "../../../src/server/cms/spatial/service";
import type { CompiledManifest } from "../../../src/features/spatial/compiler";

const el = {
  id: "exhibit:a",
  kind: "exhibit",
  parentId: "room:1",
  conceptId: null,
  ruleId: "r1",
  label: "A",
  encodes: [],
  rationale: "why",
  trace: { conceptIds: [], relationshipIds: [], ruleIds: ["r1"], interactions: [], assessmentConstructIds: [] },
  position: { x: 1, y: 0, z: 2 },
  colliders: [{ id: "c", min: [0, 0, 0], max: [1, 1, 1] }],
};

describe("override JSON pointers", () => {
  it("parses RFC 6901 escapes", () => {
    expect(parsePointer("/a~1b/c~0d")).toEqual(["a/b", "c~d"]);
    expect(parsePointer("position")).toBeNull();
    expect(parsePointer("/")).toBeNull();
  });

  it("refuses every traceability field and anything under it", () => {
    for (const f of PROTECTED_ELEMENT_FIELDS) {
      const r = checkOverride(el, `/${f}`, (el as Record<string, unknown>)[f]);
      expect(r.ok, f).toBe(false);
    }
    expect(checkOverride(el, "/trace/ruleIds/0", "r2").ok).toBe(false);
    expect(checkOverride(el, "/__proto__/x", 1).ok).toBe(false);
  });

  it("requires an existing path and the same JSON type", () => {
    expect(checkOverride(el, "/position/w", 1).ok).toBe(false);
    expect(checkOverride(el, "/position/x", "1").ok).toBe(false);
    expect(checkOverride(el, "/position/x", Number.NaN).ok).toBe(false);
    const ok = checkOverride(el, "/position/x", 3.5);
    expect(ok).toEqual({ ok: true, segments: ["position", "x"], before: 1 });
    expect(checkOverride(el, "/colliders/0/max", [2, 2, 2]).ok).toBe(true);
    expect(checkOverride(el, "/colliders/3/max", [2, 2, 2]).ok).toBe(false);
  });

  it("applies without mutating the input", () => {
    const out = applyPointer(el, ["position", "x"], 9);
    expect(out.position.x).toBe(9);
    expect(el.position.x).toBe(1);
  });

  it("applyOverrides reports skipped overrides instead of guessing", () => {
    const manifest = { elements: [el] } as unknown as CompiledManifest;
    const r = applyOverrides(manifest, [
      { id: "o1", target_element_id: "exhibit:a", field: "/label", value: "B", reason: "clearer" },
      { id: "o2", target_element_id: "exhibit:missing", field: "/label", value: "C", reason: "x" },
      { id: "o3", target_element_id: "exhibit:a", field: "/ruleId", value: "r9", reason: "x" },
    ]);
    expect(r.applied).toEqual([{ id: "o1", elementId: "exhibit:a", field: "/label", before: "A", after: "B", reason: "clearer" }]);
    expect(r.skipped.map((s) => s.id)).toEqual(["o2", "o3"]);
    expect(r.manifest.elements[0]!.label).toBe("B");
    expect(manifest.elements[0]!.label).toBe("A");
  });

  it("names the override lineage once", () => {
    expect(overridesRuleSetName("knowledge-to-space-default")).toBe("knowledge-to-space-default+overrides");
    expect(overridesRuleSetName("knowledge-to-space-default+overrides")).toBe("knowledge-to-space-default+overrides");
  });
});
