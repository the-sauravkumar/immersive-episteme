/**
 * Floor contact shading on every wall that bounds a room (review finding spatial-4). The compiler
 * files a wall shared by two rooms under one of them only; the floor bake used to take only the
 * room's own list, so in 20 of 24 rooms some wall bases had a dark contact band and others none
 * (about a 30% step inside one room). Measured on the study manifest with the renderer's own bake.
 */
import { describe, expect, it } from "vitest";

import { bakeRoomLight, GALLERY_FINISH } from "@/components/museum/three/resources";
import { wallsBoundingRect } from "@/components/museum/three/world";
import { buildSceneModel } from "@/features/immersive/scene-model";

import { museumFixture } from "./fixtures";

const model = buildSceneModel(museumFixture().manifest.manifest);
const allWalls = model.rooms.flatMap((r) => r.walls);

/** Mean raw value of the texel row or column along each edge of the bake (row 0 is the max-z edge). */
function edgeMeans(b: { values: Float32Array; w: number; h: number }) {
  const at = (i: number, j: number) => b.values[j * b.w + i]!;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const cols = Array.from({ length: b.w }, (_, i) => i);
  const rows = Array.from({ length: b.h }, (_, j) => j);
  return { s: mean(cols.map((i) => at(i, 0))), n: mean(cols.map((i) => at(i, b.h - 1))), w: mean(rows.map((j) => at(0, j))), e: mean(rows.map((j) => at(b.w - 1, j))) };
}

describe("floor contact shading (finding spatial-4)", () => {
  it("darkens the base of every wall that bounds a room, whichever room the wall is filed under", () => {
    const report: Record<string, string> = {};
    let ownedShort = 0;
    for (const r of model.rooms) {
      if (!r.floor) continue;
      const rect = { minX: r.floor.min[0], maxX: r.floor.max[0], minZ: r.floor.min[2], maxZ: r.floor.max[2] };
      const opts = { ...GALLERY_FINISH.floorContact, sign: -1 as const };
      const fixed = edgeMeans(bakeRoomLight(rect, wallsBoundingRect(allWalls, rect), opts));
      const owned = edgeMeans(bakeRoomLight(rect, r.walls, opts));
      if (Math.max(owned.n, owned.s, owned.w, owned.e) > 0.8) ownedShort++;
      report[r.id] = [fixed.n, fixed.s, fixed.w, fixed.e].map((v) => v.toFixed(2)).join("/");
      // Every edge runs along a wall (broken only by doorways): a contact band on all four. With the
      // DR-047 contact (0.42 over 0.40 m) the edge texels sit at 0.61 to 0.69 of the room's mean.
      for (const [side, v] of Object.entries(fixed)) expect(v, `${r.id} ${side}`).toBeLessThan(0.72);
      // And the four edges agree within a room (the doorways are the only difference).
      const vals = Object.values(fixed);
      expect(Math.max(...vals) - Math.min(...vals), r.id).toBeLessThan(0.1);
    }
    console.log(JSON.stringify({ edgeMeansNSWE: report, roomsShortOfWallsWithOwnListOnly: ownedShort }));
    // The defect the fix removes is present in the compiler's per-room lists.
    expect(ownedShort).toBeGreaterThan(0);
  });

  it("leaves out a wall of the next room that meets this room's wall from outside", () => {
    const rect = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const own = { min: [-0.1, 0, -0.1], max: [10.1, 3, 0.1] };
    const outside = { min: [4.9, 0, -5], max: [5.1, 3, -0.1 - 0.2] };
    expect(wallsBoundingRect([own, outside], { ...rect, minZ: 0.1 })).toEqual([own]);
  });
});
