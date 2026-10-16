/**
 * Wayfinding (package 3D-B): the entrance directory the spawn view meets, and click-to-walk
 * through doorways. Every check runs on the study manifest compiled from content/.
 */
import { describe, expect, it } from "vitest";

import { CollisionWorld, ROUTE_PACE, VISITOR, createRouter, moveInputFromKeys, stepVisitor, type VisitorState } from "@/features/immersive/navigation";
import { DOOR_SIGN, doorSigns, emForDistance } from "@/features/immersive/placement";
import { buildSceneModel, roomAt } from "@/features/immersive/scene-model";
import { DIRECTORY, WAYFINDING_WORDS, directoryReadingPoint, doorwayAtWallHit, doorwayToRoomSeen, doorwayWalkTarget, entranceDirectory, farSide, forwardOf } from "@/features/immersive/wayfinding";
import { layoutConfigSchema } from "@/features/spatial/compiler";
import { compareStrings } from "@/features/spatial/compiler/prng";

import { museumFixture } from "./fixtures";

const model = buildSceneModel(museumFixture().manifest.manifest);
const { directory, notes } = entranceDirectory(model);

describe("entrance directory", () => {
  it("exists for the study museum and is deterministic", () => {
    expect(notes).toEqual([]);
    expect(directory).not.toBeNull();
    expect(entranceDirectory(model)).toEqual(entranceDirectory(buildSceneModel(museumFixture().manifest.manifest)));
  });

  it("lists every wing once, in canonical (slug) order, then the comparison hall and the shared commons", () => {
    const wings = model.zones.filter((z) => z.traditionSlug).sort((a, b) => compareStrings(a.traditionSlug!, b.traditionSlug!));
    const rows = directory!.rows;
    expect(rows.slice(0, wings.length).map((r) => r.zoneId)).toEqual(wings.map((z) => z.id));
    expect(rows.slice(wings.length).map((r) => r.zoneId)).toEqual(["zone:comparison", "zone:shared"]);
    // Each wing row walks into that wing's entrance room.
    for (const r of rows.slice(0, wings.length)) expect(model.rooms.find((x) => x.id === r.toRoomId)?.zoneId).toBe(r.zoneId);
  });

  it("stands in the hub: every wing doorway is the same distance from the spawn (DR-043)", () => {
    const wingRows = directory!.rows.filter((r) => model.zones.find((z) => z.id === r.zoneId)?.traditionSlug);
    const d = wingRows.map((r) => {
      const p = model.portals.find((x) => x.id === r.portalId)!;
      return Math.hypot(p.position.x - model.spawn.x, p.position.z - model.spawn.z);
    });
    expect(d).toHaveLength(3);
    expect(Math.max(...d) - Math.min(...d)).toBeLessThan(1e-6);
    // ... and click-to-walk through each costs the same route length.
    const router = createRouter(model.rooms, model.colliders);
    const lengths = wingRows.map((r) => {
      const t = doorwayWalkTarget(model, r.portalId, r.toRoomId, (q) => router.isFree(q))!;
      const route = router.route(model.spawn, t.point)!;
      return route.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - route[i]!.x, p.z - route[i]!.z), 0);
    });
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.02);
  });

  it("gives every row the same size and type: no wing is more salient", () => {
    const sizes = directory!.rows.map((r) => [r.sign.max[0] - r.sign.min[0], r.sign.max[2] - r.sign.min[2], Math.round((r.sign.max[1] - r.sign.min[1]) * 1000)].join(","));
    expect(new Set(sizes).size).toBe(1);
    const ys = directory!.rows.map((r) => r.sign.max[1]);
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1]! - ys[i]!).toBeCloseTo(DIRECTORY.rowHeight + DIRECTORY.gap, 6);
  });

  it("hangs in the spawn's own room, facing the spawn on its axis, read from the spawn with no walk-up", () => {
    const f = forwardOf(model.spawn.yawDeg);
    const s = directory!.rows[0]!.sign;
    const c = { x: (s.min[0] + s.max[0]) / 2, z: (s.min[2] + s.max[2]) / 2 };
    const lateral = (p: { x: number; z: number }) => (p.x - model.spawn.x) * -f.z + (p.z - model.spawn.z) * f.x;
    const depth = (p: { x: number; z: number }) => (p.x - model.spawn.x) * f.x + (p.z - model.spawn.z) * f.z;
    expect(Math.abs(lateral(c))).toBeLessThan(1e-6);
    expect(directory!.viaPortalId).toBeNull();
    expect(directory!.roomId).toBe(roomAt(model.rooms, model.spawn)!.id);
    // Facing back at the spawn.
    const n = { "+x": [1, 0], "-x": [-1, 0], "+z": [0, 1], "-z": [0, -1] }[s.facing as "+x"]!;
    expect(n[0]! * f.x + n[1]! * f.z).toBeCloseTo(-1, 9);
    // At the reading distance (the compiler's hub spawn depth is the same number), less the wall's half thickness.
    expect(layoutConfigSchema.parse({}).hubSpawnDepth).toBe(DIRECTORY.readingDistance);
    expect(Math.abs(depth(c) - DIRECTORY.readingDistance)).toBeLessThan(0.11);
    // The whole stack fits the 1280 x 800 view from the spawn (horizontal half-angle).
    const hfov = 2 * Math.atan(Math.tan(((VISITOR.fov * Math.PI) / 180) / 2) * (1280 / 800));
    expect(Math.atan(DIRECTORY.rowWidth / 2 / depth(c))).toBeLessThan(hfov / 2);
  });

  it("is legible (L1) at its reading distance and leaves its wall stretch free", () => {
    expect(Math.min(DIRECTORY.titleEm, DIRECTORY.lineEm)).toBeGreaterThanOrEqual(emForDistance(DIRECTORY.readingDistance));
    const s0 = directory!.rows[0]!.sign;
    const u0 = s0.min[0] - DIRECTORY.clearance;
    const u1 = s0.max[0] + DIRECTORY.clearance;
    for (const p of model.portals) {
      if (Math.abs(p.position.z - s0.min[2]) > 0.3 || p.axis !== "x") continue;
      expect(p.position.x + p.width / 2 < u0 || p.position.x - p.width / 2 > u1, p.id).toBe(true);
    }
    for (const e of model.exhibits) {
      if (e.roomId !== directory!.roomId) continue;
      const overlap = Math.min(u1, e.panel.max[0]) - Math.max(u0, e.panel.min[0]);
      expect(e.panel.facing !== s0.facing || Math.abs(e.panel.min[2] - s0.min[2]) > 0.2 || overlap <= 0, e.id).toBe(true);
    }
    const bottom = Math.min(...directory!.rows.map((r) => r.sign.min[1]));
    const top = Math.max(...directory!.rows.map((r) => r.sign.max[1]));
    expect(bottom).toBeGreaterThanOrEqual(DIRECTORY.minBottom - 1e-9);
    // Five rows in the hub (three wings, the hall, the commons): lifted off the floor, still whole in the
    // vertical view from the reading distance at eye height.
    expect(top).toBeLessThan(2.6);
    const half = ((VISITOR.fov * Math.PI) / 180) / 2;
    for (const y of [bottom, top]) expect(Math.abs(Math.atan((y - VISITOR.eyeHeight) / DIRECTORY.readingDistance))).toBeLessThan(half);
  });

  it("has a free reading point in its room, on its axis, facing it, reachable from the spawn", () => {
    const at = directoryReadingPoint(directory!, model)!;
    const router = createRouter(model.rooms, model.colliders);
    expect(roomAt(model.rooms, at.point)?.id).toBe(directory!.roomId);
    expect(router.isFree(at.point)).toBe(true);
    expect(router.route(model.spawn, at.point)).not.toBeNull();
    const s = directory!.rows[0]!.sign;
    // One step along the facing yaw moves towards the directory.
    const fwd = { x: at.point.x - Math.sin(at.yaw), z: at.point.z - Math.cos(at.yaw) };
    const c = { x: (s.min[0] + s.max[0]) / 2, z: (s.min[2] + s.max[2]) / 2 };
    expect(Math.hypot(fwd.x - c.x, fwd.z - c.z)).toBeLessThan(Math.hypot(at.point.x - c.x, at.point.z - c.z));
  });

  it("stands further back on a narrow (phone) view so every row fits, and stays inside the room", () => {
    const s = directory!.rows[0]!.sign;
    const c = { x: (s.min[0] + s.max[0]) / 2, z: (s.min[2] + s.max[2]) / 2 };
    const wide = directoryReadingPoint(directory!, model, (80 * Math.PI) / 180)!;
    const narrow = directoryReadingPoint(directory!, model, (37 * Math.PI) / 180)!;
    const dW = Math.hypot(wide.point.x - c.x, wide.point.z - c.z);
    const dN = Math.hypot(narrow.point.x - c.x, narrow.point.z - c.z);
    expect(dW).toBeCloseTo(DIRECTORY.readingDistance, 6);
    expect(dN).toBeGreaterThan(dW);
    expect(2 * dN * Math.tan((37 * Math.PI) / 360)).toBeGreaterThanOrEqual(DIRECTORY.rowWidth);
    expect(roomAt(model.rooms, narrow.point)?.id).toBe(directory!.roomId);
  });

  it("says which wall of the lobby each doorway is in, as one reads the directory", () => {
    const rows = directory!.rows;
    // Said by wall, as one faces the directory: still true once the visitor turns to walk.
    expect(rows.map((r) => r.direction)).toEqual([
      "Doorway in the left wall",
      "Doorway in the opposite wall",
      "Doorway in the right wall",
      "Doorways either side of this sign",
      "Through the comparison hall",
    ]);
    // Left and right as one faces the directory.
    const f = forwardOf(model.spawn.yawDeg);
    const right = { x: -f.z, z: f.x };
    const lat = (id: string) => {
      const p = model.portals.find((x) => x.id === id)!;
      return (p.position.x - model.spawn.x) * right.x + (p.position.z - model.spawn.z) * right.z;
    };
    expect(lat(rows[0]!.portalId)).toBeLessThan(0);
    expect(lat(rows[2]!.portalId)).toBeGreaterThan(0);
    expect(WAYFINDING_WORDS.inWall("left", 2, true)).toBe("Second doorway in the left wall");
  });
});

