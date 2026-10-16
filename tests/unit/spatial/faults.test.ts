import { describe, expect, it } from "vitest";

import { compileSpatialManifest, defaultRuleSetConfig, revalidateManifest, SpatialCompileError, type Collider, type Point } from "@/features/spatial/compiler";

import { checkOf, defaultRuleSet, syntheticGraph, syntheticInput } from "./fixtures";

describe("synthetic baseline", () => {
  it("compiles cleanly", () => {
    const r = compileSpatialManifest(syntheticInput());
    const failed = r.validation.checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.details?.issues.join("; ")}`);
    expect(failed).toEqual([]);
    expect(r.manifest.elements.some((e) => e.id === "room:commons")).toBe(true);
    expect(r.manifest.elements.find((e) => e.id === "exhibit:demo-cmp.comparison.dyes")?.parentId).toBe("room:hall");
  });
});

describe("validation catches injected faults", () => {
  it("a PRECEDES cycle", () => {
    const g = syntheticGraph({ relationships: [{ source: "demo-alpha.process_stage.dye", target: "demo-alpha.process_stage.wash", type: "PRECEDES", ordinal: 3 }] });
    const r = compileSpatialManifest(syntheticInput(g));
    const c = checkOf(r, "process.ordering");
    expect(c.passed).toBe(false);
    expect(c.details!.issues.join(" ")).toMatch(/Cycle/);
    expect(r.validation.passed).toBe(false);
  });

  it("accepts an ordinal-less repeat loop on a cycle-allowing type, but reports it", () => {
    const g = syntheticGraph({ relationships: [{ source: "demo-alpha.process_stage.dye", target: "demo-alpha.process_stage.print", type: "PRECEDES" }] });
    const r = compileSpatialManifest(syntheticInput(g));
    expect(checkOf(r, "process.ordering").passed).toBe(true);
    expect(checkOf(r, "process.ordering-warnings").details!.issues.join(" ")).toMatch(/Repeat loop/);
    const path = r.manifest.elements.find((e) => e.id === "path:seq:demo-alpha.process_stage.wash")!;
    expect((path.loops as unknown[]).length).toBe(1);
    expect(r.validation.passed).toBe(true);
  });

  it("rejects the same loop when the relationship type forbids cycles", () => {
    const g = syntheticGraph({ relationships: [{ source: "demo-alpha.process_stage.dye", target: "demo-alpha.process_stage.print", type: "PRECEDES" }] });
    const strict = { ...g, relationshipTypes: g.relationshipTypes.map((t) => (t.code === "PRECEDES" ? { ...t, allowsCycles: false } : t)) };
    expect(checkOf(compileSpatialManifest(syntheticInput(strict)), "process.ordering").passed).toBe(false);
  });

  it("a gap in PRECEDES ordinals", () => {
    const g = syntheticGraph({
      concepts: [{ key: "demo-alpha.process_stage.finish", type: "process_stage", category: "process_stages", tradition: "demo-alpha" }],
      relationships: [{ source: "demo-alpha.process_stage.dye", target: "demo-alpha.process_stage.finish", type: "PRECEDES", ordinal: 5 }],
    });
    const c = checkOf(compileSpatialManifest(syntheticInput(g)), "process.ordering");
    expect(c.passed).toBe(false);
    expect(c.details!.issues.join(" ")).toMatch(/gap/i);
  });

  it("a relationship to a missing concept", () => {
    const g = syntheticGraph({ drop: ["demo-beta.outcome.colour"] });
    const r = compileSpatialManifest(syntheticInput(g));
    expect(checkOf(r, "concepts.missing").passed).toBe(false);
    expect(checkOf(r, "concepts.missing").details!.issues.join(" ")).toMatch(/demo-beta\.outcome\.colour/);
  });

  it("a selected tradition that does not exist", () => {
    const r = compileSpatialManifest(syntheticInput(undefined, { traditions: ["demo-alpha", "demo-gamma"] }));
    expect(checkOf(r, "concepts.missing").passed).toBe(false);
  });

  it("an unreachable room (entrance doorway walled up)", () => {
    const r = compileSpatialManifest(syntheticInput());
    expect(checkOf(r, "navigation.reachability").passed).toBe(true);
    const manifest = structuredClone(r.manifest);
    const entrance = manifest.elements.find((e) => e.id === "room:demo-alpha:tradition_context")!;
    const door = manifest.elements.find((e) => e.id === entrance.entranceDoorId)!;
    const { a, b } = door.opening as { a: Point; b: Point };
    // 0.1 m proud of the opening on every side, whichever way the doorway runs.
    const blocker: Collider = {
      id: "wall:injected",
      kind: "wall",
      min: [Math.min(a.x, b.x) - 0.1, 0, Math.min(a.z, b.z) - 0.1],
      max: [Math.max(a.x, b.x) + 0.1, 3, Math.max(a.z, b.z) + 0.1],
    };
    (entrance.colliders as Collider[]).push(blocker);
    // Re-validate the tampered manifest against the same inputs.
    const v = revalidateManifest(syntheticInput(), manifest);
    const reach = v.checks.find((c) => c.id === "navigation.reachability")!;
    expect(reach.passed).toBe(false);
    expect(reach.details!.issues.join(" ")).toMatch(/demo-alpha/);
    expect(v.checks.find((c) => c.id === "accessibility.doorways")!.passed).toBe(false);
  });

  it("an override that moves only an exhibit's position (plinth and approach left behind)", () => {
    const { manifest } = compileSpatialManifest(syntheticInput());
    const ex = manifest.elements.find((e) => e.kind === "exhibit")!;
    const pos = ex.position as { x: number; z: number };
    ex.position = { x: pos.x + 3, z: pos.z };
    const c = revalidateManifest(syntheticInput(), manifest).checks.find((x) => x.id === "geometry.exhibit-consistency")!;
    expect(c.passed).toBe(false);
    expect(c.details!.issues.join(" ")).toContain(`${ex.id}: position`);
  });

  it("an unsupported mapping rule", () => {
    const config = defaultRuleSetConfig();
    config.rules.push({ id: "teleport.magic", description: "x", match: { relationshipTypes: ["USES"] }, emit: { params: { strategy: "teleport" } }, priority: 0 });
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    expect(checkOf(r, "rules.supported").passed).toBe(false);
  });

  it("contradictory equal-priority rules", () => {
    const config = defaultRuleSetConfig();
    config.rules.push({
      id: "uses.as-threshold",
      description: "conflicts with association.adjacency for USES",
      match: { relationshipTypes: ["USES"] },
      emit: { encoding: "threshold", params: { strategy: "threshold" } },
      priority: 5,
    });
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    expect(checkOf(r, "rules.consistent").passed).toBe(false);
  });

  it("an inconsistent content version", () => {
    const r = compileSpatialManifest(syntheticInput(undefined, { snapshotVersion: "demo-synthetic-2" }));
    expect(checkOf(r, "content.versions").passed).toBe(false);
  });

  it("a relationship type with no mapping rule", () => {
    const config = defaultRuleSetConfig();
    config.rules = config.rules.filter((r) => r.id !== "science.contextual-depth");
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    const c = checkOf(r, "relationships.encoded");
    expect(c.passed).toBe(false);
    expect(c.details!.issues.join(" ")).toMatch(/SCIENTIFICALLY_EXPLAINED_BY/);
  });

  it("excessive navigation complexity (configurable threshold and severity)", () => {
    const config = defaultRuleSetConfig();
    config.layout = { complexity: { maxRooms: 3, severity: "error" } };
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    expect(checkOf(r, "navigation.complexity").passed).toBe(false);
  });

  it("rejects an invalid rule set or layout config up front", () => {
    const config = defaultRuleSetConfig();
    config.layout = { doorWidthh: 1 };
    expect(() => compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }))).toThrow(SpatialCompileError);
    const noZone = defaultRuleSetConfig();
    noZone.rules = noZone.rules.filter((r) => r.id !== "classification.zone");
    expect(() => compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(noZone) }))).toThrow(SpatialCompileError);
  });
});

