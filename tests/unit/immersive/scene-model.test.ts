/**
 * Manifest -> scene mapping (src/features/immersive/scene-model.ts): every manifest element is
 * either drawn by a named part of the scene or reported with a reason; nothing is invented.
 */
import { describe, expect, it } from "vitest";

import { buildSceneModel, doorLinings, residentRooms, roomAt } from "@/features/immersive/scene-model";

import { museumFixture } from "./fixtures";

describe("manifest -> scene model", () => {
  const { manifest } = museumFixture();
  const model = buildSceneModel(manifest.manifest);

  it("compiles a valid manifest from the curated content", () => {
    expect(manifest.validation.passed).toBe(true);
  });

  it("accounts for every manifest element exactly once", () => {
    const ids = manifest.manifest.elements.map((e) => e.id).sort();
    expect(model.report.map((r) => r.id)).toEqual(ids);
    const silent = model.report.filter((r) => r.as.length === 0 && r.notes.length === 0);
    expect(silent).toEqual([]);
  });

  it("renders every element kind the compiler emits", () => {
    const unrendered = model.report.filter((r) => r.status !== "rendered");
    expect(unrendered.map((r) => `${r.id}: ${r.notes.join("; ")}`)).toEqual([]);
    const kinds = new Set(model.report.map((r) => r.kind));
    for (const k of ["zone", "room", "exhibit", "station", "portal", "path", "cue", "label", "landmark"]) expect(kinds.has(k)).toBe(true);
  });

  it("reports (does not draw) image planes whose media licence is unreviewed", () => {
    const withImage = manifest.manifest.elements.filter((e) => Array.isArray(e.surfaces) && (e.surfaces as { kind: string }[]).some((s) => s.kind === "image"));
    for (const e of withImage) {
      const r = model.report.find((x) => x.id === e.id)!;
      expect(r.notes.some((n) => n.includes("licence is not reviewed"))).toBe(true);
    }
  });

  it("takes every position, size and order from the manifest", () => {
    const els = new Map(manifest.manifest.elements.map((e) => [e.id, e]));
    for (const ex of model.exhibits) {
      const e = els.get(ex.id)!;
      expect(ex.position).toEqual({ x: (e.position as { x: number }).x, z: (e.position as { z: number }).z });
      expect(ex.panel.min).toEqual((e.surfaces as { kind: string; min: number[] }[]).find((s) => s.kind === "panel")!.min);
      expect(ex.conceptId).toBe(e.conceptId);
    }
    for (const p of model.paths) expect(p.stops).toEqual(els.get(p.id)!.stops);
    expect(model.rooms.length).toBe(manifest.manifest.elements.filter((e) => e.kind === "room").length);
    const landmark = manifest.manifest.elements.find((e) => e.kind === "landmark")!;
    expect(model.spawn).toEqual(landmark.spawn);
  });

  it("puts the visitor's spawn inside a room and keeps doorway neighbours resident", () => {
    const start = roomAt(model.rooms, model.spawn);
    expect(start).not.toBeNull();
    const res = residentRooms(model, start!.id, 1);
    expect(res.has(start!.id)).toBe(true);
    for (const n of start!.neighbours) expect(res.has(n.roomId)).toBe(true);
  });

  it("builds door linings that never overlap each other (no coplanar same-facing faces)", () => {
    for (const p of model.portals) {
      const l = doorLinings(p.id, p.axis, p.opening, p.height, 0.2);
      const [a, b, head] = l as [typeof l[0], typeof l[0], typeof l[0]];
      expect(a.max[1]).toBeLessThanOrEqual(head.min[1] + 1e-9);
      expect(b.max[1]).toBeLessThanOrEqual(head.min[1] + 1e-9);
    }
  });
});
