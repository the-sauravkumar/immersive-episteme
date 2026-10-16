/**
 * The pure half of the C2c surface samplers (src/components/museum/probe-geometry.ts): the points
 * the GPU run reads on walls, floors, ceilings, reveals, sills and door edges, the pitch that frames
 * them, and the colour arithmetic. Checked here on the curated museum so a GPU run only executes.
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  C2C,
  WALL_CLEARANCE,
  ceilingGrid,
  columnPoints,
  contrastRatio,
  doorEdgePoints,
  doorOfRoom,
  fitPitch,
  fitView,
  jambs,
  labOfLinear,
  lumaLevels,
  ndcRectToPixels,
  planWallColumns,
  projectToNdc,
  quantile,
  relativeLuminance,
  revealPoints,
  signContrast,
  signInset,
  spread,
  srgb8ToLinear,
  thresholdPoints,
  viewTarget,
} from "@/components/museum/probe-geometry";
import { GALLERY_FINISH, chromaGain, COLOUR_MAP_MEAN, linearToSrgb, neutralToneMap, sceneValueFor, wallWash } from "@/components/museum/three/resources";
import { VISITOR, createRouter } from "@/features/immersive/navigation";
import { doorSigns } from "@/features/immersive/placement";
import { buildSceneModel } from "@/features/immersive/scene-model";
import { viewpoints } from "@/features/immersive/tour-path";
import { entranceDirectory } from "@/features/immersive/wayfinding";

import { museumFixture } from "./fixtures";

const model = buildSceneModel(museumFixture().manifest.manifest);
const router = createRouter(model.rooms, model.colliders);
const views = viewpoints(model, router);
const ASPECT = 1280 / 720;

/** A three.js camera posed as museum-scene.tsx poses it. */
function camera(pose: { x: number; z: number; yaw: number; pitch: number }) {
  const c = new THREE.PerspectiveCamera(VISITOR.fov, ASPECT, 0.05, 150);
  c.position.set(pose.x, VISITOR.eyeHeight, pose.z);
  c.rotation.set(pose.pitch, pose.yaw, 0, "YXZ");
  c.updateMatrixWorld(true);
  return c;
}

describe("colour arithmetic", () => {
  it("decodes sRGB, weighs luma and luminance, and rates contrast as WCAG does", () => {
    expect(srgb8ToLinear(0)).toBe(0);
    expect(srgb8ToLinear(255)).toBeCloseTo(1, 12);
    expect(srgb8ToLinear(188)).toBeCloseTo(0.5029, 3);
    expect(lumaLevels(205, 205, 205)).toBeCloseTo(205, 9);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 12);
    expect(contrastRatio(1, 0)).toBeCloseTo(21, 9);
    expect(contrastRatio(0.2, 0.5)).toBeCloseTo(contrastRatio(0.5, 0.2), 12);
  });

  it("gives neutral greys a* = b* = 0 and the finish's floor a warm, muted chroma", () => {
    for (const g of [0.05, 0.2, 0.6, 1]) {
      const l = labOfLinear([g, g, g]);
      expect(Math.abs(l.a)).toBeLessThan(0.02);
      expect(Math.abs(l.b)).toBeLessThan(0.02);
    }
    expect(labOfLinear([1, 1, 1]).L).toBeCloseTo(100, 2);
    // The floor's on-screen mean colour (as gallery-finish.test.ts computes it) reads C* 4-9, b* > 0.
    const v = sceneValueFor(GALLERY_FINISH.floorSrgb);
    const shown = chromaGain(COLOUR_MAP_MEAN.floor, GALLERY_FINISH.floorChroma).map((k) => neutralToneMap(v * k));
    const lab = labOfLinear(shown);
    expect(lab.b).toBeGreaterThan(0);
    expect(lab.C).toBeGreaterThan(3);
    expect(lab.C).toBeLessThan(10);
  });

  it("takes percentiles and spreads by the probe's rule", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i);
    expect(quantile(xs, 0.9)).toBe(90);
    expect(quantile(xs, 0.01)).toBe(1);
    expect(quantile(xs, 1)).toBe(99);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
    expect(spread([3])).toBe(0);
    expect(spread([205.5, 203.1, 204])).toBeCloseTo(2.4, 9);
  });

  it("reads paper and ink inside the plaque inset", () => {
    expect(signInset({ x0: 0, x1: 100, y0: 0, y1: 50 })).toEqual({ x0: 6, x1: 94, y0: 5, y1: 45 });
    const paper = Array.from({ length: 90 }, () => 1);
    const ink = Array.from({ length: 10 }, () => 0);
    expect(signContrast([...paper, ...ink])!.ratio).toBeCloseTo(21, 9);
    expect(signContrast([1, 0])).toBeNull();
  });

  it("clips a projected rectangle to the drawing buffer and drops one off screen", () => {
    expect(ndcRectToPixels([{ x: -0.5, y: -0.5 }, { x: 0.5, y: 0.5 }], 1280, 720)).toEqual({ x0: 320, x1: 960, y0: 180, y1: 540, clipped: false });
    expect(ndcRectToPixels([{ x: 0.5, y: 0 }, { x: 1.5, y: 0.5 }], 1280, 720)!.clipped).toBe(true);
    expect(ndcRectToPixels([{ x: 1.2, y: 0 }, { x: 1.5, y: 0.5 }], 1280, 720)).toBeNull();
  });
});

