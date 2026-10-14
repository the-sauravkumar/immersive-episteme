import { describe, expect, it } from "vitest";

import {
  compileSpatialManifest,
  conceptUuid,
  defaultRuleSetConfig,
  deterministicUuid,
  revalidateManifest,
  type CompileInput,
  type CompiledManifest,
} from "@/features/spatial/compiler";
import type { Surface } from "@/features/spatial/compiler/render";
import type { RoomStreaming, ZoneStreaming } from "@/features/spatial/compiler/streaming";

import { checkOf, compileContent, contentInput, defaultRuleSet, syntheticInput } from "./fixtures";

const surfacesOf = (m: CompiledManifest) => m.elements.flatMap((e) => ((e.surfaces as Surface[] | undefined) ?? []).map((s) => ({ e, s })));
const checkIn = (v: ReturnType<typeof revalidateManifest>, id: string) => v.checks.find((c) => c.id === id)!;

function withImage(width: number | null, height: number | null): CompileInput {
  return syntheticInput(undefined, {
    assets: [{ id: deterministicUuid("asset", "demo-img"), conceptId: conceptUuid("demo-alpha.material.dye"), kind: "image", uri: "https://example.org/demo.jpg", width, height }],
  });
}

describe("rendering quality (immersive-rendering-quality.md C6)", () => {
  const result = compileContent();
  const { manifest } = result;

  it("real content: no coplanar overlapping faces, panels proud, unscaled metre-mapped surfaces", () => {
    for (const id of ["render.coplanar-faces", "render.panel-offset", "render.textures", "render.axis-aligned"]) {
      const c = checkOf(result, id);
      expect(c.passed, `${id}: ${c.details?.issues[0]}`).toBe(true);
    }
    expect(checkOf(result, "render.coplanar-faces").details!.faces as number).toBeGreaterThan(2500);
  });

  it("records a >= 1.5 mm wall offset and a polygonOffset hint on every wall-mounted plane", () => {
    const mounted = surfacesOf(manifest).filter(({ s }) => s.kind === "panel" || s.kind === "sign" || s.kind === "image");
    expect(mounted.length).toBeGreaterThan(250);
    for (const { s } of mounted) {
      expect(s.wallOffset!).toBeGreaterThanOrEqual(0.0015);
      expect(s.polygonOffset).toEqual({ factor: -1, units: -1 });
    }
    for (const e of manifest.elements.filter((x) => x.kind === "exhibit" || x.kind === "station")) {
      expect(e.wallOffset as number).toBeGreaterThanOrEqual(0.0015);
      expect((e.surfaces as Surface[]).some((s) => s.kind === "panel")).toBe(true);
    }
  });

  it("expresses repeated parts as typed, parameterised boxes that can be instanced", () => {
    const boxes = manifest.elements.flatMap((e) => [...((e.colliders as { part?: string; partKey?: string }[]) ?? []), ...((e.renderBoxes as { part?: string; partKey?: string }[]) ?? [])]);
    expect(boxes.every((b) => b.part && b.partKey)).toBe(true);
    const plinthKeys = new Set(boxes.filter((b) => b.part === "plinth").map((b) => b.partKey));
    expect(plinthKeys.size).toBe(1); // every plinth shares one geometry
    expect(boxes.filter((b) => b.part === "door-lintel").length).toBe(manifest.elements.filter((e) => e.kind === "portal").length);
    for (const p of manifest.elements.filter((e) => e.kind === "portal")) expect((p.frame as { part: string }).part).toBe("door-frame");
  });

  it("catches an injected coplanar overlap and names both elements", () => {
    const m = structuredClone(manifest);
    const room = m.elements.find((e) => e.id === "room:ajrakh:process_sequence")!;
    const floor = (room.surfaces as Surface[]).find((s) => s.kind === "floor")!;
    const exhibit = m.elements.find((e) => e.parentId === room.id && e.kind === "station")!;
    // A floor-coloured decal 0.5 mm above the floor, overlapping it: classic z-fighting.
    (exhibit.surfaces as Surface[]).push({ ...floor, id: `${exhibit.id}#decal`, min: [floor.min[0], 0.0005, floor.min[2]], max: [floor.min[0] + 1, 0.0005, floor.min[2] + 1] });
    const v = revalidateManifest(compileContentInput(), m);
    const c = checkIn(v, "render.coplanar-faces");
    expect(c.passed).toBe(false);
    expect(c.details!.offendingElementIds).toEqual(expect.arrayContaining([room.id, exhibit.id]));
    expect(v.passed).toBe(false);
  });

  it("catches an injected flush (0 mm) wall panel", () => {
    const m = structuredClone(manifest);
    const exhibit = m.elements.find((e) => e.id === "station:ajrakh.process_stage.saaj")!;
    const panel = (exhibit.surfaces as Surface[]).find((s) => s.kind === "panel")!;
    const axis = { x: 0, y: 1, z: 2 }[panel.facing[1] as "x" | "y" | "z"] as 0 | 2;
    const sign = panel.facing[0] === "+" ? 1 : -1;
    const flushAt = panel.min[axis] - sign * panel.wallOffset!; // back onto the wall face
    panel.min[axis] = flushAt;
    panel.max[axis] = flushAt;
    panel.wallOffset = 0;
    const v = revalidateManifest(compileContentInput(), m);
    const offset = checkIn(v, "render.panel-offset");
    expect(offset.passed).toBe(false);
    expect(offset.details!.issues.join(" ")).toMatch(/station:ajrakh\.process_stage\.saaj/);
    expect(checkIn(v, "render.coplanar-faces").passed).toBe(false);
  });

  it("fails a rule set that mounts panels flush to the wall", () => {
    const config = defaultRuleSetConfig();
    config.layout = { panelOffset: 0 };
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    expect(checkOf(r, "render.panel-offset").passed).toBe(false);
    expect(checkOf(r, "render.coplanar-faces").passed).toBe(false);
  });

  it("sizes image planes to the declared aspect and catches distortion and non-uniform scale", () => {
    const r = compileSpatialManifest(withImage(1600, 900));
    expect(checkOf(r, "render.textures").passed).toBe(true);
    expect(checkOf(r, "render.image-aspect-declared").details!.issues).toEqual([]);
    const ex = r.manifest.elements.find((e) => e.id === "exhibit:demo-alpha.material.dye")!;
    const img = (ex.surfaces as Surface[]).find((s) => s.kind === "image")!;
    const horiz = img.facing[1] === "x" ? 2 : 0;
    // Within the C6 tolerance (+-0.5%) after mm rounding of the plane extents.
    expect(Math.abs((img.max[horiz] - img.min[horiz]) / (img.max[1] - img.min[1]) / (16 / 9) - 1)).toBeLessThanOrEqual(0.005);
    expect(img.aspectRatio).toBeCloseTo(16 / 9, 5);

    const m = structuredClone(r.manifest);
    const mex = m.elements.find((e) => e.id === ex.id)!;
    const mimg = (mex.surfaces as Surface[]).find((s) => s.kind === "image")!;
    mimg.max[1] = mimg.max[1] + 0.1; // stretch vertically
    mex.scale = [1, 1.2, 1];
    const v = revalidateManifest(withImage(1600, 900), m);
    const c = checkIn(v, "render.textures");
    expect(c.passed).toBe(false);
    expect(c.details!.issues.join(" ")).toMatch(/aspect/);
    expect(c.details!.issues.join(" ")).toMatch(/scale/);
  });

  it("warns when an image has no declared aspect ratio (content has no pixel sizes)", () => {
    const r = compileSpatialManifest(withImage(null, null));
    const c = checkOf(r, "render.image-aspect-declared");
    expect(c.passed).toBe(true);
    expect(c.details!.issues.length).toBe(1);
  });
});

