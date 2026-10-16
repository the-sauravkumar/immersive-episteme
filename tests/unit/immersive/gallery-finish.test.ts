/**
 * Gallery finish (DR-023; DESIGN-v2 §11 F1 to F11): one parameter set for every wing, the rendered
 * targets it encodes, the shared wall-wash profile and the per-room light maps normalised to one mean.
 * The rendered frame is measured by the GPU checks (immersive-rendering.spec.ts, C2/C2b); these
 * tests pin the configuration and the arithmetic those targets rest on.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildSceneModel } from "@/features/immersive/scene-model";
import {
  COLOUR_MAP_MEAN,
  GALLERY_FINISH,
  LIGHTMAP_RANGE,
  LUMA,
  bakeRoomLight,
  chromaGain,
  createMaterials,
  faceShade,
  linearToSrgb,
  neutralToneMap,
  plasterTint,
  preToneMap,
  sceneValueFor,
  srgbToLinear,
  wallWash,
  type LoadedTextures,
} from "@/components/museum/three/resources";
import { MuseumWorld, wallsBoundingRect } from "@/components/museum/three/world";

import { museumFixture } from "./fixtures";

const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Rendered 8-bit sRGB of a neutral plaster surface at scene value `v` (Neutral tone mapping, exposure 1). */
const rendered = (v: number) => linearToSrgb(neutralToneMap(v));

/** three 0.186.1 NeutralToneMapping for an RGB colour (the frame's OutputPass). */
function neutralToneMapRgb(c: readonly number[]): number[] {
  const x = Math.min(...c);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  const o = c.map((v) => v - offset);
  const peak = Math.max(...o);
  const start = 0.8 - 0.04;
  if (peak < start) return o;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + d - start);
  const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return o.map((v) => (v * newPeak) / peak).map((v) => v * (1 - g) + newPeak * g);
}

/** CIELAB (D65) of a display-linear sRGB colour. */
function lab(rgb: readonly number[]): { L: number; a: number; b: number; C: number } {
  const [r, g, b] = rgb as [number, number, number];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const L = 116 * f(Y) - 16;
  const a = 500 * (f(X) - f(Y));
  const bb = 200 * (f(Y) - f(Z));
  return { L, a, b: bb, C: Math.hypot(a, bb) };
}

function fakeTextures(): LoadedTextures {
  const t = (name: string) => {
    const x = new THREE.Texture();
    x.name = name;
    return x;
  };
  return { wall: { color: t("wall-color") }, floor: { color: t("floor-color") }, manifest: [], bytes: 0 };
}