describe("camera arithmetic", () => {
  it("projects world points exactly as the museum's three.js camera does", () => {
    const poses = [
      { x: 1, z: 2, yaw: 0, pitch: 0 },
      { x: -3, z: 0.5, yaw: Math.PI / 2, pitch: 0.3 },
      { x: 4, z: -2, yaw: -2.1, pitch: -0.4 },
    ];
    const pts: [number, number, number][] = [
      [1.3, 2.2, -3],
      [-6, 0.1, 0.9],
      [2, 3.1, -5],
      [8, 0.4, -2.5],
    ];
    for (const pose of poses) {
      const cam = camera(pose);
      for (const p of pts) {
        const ours = projectToNdc(pose, VISITOR.eyeHeight, p, VISITOR.fov, ASPECT);
        const v = new THREE.Vector3(...p).applyMatrix4(cam.matrixWorldInverse);
        if (v.z >= 0) {
          expect(ours).toBeNull();
          continue;
        }
        const t = new THREE.Vector3(...p).project(cam);
        expect(ours!.x).toBeCloseTo(t.x, 9);
        expect(ours!.y).toBeCloseTo(t.y, 9);
      }
    }
  });

  it("keeps the view's pitch when the points fit, and tilts only as far as needed when they do not", () => {
    const pose = { x: 0, z: 0, yaw: 0, pitch: 0 };
    const ahead: [number, number, number][] = [[0, 1, -4]];
    expect(fitPitch(pose, VISITOR.eyeHeight, ahead, VISITOR.fov, ASPECT)).toBe(0);
    // A ceiling 1 m ahead and 1.6 m above the eye is out of a level 62 degree view; tilted, it fits.
    const high: [number, number, number][] = [
      [0, 3.2, -1],
      [0, 3.2, -3],
    ];
    const pitch = fitPitch(pose, VISITOR.eyeHeight, high, VISITOR.fov, ASPECT)!;
    expect(pitch).toBeGreaterThan(0);
    expect(pitch).toBeLessThanOrEqual(VISITOR.pitchLimit);
    for (const p of high) {
      const n = projectToNdc({ ...pose, pitch }, VISITOR.eyeHeight, p, VISITOR.fov, ASPECT)!;
      expect(Math.abs(n.y)).toBeLessThanOrEqual(0.88);
    }
    // Behind the eye, or spanning more than the view: no pitch.
    expect(fitPitch(pose, VISITOR.eyeHeight, [[0, 1, 3]], VISITOR.fov, ASPECT)).toBeNull();
    expect(fitPitch(pose, VISITOR.eyeHeight, [[0, 10, -0.5], [0, -10, -0.5]], VISITOR.fov, ASPECT)).toBeNull();
  });
});

