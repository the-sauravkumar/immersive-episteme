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
  GALLERY_FINISH,
  LIGHTMAP_RANGE,
  createMaterials,
  faceShade,
  linearToSrgb,
  neutralToneMap,
  preToneMap,
  sceneValueFor,
  srgbToLinear,
  wallWash,
  type LoadedTextures,
} from "@/components/museum/three/resources";
import { MuseumWorld } from "@/components/museum/three/world";

import { museumFixture } from "./fixtures";

const luminance = (hex: string) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

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

  it("uses one floor program and one ceiling program for every room", () => {
    const floors = meshes.filter((m) => m.name.startsWith("floor:")).map((m) => m.material as THREE.MeshBasicMaterial);
    const ceilings = meshes.filter((m) => m.name.startsWith("ceiling:")).map((m) => m.material as THREE.MeshBasicMaterial);
    expect(new Set(floors.map((m) => m.customProgramCacheKey())).size).toBe(1);
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

  it("marks visited plates without touching the architecture", () => {
    const before = world.stats.architectureTriangles;
    const id = model.exhibits[0]!.id;
    expect(world.setVisited([id])).toBe(false); // no lettering resident in this test: nothing rebuilt
    expect(world.visitedIds()).toEqual([id]);
    expect(world.stats.architectureTriangles).toBe(before);
    world.setVisited([]);
    expect(world.visitedIds()).toEqual([]);
  });
});
