/**
 * Movement must never be an obstacle (condition-equivalence: a clumsy walk would bias the 3D
 * condition). Measured on the real compiled museum:
 *  A. doorways: approached off-centre and at an angle (forward only, and W+A / W+D diagonals),
 *     the visitor passes through;
 *  B. no snag: in a seeded random walk, whenever the commanded motion has a free direction within
 *     70 degrees, the visitor keeps moving;
 *  C. click-to-walk routes between exhibits arrive without stalling.
 */
import { describe, expect, it } from "vitest";

import { CollisionWorld, createRouter, facingExhibit, stepVisitor, VISITOR, type MoveInput, type VisitorState } from "@/features/immersive/navigation";
import { buildSceneModel } from "@/features/immersive/scene-model";

import { museumFixture } from "./fixtures";

const DT = 1 / 60;
const none: MoveInput = { forward: 0, strafe: 0, turn: 0, brisk: false };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const model = buildSceneModel(museumFixture().manifest.manifest);
const world = new CollisionWorld(model.colliders);
const router = createRouter(model.rooms, model.colliders);

function visitor(x: number, z: number, yaw: number): VisitorState {
  return { x, z, vx: 0, vz: 0, yaw, pitch: 0, route: [], routeYaw: null };
}
/** Yaw that looks from (x,z) towards (tx,tz) (0 = -z, positive turns left). */
const yawTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

describe("doorways are entered at an angle and off-centre", () => {
  // Aim points span the opening out to the door frame (the opening is 1.5 m; the visitor's centre
  // clears the frame within 0.47 m of the middle, so +-0.55 grazes the jamb tip); approaches come
  // from straight on up to 60 degrees; inputs are forward, and the W+A / W+D diagonals with the
  // view turned so the motion still points at the aim (as a user steers).
  const cases: { portal: string; side: number; angle: number; target: number; input: string; ok: boolean }[] = [];
  for (const p of model.portals) {
    const n = p.axis === "z" ? { x: 1, z: 0 } : { x: 0, z: 1 }; // wall normal
    const t = p.axis === "z" ? { x: 0, z: 1 } : { x: 1, z: 0 }; // along the opening
    for (const side of [1, -1]) {
      for (const angle of [-60, -45, -25, 0, 25, 45, 60]) {
        for (const target of [-0.55, -0.3, 0, 0.3, 0.55]) {
          for (const input of ["W", "W+A", "W+D"]) {
            const ax = p.position.x + t.x * target;
            const az = p.position.z + t.z * target;
            const a = (angle * Math.PI) / 180;
            const sx = ax + (n.x * Math.cos(a) + t.x * Math.sin(a)) * side * 1.8;
            const sz = az + (n.z * Math.cos(a) + t.z * Math.sin(a)) * side * 1.8;
            if (!router.isFree({ x: sx, z: sz }) || world.segmentBlocked(sx, sz, sx + (ax - sx) * 0.5, sz + (az - sz) * 0.5)) continue;
            const comp = input === "W+A" ? -Math.PI / 4 : input === "W+D" ? Math.PI / 4 : 0;
            const yaw = yawTo(sx, sz, ax, az) + comp;
            const v = visitor(sx, sz, yaw);
            const look = { yaw, pitch: 0 };
            const mv: MoveInput = { ...none, forward: 1, strafe: input === "W+A" ? -1 : input === "W+D" ? 1 : 0 };
            for (let i = 0; i < 60 * 5; i++) stepVisitor(v, mv, DT, world, look);
            const crossed = (v.x - p.position.x) * n.x * -side + (v.z - p.position.z) * n.z * -side > 0.4;
            cases.push({ portal: p.id, side, angle, target, input, ok: crossed });
          }
        }
      }
    }
  }
  it("passes every doorway approach", () => {
    const failed = cases.filter((c) => !c.ok);
    const by = (k: (c: (typeof cases)[number]) => string) => {
      const m: Record<string, string> = {};
      for (const c of cases) {
        const key = k(c);
        const [f, n] = (m[key] ?? "0/0").split("/").map(Number);
        m[key] = `${f! + (c.ok ? 0 : 1)}/${n! + 1}`;
      }
      return m;
    };
    console.info(`[snag] doorway approaches: ${cases.length}, failed: ${failed.length}`, "by angle", JSON.stringify(by((c) => String(c.angle))), "by target", JSON.stringify(by((c) => String(c.target))));
    for (const f of failed.slice(0, 8)) console.info("[snag] door fail", JSON.stringify(f));
    expect(cases.length).toBeGreaterThan(500);
    expect(failed).toEqual([]);
  });
});

