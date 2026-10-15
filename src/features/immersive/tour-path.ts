/**
 * Scripted camera path over the whole manifest (immersive-rendering-quality.md §3): it walks
 * through every room in doorway order (so every zone and every doorway on the way is crossed),
 * turns a full circle in each room (every wall exhibit comes into view), and lists static
 * viewpoints for the frame-stability checks (C1, C2, C5): two per room, one per doorway and one
 * per exhibit approach. Pure: derived from the scene model and the walkable-grid router only.
 */
import type { Point } from "@/features/spatial/compiler/types";

import type { Router } from "./navigation";
import type { SceneModel } from "./scene-model";

export interface Pose {
  x: number;
  z: number;
  /** Radians, three.js convention (0 = looking north, -z). */
  yaw: number;
  pitch: number;
}

export type TourSegment = { kind: "move"; from: Point; to: Point; yaw0: number; yaw1: number } | { kind: "turn"; at: Point; yaw0: number; yaw1: number };

export interface Viewpoint extends Pose {
  id: string;
  zoneId: string | null;
  roomId: string;
  kind: "room-wall" | "room-door" | "doorway" | "exhibit";
}

const headingOf = (a: Point, b: Point) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Rooms in breadth-first doorway order from the spawn room. */
export function roomOrder(model: SceneModel, startRoomId: string): string[] {
  const byId = new Map(model.rooms.map((r) => [r.id, r]));
  const seen = new Set([startRoomId]);
  const order = [startRoomId];
  for (let i = 0; i < order.length; i++) {
    for (const n of [...(byId.get(order[i]!)?.neighbours ?? [])].sort((a, b) => (a.roomId < b.roomId ? -1 : 1))) {
      if (seen.has(n.roomId)) continue;
      seen.add(n.roomId);
      order.push(n.roomId);
    }
  }
  return order;
}

export function buildTour(model: SceneModel, router: Router, startRoomId: string): { segments: TourSegment[]; unreachable: string[] } {
  const byId = new Map(model.rooms.map((r) => [r.id, r]));
  const segments: TourSegment[] = [];
  const unreachable: string[] = [];
  let at: Point = { x: model.spawn.x, z: model.spawn.z };
  let yaw = (-model.spawn.yawDeg * Math.PI) / 180;
  for (const id of roomOrder(model, startRoomId)) {
    const r = byId.get(id)!;
    const centre = { x: (r.bounds.minX + r.bounds.maxX) / 2, z: (r.bounds.minZ + r.bounds.maxZ) / 2 };
    const route = router.route(at, centre);
    if (!route) {
      unreachable.push(id);
      continue;
    }
    for (let i = 1; i < route.length; i++) {
      const from = i === 1 ? at : route[i - 1]!;
      const to = route[i]!;
      if (Math.hypot(to.x - from.x, to.z - from.z) < 1e-3) continue;
      const h = headingOf(from, to);
      const target = yaw + wrap(h - yaw);
      if (Math.abs(target - yaw) > 1e-3) segments.push({ kind: "turn", at: from, yaw0: yaw, yaw1: target });
      segments.push({ kind: "move", from, to, yaw0: target, yaw1: target });
      yaw = target;
      at = to;
    }
    segments.push({ kind: "turn", at, yaw0: yaw, yaw1: yaw + 2 * Math.PI });
    yaw += 2 * Math.PI;
  }
  return { segments, unreachable };
}

/** Duration of a segment at `speed` m/s and `turnRate` rad/s. */
export function segmentDuration(s: TourSegment, speed: number, turnRate: number): number {
  return s.kind === "move" ? Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z) / speed : Math.abs(s.yaw1 - s.yaw0) / turnRate;
}

/** Pose at time t (seconds) along the tour; null once the tour has ended. */
export function poseAt(segments: readonly TourSegment[], t: number, speed: number, turnRate: number): Pose | null {
  let rest = t;
  for (const s of segments) {
    const d = segmentDuration(s, speed, turnRate);
    if (rest <= d) {
      const f = d > 0 ? rest / d : 1;
      // Smooth start and stop on every segment (no snapping).
      const e = f * f * (3 - 2 * f);
      if (s.kind === "move") return { x: s.from.x + (s.to.x - s.from.x) * f, z: s.from.z + (s.to.z - s.from.z) * f, yaw: s.yaw0, pitch: 0 };
      return { x: s.at.x, z: s.at.z, yaw: s.yaw0 + (s.yaw1 - s.yaw0) * e, pitch: 0 };
    }
    rest -= d;
  }
  return null;
}

export function tourLength(segments: readonly TourSegment[]): number {
  return segments.reduce((s, x) => s + (x.kind === "move" ? Math.hypot(x.to.x - x.from.x, x.to.z - x.from.z) : 0), 0);
}

/** Static viewpoints for C1/C2/C5. */
export function viewpoints(model: SceneModel, router: Router): Viewpoint[] {
  const out: Viewpoint[] = [];
  const exhibitsByRoom = new Map<string, SceneModel["exhibits"]>();
  for (const e of model.exhibits) (exhibitsByRoom.get(e.roomId) ?? exhibitsByRoom.set(e.roomId, []).get(e.roomId)!).push(e);
  for (const r of model.rooms) {
    const c = { x: (r.bounds.minX + r.bounds.maxX) / 2, z: (r.bounds.minZ + r.bounds.maxZ) / 2 };
    const exhibits = exhibitsByRoom.get(r.id) ?? [];
    // Look at the wall holding most exhibits (or north), and towards the first doorway.
    const counts = new Map<number, number>();
    for (const e of exhibits) {
      const h = Math.round(headingOf(c, e.position) / (Math.PI / 2));
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
    out.push({ id: `${r.id}#wall`, zoneId: r.zoneId, roomId: r.id, kind: "room-wall", x: c.x, z: c.z, yaw: (best * Math.PI) / 2, pitch: 0 });
    const door = model.portals.find((p) => p.connects.includes(r.id));
    if (door) out.push({ id: `${r.id}#door`, zoneId: r.zoneId, roomId: r.id, kind: "room-door", x: c.x, z: c.z, yaw: headingOf(c, door.position), pitch: 0 });
    const first = exhibits[0];
    if (first) out.push({ id: `${first.id}#approach`, zoneId: r.zoneId, roomId: r.id, kind: "exhibit", x: first.approach.x, z: first.approach.z, yaw: headingOf(first.approach, first.position), pitch: 0 });
  }
  for (const p of model.portals) {
    // 1.6 m in front of the opening on the first room's side, looking through it.
    const r = model.rooms.find((x) => x.id === p.connects[0]);
    if (!r) continue;
    const c = { x: (r.bounds.minX + r.bounds.maxX) / 2, z: (r.bounds.minZ + r.bounds.maxZ) / 2 };
    const dir = p.axis === "z" ? { x: Math.sign(c.x - p.position.x) || 1, z: 0 } : { x: 0, z: Math.sign(c.z - p.position.z) || 1 };
    const at = { x: p.position.x + dir.x * 1.6, z: p.position.z + dir.z * 1.6 };
    if (!router.isFree(at)) continue;
    out.push({ id: `${p.id}#through`, zoneId: r.zoneId, roomId: r.id, kind: "doorway", x: at.x, z: at.z, yaw: headingOf(at, p.position), pitch: 0 });
  }
  return out;
}