describe("click-to-walk through doorways", () => {
  const router = createRouter(model.rooms, model.colliders);

  it("every doorway, in both directions, has a walkable point inside the far room, reached through it", () => {
    for (const p of model.portals) {
      for (const to of p.connects) {
        const t = doorwayWalkTarget(model, p.id, to, (q) => router.isFree(q));
        expect(t, `${p.id} -> ${to}`).not.toBeNull();
        expect(roomAt(model.rooms, t!.point)?.id, `${p.id} -> ${to}`).toBe(to);
        const from = p.connects[0] === to ? p.connects[1] : p.connects[0];
        const back = doorwayWalkTarget(model, p.id, from, (q) => router.isFree(q))!;
        expect(router.route(back.point, t!.point), `${p.id} route`).not.toBeNull();
        // Faces into the room: one step forward stays in it.
        const fwd = { x: t!.point.x - Math.sin(t!.yaw) * 0.5, z: t!.point.z - Math.cos(t!.yaw) * 0.5 };
        expect(roomAt(model.rooms, fwd)?.id).toBe(to);
      }
    }
  });

  it("finds the doorway from a click on its frame, and the room on the far side", () => {
    for (const p of model.portals.slice(0, 8)) {
      const head = { x: p.position.x, y: p.height + 0.1, z: p.position.z };
      expect(doorwayAtWallHit(model, head)?.id).toBe(p.id);
      expect(farSide(model, p, p.connects[0], { x: 0, z: 0 })).toBe(p.connects[1]);
      expect(farSide(model, p, p.connects[1], { x: 0, z: 0 })).toBe(p.connects[0]);
    }
    // A wall point far from every doorway is not a doorway.
    const w = model.rooms[0]!.walls[0]!;
    const mid = { x: (w.min[0] + w.max[0]) / 2, y: 1.5, z: (w.min[2] + w.max[2]) / 2 };
    const near = model.portals.some((p) => Math.hypot(p.position.x - mid.x, p.position.z - mid.z) < p.width / 2 + 0.4);
    if (!near) expect(doorwayAtWallHit(model, mid)).toBeNull();
  });

  it("door signs are legible from mid-room (name from 6 m, zone line from 4.4 m) and one size everywhere", () => {
    expect(DOOR_SIGN.titleEm).toBeGreaterThanOrEqual(emForDistance(DOOR_SIGN.readFrom));
    expect(DOOR_SIGN.kickerEm).toBeGreaterThanOrEqual(emForDistance(4.4));
    const sizes = new Set(doorSigns(model).map((d) => [Math.max(d.sign.max[0] - d.sign.min[0], d.sign.max[2] - d.sign.min[2]), d.sign.max[1] - d.sign.min[1]].map((v) => v.toFixed(3)).join("x")));
    expect([...sizes]).toEqual([`${DOOR_SIGN.width.toFixed(3)}x${DOOR_SIGN.height.toFixed(3)}`]);
  });

  it("walks through the doorway when the click lands on the next room's far wall, seen through it", () => {
    let checked = 0;
    for (const p of model.portals) {
      for (const from of p.connects) {
        const to = p.connects[0] === from ? p.connects[1] : p.connects[0];
        const stand = doorwayWalkTarget(model, p.id, from, (q) => router.isFree(q));
        const room = model.rooms.find((r) => r.id === to)!;
        if (!stand) continue;
        // The far wall of `to` straight through the doorway from where the visitor stands.
        const dir = { x: p.position.x - stand.point.x, z: p.position.z - stand.point.z };
        const len = Math.hypot(dir.x, dir.z);
        const u = { x: dir.x / len, z: dir.z / len };
        const b = room.bounds;
        const tx = u.x > 1e-9 ? (b.maxX - p.position.x) / u.x : u.x < -1e-9 ? (b.minX - p.position.x) / u.x : Infinity;
        const tz = u.z > 1e-9 ? (b.maxZ - p.position.z) / u.z : u.z < -1e-9 ? (b.minZ - p.position.z) / u.z : Infinity;
        const t = Math.min(tx, tz);
        const wall = { x: p.position.x + u.x * t, z: p.position.z + u.z * t };
        const seen = doorwayToRoomSeen(model, from, stand.point, wall);
        expect(seen?.toRoomId, `${p.id} ${from} -> ${to}`).toBe(to);
        expect(seen!.portal.connects).toContain(from);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
    // A wall of the visitor's own room is not a doorway beyond.
    const r0 = model.rooms[0]!;
    const inside = { x: (r0.bounds.minX + r0.bounds.maxX) / 2, z: (r0.bounds.minZ + r0.bounds.maxZ) / 2 };
    expect(doorwayToRoomSeen(model, r0.id, inside, { x: r0.bounds.maxX, z: inside.z })).toBeNull();
  });

  it("every door sign leads to the room it names", () => {
    for (const d of doorSigns(model)) expect(model.portals.find((p) => p.id === d.portalId)!.connects).toContain(d.toRoomId);
    expect(VISITOR.eyeHeight).toBe(DIRECTORY.centreY);
  });
});

describe("route pace", () => {
  const walk = (length: number) => {
    const world = new CollisionWorld([]);
    const v: VisitorState = { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, route: [{ x: length, z: 0 }], routeYaw: null };
    const look = { yaw: 0, pitch: 0 };
    let t = 0;
    let top = 0;
    while (v.route.length && t < 200) {
      stepVisitor(v, moveInputFromKeys(new Set(), false), 1 / 60, world, look);
      top = Math.max(top, Math.hypot(v.vx, v.vz));
      t += 1 / 60;
    }
    return { t, top, arrived: v.route.length === 0 };
  };

  it("walks a long route at the brisk pace and a short one at the walking pace", () => {
    const long = walk(60);
    expect(long.arrived).toBe(true);
    expect(long.top).toBeGreaterThan(VISITOR.briskSpeed * 0.95);
    expect(long.top).toBeLessThanOrEqual(VISITOR.briskSpeed + 1e-9);
    expect(long.t).toBeLessThan(60 / VISITOR.walkSpeed * 0.7);
    const short = walk(ROUTE_PACE.walkWithin);
    expect(short.arrived).toBe(true);
    expect(short.top).toBeLessThanOrEqual(VISITOR.walkSpeed + 1e-9);
  });
});

/**
 * Final review novice-3d-wing-cue-fires-on-leaving: an "enter" cue fires only on crossing its
 * doorway INTO its room. Walking back from a wing to the lobby raises no "Entering <tradition>"
 * note (and so logs no guidance_cue_used "shown").
 */
describe("enter cues fire on entering only", () => {
  const enterCues = model.cues.filter((c) => c.trigger.type === "enter");

  it("every wing announcement fires entering its wing and never entering the lobby", async () => {
    const { enterCuesOnCrossing } = await import("@/features/immersive/scene-model");
    const wingCues = enterCues.filter((c) => c.id.startsWith("cue:wing-entry:"));
    expect(wingCues.length).toBeGreaterThanOrEqual(3);
    for (const cue of wingCues) {
      const slug = cue.id.slice("cue:wing-entry:".length);
      const portal = model.portals.find((p) => p.id === cue.trigger.elementId)!;
      const wing = portal.connects.find((r) => model.rooms.find((x) => x.id === r)?.traditionSlug === slug)!;
      const outside = portal.connects.find((r) => r !== wing)!;
      expect(cue.enterRoomId, cue.id).toBe(wing);
      expect(enterCuesOnCrossing(model.cues, portal.id, wing).map((c) => c.id)).toContain(cue.id);
      expect(enterCuesOnCrossing(model.cues, portal.id, outside).map((c) => c.id), `${cue.id} leaving`).not.toContain(cue.id);
    }
  });

  it("every doorway threshold fires entering the dependent exhibit's room only", () => {
    for (const cue of enterCues.filter((c) => c.effect.type === "name-prerequisite")) {
      if (cue.effect.type !== "name-prerequisite") continue;
      const dependentRoom = model.exhibits.find((e) => e.id === (cue.effect as { dependentElementId: string }).dependentElementId)?.roomId;
      expect(cue.enterRoomId, cue.id).toBe(dependentRoom);
    }
  });

  it("no enter cue is left firing both ways", () => {
    expect(enterCues.filter((c) => c.enterRoomId === null).map((c) => c.id)).toEqual([]);
  });
});