describe("room-wall views: the wall, floor and ceiling columns", () => {
  const wallViews = views.filter((v) => v.kind === "room-wall");
  const plans = wallViews.map((v) => ({ v, plan: planWallColumns(model, v.roomId, v) }));

  it("finds a clear column on the wall ahead in every room", () => {
    expect(wallViews.length).toBe(model.rooms.length);
    const missing = plans.filter((p) => "reason" in p.plan).map((p) => `${p.v.id}: ${(p.plan as { reason: string }).reason}`);
    expect(missing).toEqual([]);
    const tiers = plans.map((p) => ("columns" in p.plan ? p.plan.columns[0]!.tier : -1));
    console.log(JSON.stringify({ firstColumnTier: Object.fromEntries(plans.map((p, i) => [p.v.id, tiers[i]])), columnsPerRoom: plans.map((p) => ("columns" in p.plan ? p.plan.columns.length : 0)) }));
  });

  it("puts the face on the room's interior edge, facing the camera, at a wall box that spans floor to ceiling", () => {
    for (const { v, plan } of plans) {
      if ("reason" in plan) continue;
      const { face } = plan;
      const room = model.rooms.find((r) => r.id === v.roomId)!;
      expect(face.depth - face.cameraDepth, v.id).toBeGreaterThan(0.5);
      // The wall point at the column, nudged 5 mm further, is inside a wall box of the museum.
      const walls = model.rooms.flatMap((r) => r.walls);
      for (const c of plan.columns.slice(0, 3)) {
        const [x, , z] = columnPoints(face, c).wall[1]!.p;
        const inside = { x: x + face.forward.x * 0.007, z: z + face.forward.z * 0.007 };
        const box = walls.find((w) => inside.x >= w.min[0] && inside.x <= w.max[0] && inside.z >= w.min[2] && inside.z <= w.max[2]);
        expect(box, `${v.id} column ${c.lateral}`).toBeDefined();
        expect(box!.min[1]).toBeLessThanOrEqual(0.05);
        expect(box!.max[1]).toBeGreaterThanOrEqual(room.height - 0.05);
      }
      // The outward normal points back at the camera.
      const n = face.facing === "+x" ? { x: 1, z: 0 } : face.facing === "-x" ? { x: -1, z: 0 } : face.facing === "+z" ? { x: 0, z: 1 } : { x: 0, z: -1 };
      expect(n.x * face.forward.x + n.z * face.forward.z).toBe(-1);
      expect(face.normalAxis).toBe(face.forward.x !== 0 ? "x" : "z");
    }
  });

  it("keeps every column clear of plates, signs, doorways and what stands on the floor, by its tier", () => {
    const directory = entranceDirectory(model).directory;
    const mounted = [...model.exhibits.map((e) => e.panel), ...model.labels.map((l) => l.sign), ...doorSigns(model).map((s) => s.sign), ...(directory ? [directory.board, ...directory.rows.map((r) => r.sign)] : [])];
    for (const { v, plan } of plans) {
      if ("reason" in plan) continue;
      const { face } = plan;
      for (const c of plan.columns.slice(0, 5)) {
        const t = WALL_CLEARANCE.tiers[c.tier]!;
        const pts = columnPoints(face, c);
        for (const k of [...pts.wall, ...pts.band]) {
          for (const m of mounted) {
            // A wall-mounted plane near this face does not cover the wall sample (with the tier's clearance).
            const lat = (p: readonly number[]) => p[0]! * face.right.x + p[2]! * face.right.z;
            const dep = (p: readonly number[]) => p[0]! * face.forward.x + p[2]! * face.forward.z;
            const near = Math.max(dep(m.min), dep(m.max)) >= face.depth - 0.7 && Math.min(dep(m.min), dep(m.max)) <= face.depth + 0.05;
            if (!near) continue;
            const lo = Math.min(lat(m.min), lat(m.max));
            const hi = Math.max(lat(m.min), lat(m.max));
            expect(lat(k.p) <= lo - t.wall + C2C.wallBand.halfWidth + 1e-6 || lat(k.p) >= hi + t.wall - C2C.wallBand.halfWidth - 1e-6, `${v.id} ${k.key} vs ${"id" in m ? m.id : "board"}`).toBe(true);
          }
        }
        // Floor samples stand on no plinth, stand or collider.
        for (const k of [...pts.floor, ...pts.floorRegion]) {
          const [x, , z] = k.p;
          const on = [...model.colliders, ...model.exhibits.flatMap((e) => (e.plinth ? [e.plinth] : []))].find((b) => x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]);
          expect(on, `${v.id} ${k.key}`).toBeUndefined();
        }
      }
    }
  });

  it("samples the wall at the spec's heights, the floor 5 cm and 1.5 m out, the ceiling 0.25 m and 2 m in", () => {
    const { v, plan } = plans.find((p) => "columns" in p.plan)!;
    if ("reason" in plan) throw new Error(v.id);
    const { face } = plan;
    const c = plan.columns[0]!;
    const pts = columnPoints(face, c);
    const dep = (p: readonly number[]) => p[0]! * face.forward.x + p[2]! * face.forward.z;
    const lat = (p: readonly number[]) => p[0]! * face.right.x + p[2]! * face.right.z;
    expect(pts.wall.map((k) => k.p[1])).toEqual([0.3, 1.9, 3.0]);
    for (const k of pts.wall) expect(face.depth - dep(k.p)).toBeCloseTo(0.002, 9);
    for (const k of pts.wall) expect(lat(k.p)).toBeCloseTo(c.lateral, 9);
    expect(face.depth - dep(pts.floor[0]!.p)).toBeCloseTo(C2C.floorNear, 9);
    expect(face.depth - dep(pts.floor[1]!.p)).toBeCloseTo(C2C.floorFar, 9);
    expect(pts.floor[0]!.p[1]).toBeCloseTo(face.floorY + 0.001, 9);
    expect(pts.ceiling.map((k) => face.depth - dep(k.p))).toEqual([expect.closeTo(C2C.ceilingNear, 9), expect.closeTo(C2C.ceilingIn, 9)]);
    expect(pts.ceiling[0]!.p[1]).toBeCloseTo(face.ceilingY! - 0.001, 9);
    // "Within 0.3 m of the cove": the near ceiling point lies between the cove's inner edge and 0.3 m past it.
    expect(C2C.ceilingNear).toBeGreaterThan(GALLERY_FINISH.cove.width);
    expect(C2C.ceilingNear).toBeLessThanOrEqual(GALLERY_FINISH.cove.width + 0.3);
    // The ceiling grid starts past the cove slot and stays inside the room.
    const grid = ceilingGrid(face, c, { cove: GALLERY_FINISH.cove.width, maxOut: 3.5, halfWidth: 1, step: 0.25 });
    expect(grid.length).toBeGreaterThan(0);
    for (const k of grid) {
      expect(face.depth - dep(k.p)).toBeGreaterThan(GALLERY_FINISH.cove.width);
      expect(lat(k.p)).toBeGreaterThan(face.lateral[0] + GALLERY_FINISH.cove.width);
      expect(lat(k.p)).toBeLessThan(face.lateral[1] - GALLERY_FINISH.cove.width);
    }
  });

  it("frames each group within the probe's column budget in every room (the wall level, the ceiling tilted where needed)", () => {
    const report: Record<string, Record<string, { offset: number; tier: number; pitchDeg: number; turnedDeg: number } | null>> = {};
    for (const { v, plan } of plans) {
      if ("reason" in plan) continue;
      const fit = (ps: { p: [number, number, number] }[]) => fitView(v, VISITOR.eyeHeight, ps.map((k) => k.p), VISITOR.fov, ASPECT, { limit: VISITOR.pitchLimit });
      const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 10) / 10;
      // As probe.ts searches: columns no direction can frame cost nothing; the first framed one is read.
      const first = (group: "wall" | "floor" | "ceiling") => {
        for (const c of plan.columns) {
          const d = fit(columnPoints(plan.face, c)[group]);
          if (d) return { offset: c.offset, tier: c.tier, pitchDeg: deg(d.pitch), turnedDeg: deg(Math.atan2(Math.sin(d.yaw - v.yaw), Math.cos(d.yaw - v.yaw))) };
        }
        return null;
      };
      report[v.id] = { wall: first("wall"), floor: first("floor"), ceiling: first("ceiling") };
      expect(report[v.id]!.wall, `${v.id} wall`).not.toBeNull();
      expect(report[v.id]!.floor, `${v.id} floor`).not.toBeNull();
      expect(report[v.id]!.ceiling, `${v.id} ceiling`).not.toBeNull();
      // The wall heights are read at the view's own (level) pitch.
      expect(report[v.id]!.wall!.pitchDeg, `${v.id} wall pitch`).toBe(0);
    }
    console.log(JSON.stringify({ framedColumns: report }));
  });

  it("predicts the rendered wall ratios the e2e asserts from the finish (the targets are reachable)", () => {
    const h = model.rooms[0]!.height;
    const wall = sceneValueFor(GALLERY_FINISH.wallSrgb);
    const at = (y: number) => linearToSrgb(neutralToneMap(wall * wallWash(y, h)));
    const [y03, y19, y30] = C2C.wallHeights;
    expect(Math.abs(at(y03) / at(y19) - 0.93)).toBeLessThanOrEqual(0.015);
    expect(Math.abs(at(y30) / at(y19) - 1.025)).toBeLessThanOrEqual(0.015);
  });
});