describe("gallery finish: one parameter set", () => {
  it("has no zone, tradition or room key anywhere in the finish configuration", () => {
    const keys: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
        keys.push(`${path}${k}`);
        walk(v, `${path}${k}.`);
      }
    };
    walk(GALLERY_FINISH, "");
    expect(keys.filter((k) => /zone|tradition|room|wing|ajrakh|sanganeri|kalamkari/i.test(k))).toEqual([]);
  });

  it("encodes the DR-023 targets: wall 200-210, floor at most 0.3 x the wall, door edge at least 3:1 on 200-210 walls", () => {
    expect(GALLERY_FINISH.wallSrgb).toBeGreaterThanOrEqual(200);
    expect(GALLERY_FINISH.wallSrgb).toBeLessThanOrEqual(210);
    const wallL = srgbToLinear(GALLERY_FINISH.wallSrgb);
    const floorL = srgbToLinear(GALLERY_FINISH.floorSrgb);
    expect(floorL / wallL).toBeLessThanOrEqual(0.3);
    expect((wallL - floorL) / wallL).toBeGreaterThanOrEqual(0.7); // Smithsonian contrast
    for (const w of [200, 205, 210]) expect(ratio(luminance(GALLERY_FINISH.doorEdge), srgbToLinear(w))).toBeGreaterThanOrEqual(3);
    expect(GALLERY_FINISH.shadowSrgb).toBeGreaterThanOrEqual(35);
    expect(GALLERY_FINISH.shadowSrgb).toBeLessThanOrEqual(45);
    expect(GALLERY_FINISH.coveLinear).toBeLessThan(0.8);
    expect(GALLERY_FINISH.cove.width).toBe(0.15);
    expect(GALLERY_FINISH.skirting).toEqual({ height: 0.025, depth: 0.015 });
    expect(GALLERY_FINISH.doorEdgeWidth).toBe(0.02);
    expect(GALLERY_FINISH.plinthToe).toEqual({ height: 0.03, inset: 0.02 });
  });

  it("white plates on the wall clear the 1.5:1 card-to-wall design floor (F2)", () => {
    for (const w of [200, 205, 210]) expect(ratio(1, srgbToLinear(w))).toBeGreaterThanOrEqual(1.5);
  });

  it("inverts the Neutral tone mapping exactly, so every target renders as specified", () => {
    for (let s = 1; s < 255; s += 7) {
      const o = srgbToLinear(s);
      expect(neutralToneMap(preToneMap(o))).toBeCloseTo(o, 9);
    }
    expect(linearToSrgb(neutralToneMap(sceneValueFor(205)))).toBeCloseTo(205, 6);
  });

  it("keeps the wall wash flat (within 3%) across the 1.55-2.25 m card band, darker at the skirting, brighter at the cove", () => {
    const h = 3.2;
    const band = Array.from({ length: 71 }, (_, i) => wallWash(1.55 + i * 0.01, h));
    expect(Math.max(...band) / Math.min(...band) - 1).toBeLessThan(0.03);
    for (const v of band) expect(Math.abs(v - 1)).toBeLessThan(0.03);
    expect(wallWash(0.01, h)).toBeLessThan(0.9);
    expect(wallWash(h, h)).toBeGreaterThan(1.05);
  });

  it("makes the wash visible (DR-047): the rendered wall falls 14 levels by 0.3 m and rises 11 by 3.1 m, flat across the card band", () => {
    const h = 3.2;
    const wall = sceneValueFor(GALLERY_FINISH.wallSrgb);
    // The spec's calculator (visual-pass/calc.cjs), rendered 8-bit sRGB.
    const target: [number, number][] = [
      [0.05, 176.8],
      [0.3, 190.6],
      [0.8, 201.0],
      [1.9, 205.0],
      [2.8, 209.0],
      [3.1, 215.8],
      [3.2, 219.8],
    ];
    for (const [y, v] of target) expect(rendered(wall * wallWash(y, h)), `y ${y}`).toBeCloseTo(v, 1);
    const band = Array.from({ length: 71 }, (_, i) => wallWash(1.55 + i * 0.01, h));
    expect(Math.max(...band) / Math.min(...band) - 1).toBeLessThan(0.0115);
    for (const v of band) expect(Math.abs(v - 1)).toBeLessThan(0.006);
    // The rendered ratios C2c reads on the frame: L(0.3)/L(1.9) 0.930 and L(3.0)/L(1.9) 1.025 (8-bit sRGB, +/- 0.015).
    const at = (y: number) => rendered(wall * wallWash(y, h));
    expect(Math.abs(at(0.3) / at(1.9) - 0.93)).toBeLessThan(0.015);
    expect(Math.abs(at(3.0) / at(1.9) - 1.025)).toBeLessThan(0.015);
    // The top stays well below clipping and the cove slot is unchanged (C2).
    expect(at(h)).toBeLessThan(225);
    expect(GALLERY_FINISH.coveLinear).toBe(0.72);
  });

  it("finishes the floor as a muted oak at the same luminance, and keeps walls neutral", () => {
    const floor = COLOUR_MAP_MEAN.floor;
    // chromaGain never moves the luminance, whatever the amount of hue.
    for (const k of [0, 0.3, 1]) {
      const g = chromaGain(floor, k);
      expect(LUMA[0] * g[0] + LUMA[1] * g[1] + LUMA[2] * g[2]).toBeCloseTo(1, 12);
    }
    expect(chromaGain(floor, 0)).toEqual([1, 1, 1]);
    expect(GALLERY_FINISH.floorChroma).toBe(0.3);
    expect(GALLERY_FINISH.floorDetail).toBe(0.7);
    // The floor's mean colour on screen: the neutral target times the chroma gain, tone mapped.
    const v = sceneValueFor(GALLERY_FINISH.floorSrgb);
    const shown = neutralToneMapRgb(chromaGain(floor, GALLERY_FINISH.floorChroma).map((g) => v * g));
    const L = lab(shown);
    expect(L.C).toBeGreaterThanOrEqual(4);
    expect(L.C).toBeLessThanOrEqual(9);
    expect(L.b).toBeGreaterThan(0);
    // Mean luminance unchanged: sRGB 100 +/- 2, so floor/wall stays 0.21 (<= 0.3, contrast >= 70%).
    expect(Math.abs(linearToSrgb(LUMA[0] * shown[0]! + LUMA[1] * shown[1]! + LUMA[2] * shown[2]!) - GALLERY_FINISH.floorSrgb)).toBeLessThan(2);
    // The walls: map mean times the neutral gain is grey, so a* and b* are 0 (DR-023: no warm cast).
    const w = sceneValueFor(GALLERY_FINISH.wallSrgb);
    const wallShown = neutralToneMapRgb(COLOUR_MAP_MEAN.wall.map((m) => (w / m) * m));
    const W = lab(wallShown);
    expect(Math.abs(W.a)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(W.b)).toBeLessThanOrEqual(1.5);
    console.log(JSON.stringify({ floorLab: { L: +L.L.toFixed(2), a: +L.a.toFixed(2), b: +L.b.toFixed(2), C: +L.C.toFixed(2) }, wallLab: { a: +W.a.toFixed(3), b: +W.b.toFixed(3) } }));
  });

  it("gives the ceiling a cove-lit edge: stored edge/centre 1.239, and the reveal, sill and contact at their targets", () => {
    const c = GALLERY_FINISH.ceilingCove;
    expect(GALLERY_FINISH.ceilingSrgb).toBe(188);
    const v = (d: number) => 1 + c.strength * Math.exp(-d / c.falloff);
    expect(v(0.2) / v(4)).toBeCloseTo(1.239, 3);
    // Reveal: a plaster step under the wall (rendered 182 in the card band); threshold a sill at
    // 0.5 x the wall's linear luminance.
    expect(GALLERY_FINISH.revealSrgb).toBe(182);
    expect(GALLERY_FINISH.thresholdSrgb).toBe(150);
    expect(srgbToLinear(GALLERY_FINISH.thresholdSrgb) / srgbToLinear(GALLERY_FINISH.wallSrgb)).toBeCloseTo(0.5, 1);
    expect(GALLERY_FINISH.thresholdSrgb).toBeGreaterThan(GALLERY_FINISH.floorSrgb);
    // The door edge still clears 3:1 against the reveal and the wall (the 20 mm edge leads).
    expect(ratio(luminance(GALLERY_FINISH.doorEdge), srgbToLinear(GALLERY_FINISH.revealSrgb))).toBeGreaterThanOrEqual(3);
    // Floor contact, one wall, before normalising: 0.62 at 5 cm, 0.88 at 0.5 m.
    const f = GALLERY_FINISH.floorContact;
    const k = (d: number) => 1 - f.strength * Math.exp(-d / f.falloff);
    expect(Math.abs(k(0.05) - 0.62)).toBeLessThan(0.015);
    expect(Math.abs(k(0.5) - 0.88)).toBeLessThan(0.005);
  });

  it("shades faces by orientation only, identically everywhere", () => {
    expect(faceShade([0, 0, 1])).toBe(1);
    expect(faceShade([0, 0, -1])).toBe(1);
    expect(faceShade([1, 0, 0])).toBe(faceShade([-1, 0, 0]));
    expect(faceShade([0, -1, 0])).toBeLessThan(1);
  });
});

