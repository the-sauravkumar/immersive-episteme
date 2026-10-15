/**
 * The images rule (DR-020 addendum): images render only inside the KnowledgeSheet, through the
 * shared KnowledgeFigure, identically in both conditions. The museum never draws an in-world image
 * plane in a study build, even when the compiler declares one and its media are reviewed and
 * published with a licence.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { MuseumWorld } from "@/components/museum/three/world";
import { createMaterials, type LoadedTextures } from "@/components/museum/three/resources";
import { IN_WORLD_IMAGES, buildSceneModel } from "@/features/immersive/scene-model";
import { DEFAULT_RULE_SET, compileSpatialManifest, defaultRuleSetConfig, ruleSetUuid, type CompilerGraph } from "@/features/spatial/compiler";
import type { ExhibitAsset } from "@/features/spatial/compiler/types";

import { TRADITIONS, museumFixture } from "./fixtures";

function fakeTextures(): LoadedTextures {
  const t = (name: string) => Object.assign(new THREE.Texture(), { name });
  return { wall: { color: t("wall-color") }, floor: { color: t("floor-color") }, manifest: [], bytes: 0 };
}

describe("no in-world image planes in study builds", () => {
  const { bundle, manifest } = museumFixture();
  const graph = bundle as unknown as CompilerGraph;
  const base = buildSceneModel(manifest.manifest);
  const slugOf = new Map(base.rooms.map((r) => [r.id, r.traditionSlug]));
  // One reviewed, published, licensed figure per study tradition (the DR-020 shape).
  const picks = TRADITIONS.map((slug) => base.exhibits.find((e) => slugOf.get(e.roomId) === slug)).filter((e) => !!e).map((e) => ({ id: e.conceptId }));
  const assets: ExhibitAsset[] = picks.map((c, i) => ({ id: `asset-${i}`, conceptId: c.id, kind: i === 0 ? "diagram" : "image", uri: `https://media.example/${i}.jpg`, title: "Reviewed photograph", licence: "CC BY 4.0", width: 768, height: 512 }));
  const compiled = compileSpatialManifest({
    graph,
    snapshotVersion: graph.versionLabel,
    traditions: TRADITIONS,
    ruleSet: { id: ruleSetUuid(DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version), name: DEFAULT_RULE_SET.name, version: DEFAULT_RULE_SET.version, config: defaultRuleSetConfig() },
    seed: "default",
    assets,
  });
  const model = buildSceneModel(compiled.manifest);
  const withImage = model.exhibits.filter((e) => e.image);

  it("the rule is a constant, off", () => {
    expect(IN_WORLD_IMAGES).toBe(false);
  });

  it("the compiler declares the image planes, and the scene model reports every one as not drawn", () => {
    expect(picks.length).toBe(TRADITIONS.length);
    expect(withImage.length).toBe(picks.length);
    for (const e of withImage) {
      const r = model.report.find((x) => x.id === e.id)!;
      expect(r.as).not.toContain("exhibit.image");
      expect(r.notes.some((n) => n.includes("study builds draw no in-world image planes"))).toBe(true);
    }
  });

  it("the built museum has no mesh, material or texture for an image plane", () => {
    const world = new MuseumWorld(model, createMaterials(fakeTextures(), model.rooms[0]!.height), 1, () => ({ kicker: null, title: "" }));
    world.setResident(new Set(), 0);
    const names: string[] = [];
    world.root.traverse((o) => {
      names.push(o.name);
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const mat of [m].flat()) if (mat) names.push(mat.name, ((mat as THREE.MeshBasicMaterial).map?.name ?? ""));
    });
    expect(names.filter((n) => /image|photo|asset|media/i.test(n))).toEqual([]);
    // No image-plane vertices: nothing is built at any image surface's position.
    const imagePlanes = withImage.map((e) => e.image!);
    let inside = 0;
    world.root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      const pos = g?.getAttribute("position");
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        for (const p of imagePlanes) if (x > p.min[0] + 0.01 && x < p.max[0] - 0.01 && z > p.min[2] - 0.001 && z < p.max[2] + 0.001 && y > p.min[1] + 0.01 && y < p.max[1] - 0.01 && (p.min[0] === p.max[0] ? Math.abs(x - p.min[0]) < 1e-3 : Math.abs(z - p.min[2]) < 1e-3)) inside++;
      }
    });
    expect(inside).toBe(0);
    world.dispose();
  });

  it("the renderer has no code path that draws an exhibit's image surface", () => {
    const src = ["src/components/museum/three/world.ts", "src/components/museum/museum-scene.tsx", "src/components/museum/three/geometry.ts"].map((f) => readFileSync(join(process.cwd(), f), "utf8")).join("\n");
    expect(src).not.toMatch(/\.image\b(?!\s+as)/);
    expect(src).not.toMatch(/kind\s*===\s*"image"/);
  });
});