describe("no snagging in a random walk", () => {
  it("keeps moving whenever a free direction near the commanded one exists", () => {
    const r = rng(20261015);
    const inputs: MoveInput[] = [
      { ...none, forward: 1 },
      { ...none, forward: 1, strafe: 1 },
      { ...none, forward: 1, strafe: -1 },
      { ...none, strafe: 1 },
      { ...none, forward: -1, strafe: 1 },
      { ...none, forward: 1, brisk: true },
    ];
    let snags = 0;
    let trials = 0;
    const examples: string[] = [];
    for (let k = 0; k < 2400; k++) {
      const room = model.rooms[Math.floor(r() * model.rooms.length)]!;
      const b = room.bounds;
      const x = b.minX + 0.4 + r() * (b.maxX - b.minX - 0.8);
      const z = b.minZ + 0.4 + r() * (b.maxZ - b.minZ - 0.8);
      if (!router.isFree({ x, z })) continue;
      const yaw = r() * Math.PI * 2 - Math.PI;
      const v = visitor(x, z, yaw);
      const look = { yaw, pitch: 0 };
      const mv = inputs[Math.floor(r() * inputs.length)]!;
      trials++;
      let slow = 0;
      for (let i = 0; i < 60 * 4; i++) {
        const px = v.x;
        const pz = v.z;
        stepVisitor(v, mv, DT, world, look);
        if (i < 30) continue; // acceleration
        const speed = Math.hypot(v.x - px, v.z - pz) / DT;
        const cmd = mv.brisk ? VISITOR.briskSpeed : VISITOR.walkSpeed;
        if (speed < 0.15 * cmd) {
          // Is there a free direction within 70 degrees of the commanded heading?
          const len = Math.max(1, Math.hypot(mv.forward, mv.strafe));
          const f = mv.forward / len;
          const s = mv.strafe / len;
          const hx = -Math.sin(v.yaw) * f + Math.cos(v.yaw) * s;
          const hz = -Math.cos(v.yaw) * f - Math.sin(v.yaw) * s;
          const h = Math.atan2(hz, hx);
          let free = false;
          for (const d of [-70, -50, -30, 30, 50, 70]) {
            const a = h + (d * Math.PI) / 180;
            const tx = v.x + Math.cos(a) * 0.3;
            const tz = v.z + Math.sin(a) * 0.3;
            const res = world.resolveCircle(tx, tz, VISITOR.radius);
            if (Math.hypot(res.x - tx, res.z - tz) < 1e-3 && !world.segmentBlocked(v.x, v.z, tx, tz)) free = true;
          }
          slow = free ? slow + 1 : 0;
          if (slow > 18) {
            snags++;
            if (examples.length < 10) examples.push(JSON.stringify({ room: room.id, x: +v.x.toFixed(2), z: +v.z.toFixed(2), yaw: +v.yaw.toFixed(2), mv }));
            break;
          }
        } else slow = 0;
      }
    }
    console.info(`[snag] random-walk trials: ${trials}, snags: ${snags}`);
    for (const e of examples) console.info("[snag] stuck", e);
    expect(trials).toBeGreaterThan(1500);
    expect(snags).toBe(0);
  });
});

describe("click-to-walk routes arrive without stalling", () => {
  it("walks spawn -> each exhibit and between exhibits", () => {
    const xs = model.exhibits;
    const pairs: [{ x: number; z: number }, (typeof xs)[number]][] = xs.map((e) => [model.spawn, e]);
    for (let i = 0; i < xs.length; i += 3) pairs.push([xs[i]!.approach, xs[(i * 7 + 5) % xs.length]!]);
    const stalls: string[] = [];
    for (const [from, e] of pairs) {
      const route = router.route(from, e.approach);
      if (!route) {
        stalls.push(`no route to ${e.id}`);
        continue;
      }
      let len = 0;
      for (let i = 1; i < route.length; i++) len += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z);
      const v = visitor(from.x, from.z, 0);
      v.route = [...route.slice(1), e.approach];
      v.routeYaw = facingExhibit(e.approach, e.position);
      const look = { yaw: 0, pitch: 0 };
      const budget = len / VISITOR.walkSpeed * 1.6 + 4;
      let t = 0;
      while ((v.route.length > 0 || v.routeYaw !== null) && t < budget) {
        stepVisitor(v, none, DT, world, look);
        t += DT;
      }
      if (v.route.length > 0 || Math.hypot(v.x - e.approach.x, v.z - e.approach.z) > 0.15) stalls.push(`${e.id} after ${t.toFixed(1)}s (path ${len.toFixed(1)} m), ${v.route.length} waypoints left`);
    }
    console.info(`[snag] routes walked: ${pairs.length}, stalled: ${stalls.length}`);
    for (const s of stalls.slice(0, 10)) console.info("[snag] route", s);
    expect(stalls).toEqual([]);
  });
});

describe("corner slip leaves flat walls and inside corners alone", () => {
  const world2 = new CollisionWorld([
    { id: "north", min: [0, 0, 0], max: [10, 3, 0.2] },
    { id: "west", min: [0, 0, 0], max: [0.2, 3, 10] },
  ]);
  it("walking head-on into the middle of a wall does not drift sideways", () => {
    const v = visitor(5, 2, 0); // facing north (-z) at the north wall
    const look = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 180; i++) stepVisitor(v, { ...none, forward: 1 }, DT, world2, look);
    expect(Math.abs(v.x - 5)).toBeLessThan(1e-6);
    expect(v.z).toBeCloseTo(0.2 + VISITOR.radius, 6);
  });
  it("pushing into a room's inside corner settles without jitter", () => {
    const v = visitor(2, 2, Math.PI / 4); // facing north-west, into the corner
    const look = { yaw: Math.PI / 4, pitch: 0 };
    const xs: number[] = [];
    for (let i = 0; i < 240; i++) {
      stepVisitor(v, { ...none, forward: 1 }, DT, world2, look);
      if (i > 180) xs.push(v.x, v.z);
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.0001 + (0.2 + VISITOR.radius) * 0); // both coordinates pinned
    expect(v.x).toBeCloseTo(0.2 + VISITOR.radius, 4);
    expect(v.z).toBeCloseTo(0.2 + VISITOR.radius, 4);
  });
});