describe("gallery finish: the built museum", () => {
  const model = buildSceneModel(museumFixture().manifest.manifest);
  const mats = createMaterials(fakeTextures(), model.rooms[0]!.height);
  const world = new MuseumWorld(model, mats, 1, () => ({ kicker: null, title: "" }));
  const meshes: THREE.Mesh[] = [];
  world.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  it("gives every wall, plinth and reveal mesh one material with one shared wall-wash profile instance", () => {
    const arch = meshes.filter((m) => /^(walls|plinths|trims):/.test(m.name));
    expect(arch.length).toBeGreaterThan(0);
    for (const m of arch) {
      expect(m.material).toBe(mats.wall);
      expect((m.material as THREE.MeshBasicMaterial).lightMap).toBe(mats.wallProfile);
    }
    expect(mats.plinth).toBe(mats.wall);
    expect(mats.trim).toBe(mats.wall);
  });

  it("normalises every room's floor and ceiling light map to one mean (within 1%)", () => {
    expect(world.lightMeans.length).toBe(model.rooms.filter((r) => r.floor).length + model.rooms.filter((r) => r.ceiling).length);
    for (const kind of ["floor", "ceiling"] as const) {
      const means = world.lightMeans.filter((m) => m.kind === kind).map((m) => m.mean);
      expect(Math.max(...means) / Math.min(...means) - 1).toBeLessThan(0.01);
      for (const m of means) expect(Math.abs(m - 1)).toBeLessThan(0.01);
    }
    expect(LIGHTMAP_RANGE).toBeGreaterThan(1.2);
  });

  it("brightens every ceiling towards the cove: edge texels at least 1.20 x the centre texels, in every room", () => {
    const allWalls = model.rooms.flatMap((r) => r.walls);
    const report: Record<string, number> = {};
    for (const r of model.rooms) {
      if (!r.ceiling) continue;
      const rect = { minX: r.ceiling.min[0], maxX: r.ceiling.max[0], minZ: r.ceiling.min[2], maxZ: r.ceiling.max[2] };
      const b = bakeRoomLight(rect, wallsBoundingRect(allWalls, rect), { ...GALLERY_FINISH.ceilingCove, sign: 1 });
      const edge: number[] = [];
      const centre: number[] = [];
      for (let j = 0; j < b.h; j++) {
        const z = rect.maxZ - ((j + 0.5) / b.h) * (rect.maxZ - rect.minZ);
        for (let i = 0; i < b.w; i++) {
          const x = rect.minX + ((i + 0.5) / b.w) * (rect.maxX - rect.minX);
          const d = Math.min(x - rect.minX, rect.maxX - x, z - rect.minZ, rect.maxZ - z);
          if (d <= 0.2) edge.push(b.values[j * b.w + i]!);
          else if (d > 2) centre.push(b.values[j * b.w + i]!);
        }
      }
      if (edge.length === 0 || centre.length === 0) continue;
      const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
      report[r.id] = +(mean(edge) / mean(centre)).toFixed(3);
      expect(mean(edge) / mean(centre), r.id).toBeGreaterThanOrEqual(1.2);
    }
    expect(Object.keys(report).length).toBeGreaterThan(0);
    console.log(JSON.stringify({ ceilingEdgeOverCentre: report }));
  });

  it("renders the reveals and the threshold sill at their targets (finish tints)", () => {
    const F = GALLERY_FINISH;
    const wall = sceneValueFor(F.wallSrgb);
    expect(rendered(wall * world.finish!.reveal * wallWash(1.9, model.rooms[0]!.height))).toBeCloseTo(F.revealSrgb, 6);
    expect(rendered(wall * world.finish!.threshold * wallWash(0, model.rooms[0]!.height) * F.faceShade.top)).toBeCloseTo(F.thresholdSrgb, 6);
    expect(world.finish!.reveal).toBeCloseTo(plasterTint(F.revealSrgb) / wallWash(1.9, model.rooms[0]!.height), 9);
  });

  it("hangs the lobby directory on one board merged into the lobby's wall mesh (no new draw call), clickable as the directory", () => {
    const lobby = model.rooms.find((r) => r.id === "room:lobby")!;
    const walls = world.pickables.find((p) => p.mesh.name === `walls:${lobby.zoneId}`)!;
    const n = (walls.mesh.geometry.index?.count ?? 0) / 3;
    const owners = Array.from({ length: n }, (_, f) => walls.ownerOf(f));
    // The board is one chamfered box (30 triangles), owned by the directory; the rest is wall.
    expect(owners.filter((o) => o?.kind === "sign" && o.id === "directory:board").length).toBe(30);
    expect(owners.filter((o) => o?.kind === "wall").length).toBe(n - 30);
    // No plinth mesh for a zone without plinths: the board adds no mesh (draw call).
    const zonesWithPlinths = new Set(model.exhibits.filter((e) => e.plinth).map((e) => model.rooms.find((r) => r.id === e.roomId)!.zoneId));
    expect(meshes.filter((m) => m.name.startsWith("plinths:")).map((m) => m.name.slice("plinths:".length)).sort()).toEqual([...zonesWithPlinths].sort());
  });

  it("uses one floor program and one ceiling program for every room", () => {
    const floors = meshes.filter((m) => m.name.startsWith("floor:")).map((m) => m.material as THREE.MeshBasicMaterial);
    const ceilings = meshes.filter((m) => m.name.startsWith("ceiling:")).map((m) => m.material as THREE.MeshBasicMaterial);
    expect(new Set(floors.map((m) => m.customProgramCacheKey())).size).toBe(1);
    expect(floors[0]!.customProgramCacheKey()).toBe("ie-floor-v2");
    expect(new Set(floors.map((m) => m.color.getHexString())).size).toBe(1);
    expect(new Set(ceilings.map((m) => m.color.getHexString())).size).toBe(1);
  });

  it("is unlit: no light-dependent material in the architecture", () => {
    for (const m of meshes) expect((m.material as THREE.Material).type).toBe("MeshBasicMaterial");
  });

  it("stays inside the low-spec geometry budget and reports its size", () => {
    console.log(JSON.stringify({ architectureTriangles: world.stats.architectureTriangles, architectureMeshes: world.stats.architectureMeshes, finishTints: world.finish }));
    // Budget: 400k triangles on the low tier (immersive-rendering-quality.md §2a); the whole building is far below.
    expect(world.stats.architectureTriangles).toBeLessThan(100_000);
  });

  it("keeps the visited set without a plate mark or an architecture change (PLATE_VISITED_MARK off)", () => {
    const before = world.stats.architectureTriangles;
    const id = model.exhibits[0]!.id;
    expect(world.setVisited([id])).toBe(false); // no lettering resident in this test: nothing rebuilt
    expect(world.visitedIds()).toEqual([id]);
    expect(world.stats.architectureTriangles).toBe(before);
    world.setVisited([]);
    expect(world.visitedIds()).toEqual([]);
  });
});