describe("streaming units (immersive-rendering-quality.md §2a-2b)", () => {
  const result = compileContent();
  const { manifest } = result;
  const byId = new Map(manifest.elements.map((e) => [e.id, e]));

  it("makes every room a self-contained unit with symmetric doorway adjacency and counts", () => {
    expect(checkOf(result, "streaming.units").passed).toBe(true);
    for (const r of manifest.elements.filter((e) => e.kind === "room")) {
      const s = r.streaming as RoomStreaming;
      expect(s.unit).toBe("room");
      expect(s.elementIds).toContain(r.id);
      expect(s.counts.doorways).toBe(s.neighbours.length);
      expect(s.counts.exhibits).toBe(manifest.elements.filter((e) => (e.kind === "exhibit" || e.kind === "station") && e.parentId === r.id).length);
      for (const n of s.neighbours) expect((byId.get(n.roomId)!.streaming as RoomStreaming).neighbours.some((m) => m.roomId === r.id)).toBe(true);
    }
  });

  it("summarises each zone with its rooms, neighbouring zones and counts", () => {
    const wing = byId.get("zone:ajrakh")!.streaming as ZoneStreaming;
    expect(wing.roomIds.length).toBeGreaterThanOrEqual(5);
    expect(wing.neighbours.map((n) => n.zoneId)).toEqual(["zone:comparison"]);
    expect(wing.counts.exhibits).toBeGreaterThan(50);
    const hall = byId.get("zone:comparison")!.streaming as ZoneStreaming;
    expect(hall.neighbours.map((n) => n.zoneId)).toEqual(expect.arrayContaining(["zone:ajrakh", "zone:entrance", "zone:shared"]));
  });

  it("warns (without failing) when a unit exceeds the configured exhibit budget", () => {
    const config = defaultRuleSetConfig();
    config.layout = { unitExhibitBudget: 2 };
    const r = compileSpatialManifest(syntheticInput(undefined, { ruleSet: defaultRuleSet(config) }));
    const c = checkOf(r, "streaming.unit-budget");
    expect(c.passed).toBe(true);
    expect(c.details!.issues.length).toBeGreaterThan(0);
    expect(r.validation.passed).toBe(true);
  });
});

const compileContentInput = () => contentInput({ seed: "seed-a" });
