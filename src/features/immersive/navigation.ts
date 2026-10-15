/**
 * Visitor navigation: collision with sliding, routing over the manifest's walkable grid, and the
 * per-frame kinematics. Pure TypeScript (no three.js), unit-tested in tests/unit/immersive.
 *
 * Adapted from virtual-walkthrough src/museum/navigation/collision.ts (`resolveCircle`,
 * `segmentBlocked`) and src/museum/navigation/VisitorController.tsx (damped velocity, walk
 * targets, stuck detection): the colliders come from the manifest instead of module-level
 * content arrays, and a uniform grid replaces the linear scan.
 */
import { NavGrid } from "@/features/spatial/compiler/navgrid";
import type { Point, Rect, Vec3 } from "@/features/spatial/compiler/types";

/** Visitor constants (design-reuse catalogue §4.3; FOV per immersive-rendering-quality.md §1). */
export const VISITOR = {
  eyeHeight: 1.62,
  radius: 0.28,
  walkSpeed: 1.35,
  briskSpeed: 2.3,
  acceleration: 7,
  turnSpeed: 1.6,
  lookDamping: 14,
  pitchLimit: (55 * Math.PI) / 180,
  /** Vertical field of view in degrees (spec range 60-70). */
  fov: 62,
} as const;

/** Route pace: walking within `walkWithin` metres of the destination, brisk beyond `walkWithin + rampOver`. */
export const ROUTE_PACE = { walkWithin: 3, rampOver: 5 } as const;

export interface Box2 {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** First contact of a collision resolve (see `resolveCircle`). */
export interface CornerHit {
  corner: boolean;
  /** Closest point on the box (the vertex when `corner`). */
  vx: number;
  vz: number;
  boxX: number;
  boxZ: number;
}

export class CollisionWorld {
  private readonly cell = 2;
  private readonly grid = new Map<number, Box2[]>();
  readonly boxes: Box2[];

