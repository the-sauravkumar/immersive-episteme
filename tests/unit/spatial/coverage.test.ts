import { describe, expect, it } from "vitest";

import { compileSpatialManifest } from "@/features/spatial/compiler";
import { manifestValidationSchema, spatialManifestSchema } from "@/features/spatial/contracts";

import { checkOf, compileContent, contentInput, DEFAULT_TRADITIONS, loadContent } from "./fixtures";

describe("coverage of the real content (ajrakh + sanganeri + machilipatnam-kalamkari)", () => {
  const result = compileContent();
  const { manifest, validation } = result;
  const content = loadContent();
  const selectedIds = new Set(content.graph.traditions.filter((t) => (DEFAULT_TRADITIONS as readonly string[]).includes(t.slug)).map((t) => t.id));

  it("passes every error-level validation check", () => {
    const failed = validation.checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.details?.issues.slice(0, 3).join("; ")}`);
    expect(failed).toEqual([]);
    expect(validation.passed).toBe(true);
  });

  it("places every concept of the selected traditions exactly once", () => {
    const traditionConcepts = content.graph.concepts.filter((c) => c.traditionId && selectedIds.has(c.traditionId));
    expect(traditionConcepts.length).toBeGreaterThan(200);
    const exhibitByConcept = new Map<string, number>();
    for (const e of manifest.elements) {
      if ((e.kind === "exhibit" || e.kind === "station") && e.conceptId) exhibitByConcept.set(e.conceptId, (exhibitByConcept.get(e.conceptId) ?? 0) + 1);
    }
    for (const c of traditionConcepts) expect(exhibitByConcept.get(c.id), c.key).toBe(1);
  });

  it("reports every unplaced shared or comparison concept explicitly, with a reason", () => {
    const traced = new Map(manifest.traceability.concepts.map((t) => [t.key, t]));
    for (const c of content.graph.concepts) {
      if (c.traditionId && !selectedIds.has(c.traditionId)) continue; // other traditions: not selected
      const t = traced.get(c.key);
      expect(t, c.key).toBeDefined();
      if (t!.status !== "placed") expect(t!.reason, c.key).toBeTruthy();
    }
    expect(validation.coverage!.concepts.placed).toBe(validation.coverage!.concepts.total);
  });

  it("encodes every in-scope relationship", () => {
    expect(validation.coverage!.relationships.encoded).toBe(validation.coverage!.relationships.total);
    expect(validation.coverage!.relationships.total).toBeGreaterThan(350);
    expect(checkOf(result, "relationships.encoded").passed).toBe(true);
  });

  it("conforms to the spatial contracts", () => {
    expect(spatialManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifestValidationSchema.safeParse(validation).success).toBe(true);
    for (const e of manifest.elements) expect(e.id).toMatch(/^[a-z0-9][a-z0-9_.:-]{0,127}$/);
  });

  it("compiles every tradition on its own with every concept placed and all checks passing", () => {
    for (const t of content.graph.traditions) {
      const r = compileSpatialManifest(contentInput({ traditions: [t.slug] }));
      const failed = r.validation.checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.details?.issues[0]}`);
      expect(failed, t.slug).toEqual([]);
      expect(r.validation.coverage!.concepts.placed).toBe(r.validation.coverage!.concepts.total);
    }
  });

  it("gives each selected tradition a wing with distinguishable category zones", () => {
    for (const slug of DEFAULT_TRADITIONS) {
      const zone = manifest.elements.find((e) => e.id === `zone:${slug}`);
      expect(zone?.kind).toBe("zone");
      const rooms = manifest.elements.filter((e) => e.kind === "room" && e.parentId === `zone:${slug}`);
      expect(rooms.length).toBeGreaterThanOrEqual(5);
      expect(new Set(rooms.map((r) => r.group)).size).toBe(rooms.length);
    }
  });
});