describe("doorways: reveals, sills and door edges", () => {
  const withFrame = model.portals.filter((p) => p.linings.length === 3);

  it("reads each jamb's reveal on the lining face along the opening, inside the wall thickness", () => {
    expect(withFrame.length).toBeGreaterThan(0);
    for (const p of withFrame) {
      const ai = p.axis === "z" ? 2 : 0;
      const ci = p.axis === "z" ? 0 : 2;
      const js = jambs(p);
      expect(js.map((j) => j.jamb)).toEqual(["a", "b"]);
      const rv = revealPoints(p);
      expect(rv.length).toBe(2);
      const [a, b] = js;
      for (const pt of rv[0]!.points) {
        expect(pt[ai]).toBeCloseTo(a!.box.max[ai]! + 0.001, 9);
        expect(pt[ci]).toBeGreaterThan(a!.box.min[ci]!);
        expect(pt[ci]).toBeLessThan(a!.box.max[ci]!);
        expect(pt[1]).toBeLessThan(a!.box.max[1]!);
      }
      for (const pt of rv[1]!.points) expect(pt[ai]).toBeCloseTo(b!.box.min[ai]! - 0.001, 9);
      // Both faces lie in the opening, facing each other.
      expect(a!.box.max[ai]!).toBeLessThan(b!.box.min[ai]!);
    }
  });

  it("reads the threshold sill inside its plane, and nothing for a doorway without one", () => {
    const p = model.portals.find((x) => x.threshold)!;
    const pts = thresholdPoints(p.threshold);
    expect(pts.length).toBe(12);
    for (const q of pts) {
      expect(q[0]).toBeGreaterThan(p.threshold!.min[0] - 1e-9);
      expect(q[0]).toBeLessThan(p.threshold!.max[0] + 1e-9);
      expect(q[2]).toBeGreaterThan(p.threshold!.min[2] - 1e-9);
      expect(q[2]).toBeLessThan(p.threshold!.max[2] + 1e-9);
      expect(q[1]).toBeCloseTo(p.threshold!.max[1] + 0.001, 9);
    }
    expect(thresholdPoints(null)).toEqual([]);
  });

  it("reads the 20 mm door edge on the room's side, against the wall beyond the opening", () => {
    const doorViews = views.filter((v) => v.kind === "room-door");
    expect(doorViews.length).toBeGreaterThan(0);
    for (const v of doorViews) {
      const p = doorOfRoom(model, v.roomId)!;
      expect(p.connects).toContain(v.roomId);
      if (p.linings.length !== 3) continue;
      const ci = p.axis === "z" ? 0 : 2;
      const ai = p.axis === "z" ? 2 : 0;
      const cam = v.x * (ci === 0 ? 1 : 0) + v.z * (ci === 2 ? 1 : 0);
      for (const j of doorEdgePoints(p, v)) {
        const box = jambs(p).find((x) => x.jamb === j.jamb)!.box;
        for (const r of j.rows) {
          // The edge face is the lining face nearer the camera, spanning the lining's 20 mm.
          const faceAt = r.edge[0][ci];
          expect(Math.abs(faceAt - cam)).toBeLessThan(Math.abs((faceAt === box.min[ci]! - 0.001 ? box.max[ci]! : box.min[ci]!) - cam));
          expect(Math.abs(r.edge[1][ai] - r.edge[0][ai])).toBeCloseTo(0.02, 9);
          // The wall point is 0.25 m outside the opening, on the same face.
          expect(r.wall[ci]).toBe(faceAt);
          const outside = j.jamb === "a" ? box.min[ai]! - r.wall[ai] : r.wall[ai] - box.max[ai]!;
          expect(outside).toBeCloseTo(0.25, 9);
        }
      }
    }
  });

  it("names the target of every C2c viewpoint id", () => {
    expect(viewTarget("room:ajrakh:tradition_context#wall")).toEqual({ kind: "wall", target: "room:ajrakh:tradition_context" });
    expect(viewTarget("portal:a:b#through")).toEqual({ kind: "through", target: "portal:a:b" });
    expect(viewTarget("room:lobby#door").kind).toBe("door");
    expect(viewTarget("x#approach").kind).toBe("other");
    for (const v of views.filter((x) => x.kind === "doorway")) expect(model.portals.some((p) => p.id === viewTarget(v.id).target)).toBe(true);
  });
});

