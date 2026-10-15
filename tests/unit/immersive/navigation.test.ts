/** Visitor movement: collision slides along walls, routes reach exhibits, walks arrive facing the exhibit. */
import { describe, expect, it } from "vitest";

import { CollisionWorld, createRouter, facingExhibit, moveInputFromKeys, stepVisitor, VISITOR, type VisitorState } from "@/features/immersive/navigation";
import { buildSceneModel } from "@/features/immersive/scene-model";
import { buildTour, roomOrder, viewpoints } from "@/features/immersive/tour-path";

import { museumFixture } from "./fixtures";

const still = { forward: 0, strafe: 0, turn: 0, brisk: false };
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe("collision", () => {
  const world = new CollisionWorld([{ id: "w", min: [0, 0, 0], max: [10, 3, 0.2] }]);
  it("slides along a wall instead of stopping dead", () => {
    // Facing north-east into a wall that runs along x on the visitor's north side.
    const v: VisitorState = { x: 2, z: 0.6, vx: 0, vz: 0, yaw: -Math.PI / 4, pitch: 0, route: [], routeYaw: null };
    const look = { yaw: v.yaw, pitch: 0 };
    for (let i = 0; i < 120; i++) stepVisitor(v, { ...still, forward: 1 }, 1 / 60, world, look);
    expect(v.z).toBeGreaterThanOrEqual(0.2 + VISITOR.radius - 1e-6);
    expect(v.x).toBeGreaterThan(2.5);
  });
});

describe("routing and walking over the compiled museum", () => {
  const model = buildSceneModel(museumFixture().manifest.manifest);
  const world = new CollisionWorld(model.colliders);
  const router = createRouter(model.rooms, model.colliders);

  it("reaches every exhibit's approach point from the spawn", () => {
    for (const e of model.exhibits) expect(router.route(model.spawn, e.approach), e.id).not.toBeNull();
  });

  it("walks a route to an exhibit, arrives and faces it", () => {
    const e = model.exhibits[0]!;
    const route = router.route(model.spawn, e.approach)!;
    const facing = facingExhibit(e.approach, e.position);
    const v: VisitorState = { x: model.spawn.x, z: model.spawn.z, vx: 0, vz: 0, yaw: 0, pitch: 0, route: [...route.slice(1), e.approach], routeYaw: facing };
    const look = { yaw: 0, pitch: 0 };
    let t = 0;
    while ((v.route.length > 0 || v.routeYaw !== null) && t < 600) {
      stepVisitor(v, still, 1 / 60, world, look);
      t += 1 / 60;
    }
    expect(Math.hypot(v.x - e.approach.x, v.z - e.approach.z)).toBeLessThan(0.1);
    expect(Math.abs(wrap(v.yaw - facing))).toBeLessThan(0.01);
  });

  it("reports no motion when the visitor is still (render on demand)", () => {
    const v: VisitorState = { x: model.spawn.x, z: model.spawn.z, vx: 0, vz: 0, yaw: 0, pitch: 0, route: [], routeYaw: null };
    expect(stepVisitor(v, still, 1 / 60, world, { yaw: 0, pitch: 0 })).toBe(false);
  });

  it("the scripted tour reaches every room; viewpoints cover every room and doorways", () => {
    const start = model.rooms.find((r) => r.id === "room:lobby")?.id ?? model.rooms[0]!.id;
    expect(new Set(roomOrder(model, start)).size).toBe(model.rooms.length);
    expect(buildTour(model, router, start).unreachable).toEqual([]);
    const vps = viewpoints(model, router);
    expect(new Set(vps.map((v) => v.roomId)).size).toBe(model.rooms.length);
    expect(vps.filter((v) => v.kind === "doorway").length).toBeGreaterThan(0);
  });
});

describe("one key map: W/S = up/down arrows, A/D = left/right arrows", () => {
  const keys = (...k: string[]) => new Set(k);
  it("walks forward and back with W/S or the up/down arrows", () => {
    expect(moveInputFromKeys(keys("w"), false)).toEqual(moveInputFromKeys(keys("arrowup"), false));
    expect(moveInputFromKeys(keys("s"), false)).toEqual(moveInputFromKeys(keys("arrowdown"), false));
    expect(moveInputFromKeys(keys("w"), false).forward).toBe(1);
    expect(moveInputFromKeys(keys("arrowdown"), false).forward).toBe(-1);
  });
  it("turns with A/D or the left/right arrows by default (no strafing)", () => {
    for (const [k, turn] of [["a", 1], ["arrowleft", 1], ["d", -1], ["arrowright", -1]] as const) {
      const m = moveInputFromKeys(keys(k), false);
      expect(m.turn).toBe(turn);
      expect(m.strafe).toBe(0);
    }
  });
  it("steps sideways with the same keys while mouse look is active (the mouse turns)", () => {
    for (const [k, strafe] of [["a", -1], ["arrowleft", -1], ["d", 1], ["arrowright", 1]] as const) {
      const m = moveInputFromKeys(keys(k), true);
      expect(m.strafe).toBe(strafe);
      expect(m.turn).toBe(0);
    }
  });
  it("sprints with Shift on any walking key", () => {
    expect(moveInputFromKeys(keys("shift", "s"), false)).toMatchObject({ forward: -1, brisk: true });
    expect(moveInputFromKeys(keys("shift", "arrowup"), false)).toMatchObject({ forward: 1, brisk: true });
  });
});