  constructor(colliders: readonly { id: string; min: Vec3; max: Vec3 }[]) {
    this.boxes = colliders.map((c) => ({ id: c.id, minX: c.min[0], maxX: c.max[0], minZ: c.min[2], maxZ: c.max[2] }));
    for (const b of this.boxes) {
      for (let i = Math.floor(b.minX / this.cell); i <= Math.floor(b.maxX / this.cell); i++) {
        for (let j = Math.floor(b.minZ / this.cell); j <= Math.floor(b.maxZ / this.cell); j++) {
          const k = this.key(i, j);
          (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(b);
        }
      }
    }
  }

  private key(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }

  private near(x: number, z: number, r: number, out: Set<Box2>) {
    out.clear();
    for (let i = Math.floor((x - r) / this.cell); i <= Math.floor((x + r) / this.cell); i++) {
      for (let j = Math.floor((z - r) / this.cell); j <= Math.floor((z + r) / this.cell); j++) {
        for (const b of this.grid.get(this.key(i, j)) ?? []) out.add(b);
      }
    }
    return out;
  }

  private readonly scratch = new Set<Box2>();

  /**
   * Push a circle out of every collider (sliding: only the penetrating component is removed).
   * Mutates and returns `out`. When `hit` is given it receives the first contact: whether it was a
   * box corner (the closest point is a vertex, not a face) and that box's centre.
   */
  resolveCircle(x: number, z: number, radius: number, out: { x: number; z: number } = { x: 0, z: 0 }, hit?: CornerHit) {
    let px = x;
    let pz = z;
    if (hit) hit.corner = false;
    let first = true;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const c of this.near(px, pz, radius, this.scratch)) {
        const cx = Math.max(c.minX, Math.min(px, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pz, c.maxZ));
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (hit && first) {
          first = false;
          // A corner contact: the closest point is a vertex, or a face point within one radius of
          // the face's end (the body then overlaps the corner), in which case that end is the vertex.
          const outX = px < c.minX || px > c.maxX;
          const outZ = pz < c.minZ || pz > c.maxZ;
          let vx = cx;
          let vz = cz;
          let corner = outX && outZ;
          if (!corner && outZ && !outX) {
            const end = px - c.minX < radius ? c.minX : c.maxX - px < radius ? c.maxX : null;
            if (end !== null) {
              vx = end;
              corner = true;
            }
          } else if (!corner && outX && !outZ) {
            const end = pz - c.minZ < radius ? c.minZ : c.maxZ - pz < radius ? c.maxZ : null;
            if (end !== null) {
              vz = end;
              corner = true;
            }
          }
          hit.corner = corner;
          hit.vx = vx;
          hit.vz = vz;
          hit.boxX = (c.minX + c.maxX) / 2;
          hit.boxZ = (c.minZ + c.maxZ) / 2;
        }
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          px += (dx / d) * push;
          pz += (dz / d) * push;
        } else {
          const l = px - c.minX;
          const r = c.maxX - px;
          const b = pz - c.minZ;
          const t = c.maxZ - pz;
          const m = Math.min(l, r, b, t);
          if (m === l) px = c.minX - radius;
          else if (m === r) px = c.maxX + radius;
          else if (m === b) pz = c.minZ - radius;
          else pz = c.maxZ + radius;
        }
        moved = true;
      }
      if (!moved) break;
    }
    out.x = px;
    out.z = pz;
    return out;
  }

  /** True if the point lies inside (or on) any collider. */
  isInside(x: number, z: number): boolean {
    for (const c of this.near(x, z, 0, this.scratch)) if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return true;
    return false;
  }

  /** True if segment a->b crosses any collider (Liang-Barsky against each box). */
  segmentBlocked(ax: number, az: number, bx: number, bz: number): boolean {
    const r = Math.hypot(bx - ax, bz - az) / 2 + 0.01;
    for (const c of this.near((ax + bx) / 2, (az + bz) / 2, r, new Set())) {
      let t0 = 0;
      let t1 = 1;
      const dx = bx - ax;
      const dz = bz - az;
      const p = [-dx, dx, -dz, dz];
      const q = [ax - c.minX, c.maxX - ax, az - c.minZ, c.maxZ - az];
      let hit = true;
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
          if (q[i]! < 0) {
            hit = false;
            break;
          }
        } else {
          const t = q[i]! / p[i]!;
          if (p[i]! < 0) t0 = Math.max(t0, t);
          else t1 = Math.min(t1, t);
          if (t0 > t1) {
            hit = false;
            break;
          }
        }
      }
      if (hit) return true;
    }
    return false;
  }
}

/** Walkable-grid router (the compiler's NavGrid, rebuilt from the manifest's rooms and colliders). */
export function createRouter(rooms: readonly { bounds: Rect }[], colliders: readonly { id: string; min: Vec3; max: Vec3 }[]) {
  const grid = new NavGrid(
    rooms.map((r) => r.bounds),
    colliders.map((c) => ({ id: c.id, kind: "wall" as const, min: c.min, max: c.max })),
    VISITOR.radius,
    0.25,
  );
  return {
    route(a: Point, b: Point): Point[] | null {
      return grid.route(a, b);
    },
    isFree(p: Point) {
      return grid.isFree(p);
    },
  };
}
export type Router = ReturnType<typeof createRouter>;

export interface VisitorState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Radians; 0 = looking north (-z), positive turns left (three.js rotation.y). */
  yaw: number;
  pitch: number;
  /** Remaining route waypoints for click/keyboard-initiated walks. */
  route: Point[];
  /** Final facing for the route (radians), applied while arriving. */
  routeYaw: number | null;
}

export interface MoveInput {
  forward: number;
  strafe: number;
  turn: number;
  brisk: boolean;
}

/**
 * One key map for everyone: W = up arrow, S = down arrow, A = left arrow, D = right arrow.
 * Left and right TURN by default, so non-gamers learn one set of meanings and keyboard-only users
 * can turn. While mouse look is active the mouse turns, so the same keys step sideways instead,
 * as in first-person games. Keys are lower-case `KeyboardEvent.key` values.
 */
