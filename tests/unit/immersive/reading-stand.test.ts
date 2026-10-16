/**
 * Reading stands (DR-045, layout grid-wings@4): plates stand on identical reading stands at the
 * front of the exhibit footprint instead of hanging on the wall above an empty plinth. Measured on
 * the study manifest, compiled with each mount from the same content:
 *  - navigation is unchanged: footprints (colliders in plan), approach points, rooms and doorways
 *    are byte-identical, so every walking route and time is the same;
 *  - every stand is the same object (board and pedestal sizes) in every room and wing;
 *  - each plate sits on its stand's board, inside the footprint;
 *  - legibility: the plate (same size, same lettering) subtends a larger angle at the approach point
 *    and from the room centre for every exhibit.
 */
import { describe, expect, it } from "vitest";

import { readingStandParts } from "@/components/museum/three/world";
import { farthestDistance, panelTypeScale, emAngle } from "@/features/immersive/placement";
import { VISITOR } from "@/features/immersive/navigation";
import { buildSceneModel, type SceneExhibit, type SceneModel } from "@/features/immersive/scene-model";
import { compileSpatialManifest, DEFAULT_RULE_SET, defaultRuleSetConfig, ruleSetUuid, type CompilerGraph } from "@/features/spatial/compiler";

import { museumFixture, TRADITIONS } from "./fixtures";

function compileWith(mount: "plinth" | "stand"): SceneModel {
  const { bundle } = museumFixture();
  const config = defaultRuleSetConfig();
  (config.layout as Record<string, unknown>).exhibitMount = mount;
  const graph = bundle as unknown as CompilerGraph;
  const m = compileSpatialManifest({
    graph,
    snapshotVersion: graph.versionLabel,
    traditions: TRADITIONS,
    ruleSet: { id: ruleSetUuid(DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version), name: DEFAULT_RULE_SET.name, version: DEFAULT_RULE_SET.version, config },
    seed: "default",
  });
  return buildSceneModel(m.manifest);
}

const wall = compileWith("plinth");
const stand = buildSceneModel(museumFixture().manifest.manifest);
const byId = (m: SceneModel) => new Map(m.exhibits.map((e) => [e.id, e]));

/** Angle (rad) between the rays from the eye at `at` to two points. */
function angleBetween(at: { x: number; z: number }, p: number[], q: number[]): number {
  const a = [p[0]! - at.x, p[1]! - VISITOR.eyeHeight, p[2]! - at.z];
  const b = [q[0]! - at.x, q[1]! - VISITOR.eyeHeight, q[2]! - at.z];
  const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return Math.acos(Math.min(1, dot / (Math.hypot(...a) * Math.hypot(...b))));
}

/** Subtended height and width of a plate (rays to the midpoints of opposite edges). */
function subtended(at: { x: number; z: number }, e: SceneExhibit) {
  const { min, max } = e.panel;
  const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const alongX = e.panel.facing === "+z" || e.panel.facing === "-z";
  const h = angleBetween(at, [c[0]!, min[1], c[2]!], [c[0]!, max[1], c[2]!]);
  const w = alongX ? angleBetween(at, [min[0], c[1]!, c[2]!], [max[0], c[1]!, c[2]!]) : angleBetween(at, [c[0]!, c[1]!, min[2]], [c[0]!, c[1]!, max[2]]);
  return { h, w };
}