export function moveInputFromKeys(keys: ReadonlySet<string>, mouseLookActive: boolean): MoveInput {
  const on = (...k: string[]) => (k.some((x) => keys.has(x)) ? 1 : 0);
  const right = on("d", "arrowright") - on("a", "arrowleft");
  return {
    forward: on("w", "arrowup") - on("s", "arrowdown"),
    strafe: mouseLookActive ? right : 0,
    turn: mouseLookActive ? 0 : -right,
    brisk: keys.has("shift"),
  };
}

export const yawFromDeg = (deg: number) => (-deg * Math.PI) / 180;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const cornerHit: CornerHit = { corner: false, vx: 0, vz: 0, boxX: 0, boxZ: 0 };
const slipOut = { x: 0, z: 0 };

/**
 * Advance the visitor by dt seconds. Returns true while anything is moving (the renderer keeps
 * rendering only while this is true: render on demand).
 */
export function stepVisitor(v: VisitorState, input: MoveInput, dt: number, world: CollisionWorld, look: { yaw: number; pitch: number }): boolean {
  dt = Math.min(dt, 0.05);
  const manual = Math.abs(input.forward) + Math.abs(input.strafe) > 0.05;
  if (manual || input.turn !== 0) {
    v.route = [];
    v.routeYaw = null;
  }
  look.yaw += input.turn * VISITOR.turnSpeed * dt;

  let tvx = 0;
  let tvz = 0;
  const sinY = Math.sin(v.yaw);
  const cosY = Math.cos(v.yaw);
  if (manual) {
    const speed = input.brisk ? VISITOR.briskSpeed : VISITOR.walkSpeed;
    const len = Math.max(1, Math.hypot(input.forward, input.strafe));
    const f = input.forward / len;
    const s = input.strafe / len;
    tvx = (-sinY * f + cosY * s) * speed;
    tvz = (-cosY * f - sinY * s) * speed;
  } else if (v.route.length > 0) {
    const t = v.route[0]!;
    const dx = t.x - v.x;
    const dz = t.z - v.z;
    const dist = Math.hypot(dx, dz);
    const last = v.route.length === 1;
    if (dist < (last ? 0.05 : 0.35)) {
      v.route.shift();
    } else {
      // Click-to-walk on a long route goes at the brisk pace (the Shift pace of the keys) and eases
      // back to the walking pace over the last metres (3D-B walkthrough: the 63 m walk down the
      // comparison hall to the far wing took 45 s at the walking pace).
      let remaining = dist;
      for (let i = 1; i < v.route.length; i++) remaining += Math.hypot(v.route[i]!.x - v.route[i - 1]!.x, v.route[i]!.z - v.route[i - 1]!.z);
      const brisk = Math.min(1, Math.max(0, (remaining - ROUTE_PACE.walkWithin) / ROUTE_PACE.rampOver));
      const sp = (VISITOR.walkSpeed + (VISITOR.briskSpeed - VISITOR.walkSpeed) * brisk) * (last ? Math.min(1, dist / 0.7) : 1);
      tvx = (dx / dist) * sp;
      tvz = (dz / dist) * sp;
      // Face the direction of travel unless a final facing is pending on the last leg.
      if (!(last && v.routeYaw !== null && dist < 1.2)) {
        const want = Math.atan2(-dx, -dz);
        look.yaw += wrap(want - look.yaw) * (1 - Math.exp(-4 * dt));
      }
    }
  }
  // Final facing: turn while arriving and after the last waypoint is reached.
  if (!manual && v.route.length <= 1 && v.routeYaw !== null) {
    look.yaw += wrap(v.routeYaw - look.yaw) * (1 - Math.exp(-4 * dt));
    look.pitch += (0 - look.pitch) * (1 - Math.exp(-4 * dt));
    if (v.route.length === 0 && Math.abs(wrap(v.routeYaw - look.yaw)) < 0.002) {
      look.yaw = v.routeYaw;
      v.routeYaw = null;
    }
  }

  const a = 1 - Math.exp(-VISITOR.acceleration * dt);
  v.vx += (tvx - v.vx) * a;
  v.vz += (tvz - v.vz) * a;
  if (Math.abs(v.vx) < 1e-3 && tvx === 0) v.vx = 0;
  if (Math.abs(v.vz) < 1e-3 && tvz === 0) v.vz = 0;

  // Requested travel this frame (the input's target speed, not the damped velocity, which a wall has
  // already slowed: progress is judged against what the visitor asks for).
  const want = Math.hypot(tvx, tvz) * dt;
  const out = world.resolveCircle(v.x + v.vx * dt, v.z + v.vz * dt, VISITOR.radius, undefined, cornerHit);
  // Corner slip: walking (nearly) straight at the tip of a box corner (a plinth, the end of a wall
  // at a doorway), the push points back at the visitor and sliding alone barely moves them. Step
  // around the corner instead, on the side the visitor is already on, so the walk never snags.
  // Flat walls are untouched: there the closest point is a face, not a vertex.
  // Only an exposed corner: at a room's inside corner the wall's end runs into another wall, and
  // stepping "around" it would only push into that wall.
  const ex = Math.sign(cornerHit.vx - cornerHit.boxX) * 0.03;
  const ez = Math.sign(cornerHit.vz - cornerHit.boxZ) * 0.03;
  const exposed = cornerHit.corner && !world.isInside(cornerHit.vx + ex, cornerHit.vz + ez);
  if (exposed && want > 1e-5 && Math.hypot(out.x - v.x, out.z - v.z) < 0.5 * want) {
    const dx = (tvx * dt) / want;
    const dz = (tvz * dt) / want;
    let nx = v.x - cornerHit.vx;
    let nz = v.z - cornerHit.vz;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    // Tangent around the vertex; pick the side the visitor is on relative to the box centre.
    const side = (cornerHit.vx - cornerHit.boxX) * dz - (cornerHit.vz - cornerHit.boxZ) * dx;
    const s = side >= 0 ? 1 : -1;
    const tx = -nz * s;
    const tz = nx * s;
    const slip = world.resolveCircle(v.x + tx * want * 0.9 + dx * want * 0.2, v.z + tz * want * 0.9 + dz * want * 0.2, VISITOR.radius, slipOut);
    // Accept only a slip that moves further and does not lose ground in the walking direction.
    const progOut = (out.x - v.x) * dx + (out.z - v.z) * dz;
    const progSlip = (slip.x - v.x) * dx + (slip.z - v.z) * dz;
    if (Math.hypot(slip.x - v.x, slip.z - v.z) > Math.hypot(out.x - v.x, out.z - v.z) && progSlip >= progOut - 0.2 * want) {
      out.x = slip.x;
      out.z = slip.z;
    }
  }
  if (dt > 0) {
    v.vx = (out.x - v.x) / dt;
    v.vz = (out.z - v.z) / dt;
  }
  const moved = Math.abs(out.x - v.x) + Math.abs(out.z - v.z) > 1e-6;
  v.x = out.x;
  v.z = out.z;

  const la = 1 - Math.exp(-VISITOR.lookDamping * dt);
  const dyaw = wrap(look.yaw - v.yaw);
  const dpitch = look.pitch - v.pitch;
  v.yaw += dyaw * la;
  v.pitch += dpitch * la;
  const turning = Math.abs(dyaw) > 1e-4 || Math.abs(dpitch) > 1e-4;
  if (!turning) {
    v.yaw = look.yaw;
    v.pitch = look.pitch;
  }
  return moved || turning || manual || v.route.length > 0 || v.routeYaw !== null || v.vx !== 0 || v.vz !== 0 || input.turn !== 0;
}

/** Facing (radians) that looks at a wall exhibit: the exhibit's yawDeg points into the room. */
export function facingExhibit(approach: Point, position: Point): number {
  return Math.atan2(-(position.x - approach.x), -(position.z - approach.z));
}