describe("reading stands (DR-045)", () => {
  it("compiles every exhibit of the default rule set onto a stand", () => {
    expect(stand.exhibits.length).toBeGreaterThan(100);
    expect(stand.exhibits.every((e) => e.mount === "stand" && e.plinth)).toBe(true);
    expect(wall.exhibits.every((e) => e.mount === "plinth")).toBe(true);
  });

  it("leaves navigation unchanged: same rooms, doorways, footprints in plan, positions and approach points", () => {
    expect(stand.rooms.map((r) => [r.id, r.bounds])).toEqual(wall.rooms.map((r) => [r.id, r.bounds]));
    expect(stand.portals.map((p) => [p.id, p.opening])).toEqual(wall.portals.map((p) => [p.id, p.opening]));
    expect(stand.spawn).toEqual(wall.spawn);
    const w = byId(wall);
    for (const e of stand.exhibits) {
      const o = w.get(e.id)!;
      expect(o, e.id).toBeDefined();
      expect([e.roomId, e.position, e.approach, e.yawDeg]).toEqual([o.roomId, o.position, o.approach, o.yawDeg]);
      // The footprint in plan (what the visitor collides with) is the same box; only its height differs.
      expect([e.plinth!.min[0], e.plinth!.min[2], e.plinth!.max[0], e.plinth!.max[2]]).toEqual([o.plinth!.min[0], o.plinth!.min[2], o.plinth!.max[0], o.plinth!.max[2]]);
    }
    const plan = (m: SceneModel) => m.colliders.map((c) => [c.id, c.min[0], c.min[2], c.max[0], c.max[2]]);
    expect(plan(stand)).toEqual(plan(wall));
  });

  it("builds one identical stand for every exhibit, inside its footprint, carrying its plate", () => {
    const sizes = new Set<string>();
    for (const e of stand.exhibits) {
      const s = readingStandParts(e)!;
      const fp = e.plinth!;
      const ax = e.panel.facing.endsWith("x") ? 0 : 2;
      const front = e.panel.facing.startsWith("+") ? fp.max[ax]! : fp.min[ax]!;
      // The board's front face is the footprint's front face; the plate stands 3 mm proud of it.
      expect(e.panel.facing.startsWith("+") ? s.board.max[ax] : s.board.min[ax], e.id).toBeCloseTo(front, 6);
      expect(Math.abs(e.panel.min[ax]! - front), e.id).toBeCloseTo(e.panel.wallOffset ?? -1, 6);
      for (const b of [s.board, s.pedestal]) {
        for (const i of [0, 1, 2]) {
          expect(b.min[i]!, `${e.id} inside footprint`).toBeGreaterThanOrEqual(fp.min[i]! - 1e-6);
          expect(b.max[i]!, `${e.id} inside footprint`).toBeLessThanOrEqual(fp.max[i]! + 1e-6);
        }
      }
      // The board covers the plate.
      expect(s.board.min[1]).toBeLessThan(e.panel.min[1]);
      expect(s.board.max[1]).toBeCloseTo(fp.max[1], 6);
      const dims = (b: { min: number[]; max: number[] }) => [0, 1, 2].map((i) => (b.max[i]! - b.min[i]!).toFixed(4));
      const sorted = (d: string[]) => [[d[0], d[2]].sort().join("x"), d[1]].join("|");
      sizes.add(`${sorted(dims(s.board))}/${sorted(dims(s.pedestal))}`);
    }
    expect([...sizes]).toHaveLength(1);
  });

  it("keeps the plate and its lettering the same size", () => {
    const w = byId(wall);
    for (const e of stand.exhibits) {
      const o = w.get(e.id)!;
      const size = (p: SceneExhibit["panel"]) => [p.max[0] - p.min[0] + (p.max[2] - p.min[2]), p.max[1] - p.min[1]].map((v) => v.toFixed(4));
      expect(size(e.panel)).toEqual(size(o.panel));
    }
    const a = panelTypeScale(wall);
    const b = panelTypeScale(stand);
    expect([b.kickerEm, b.titleEm, b.stepEm]).toEqual([a.kickerEm, a.titleEm, a.stepEm]);
  });

  it("makes every plate larger in view at the approach point, and taller in view from its room's centre", () => {
    const w = byId(wall);
    const scale = panelTypeScale(stand);
    const ratios = { approachH: Infinity, approachW: Infinity, centreH: Infinity, centreW: Infinity, titleAtApproach: Infinity };
    const centreArea: number[] = [];
    const centreOf = (m: SceneModel, roomId: string) => {
      const b = m.rooms.find((r) => r.id === roomId)!.bounds;
      return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
    };
    for (const e of stand.exhibits) {
      const o = w.get(e.id)!;
      const a1 = subtended(e.approach, e);
      const a0 = subtended(o.approach, o);
      const c = centreOf(stand, e.roomId);
      const c1 = subtended(c, e);
      const c0 = subtended(c, o);
      ratios.approachH = Math.min(ratios.approachH, a1.h / a0.h);
      ratios.approachW = Math.min(ratios.approachW, a1.w / a0.w);
      ratios.centreH = Math.min(ratios.centreH, c1.h / c0.h);
      ratios.centreW = Math.min(ratios.centreW, c1.w / c0.w);
      centreArea.push((c1.h * c1.w) / (c0.h * c0.w));
      ratios.titleAtApproach = Math.min(ratios.titleAtApproach, emAngle(scale.titleEm, farthestDistance(e.approach, e.panel)) / emAngle(scale.titleEm, farthestDistance(o.approach, o.panel)));
    }
    centreArea.sort((p, q) => p - q);
    const fromCentre = { median: centreArea[Math.floor(centreArea.length / 2)]!, min: centreArea[0]!, below1: centreArea.filter((r) => r < 1).length };
    // Smallest gain over all exhibits (printed for the results document).
    process.stdout.write(
      `reading-stand legibility ratios (stand / wall, minimum over ${stand.exhibits.length} exhibits): ${JSON.stringify(ratios)}; subtended area from the room centre: ${JSON.stringify(fromCentre)}\n`,
    );
    expect(ratios.approachH).toBeGreaterThan(1.3);
    expect(ratios.approachW).toBeGreaterThan(1.3);
    expect(ratios.titleAtApproach).toBeGreaterThan(1.3);
    expect(ratios.centreH).toBeGreaterThan(1);
    // Width seen from the room centre: a plate near a corner is seen more obliquely once it stands
    // forward of its wall, so a few lose some width; the subtended area grows for most plates.
    expect(fromCentre.median).toBeGreaterThan(1.1);
    expect(fromCentre.below1 / centreArea.length).toBeLessThan(0.15);
  });
});
