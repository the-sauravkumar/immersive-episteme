/**
 * Axis-aligned architecture: room rectangles -> non-overlapping wall colliders with doorway
 * openings. Adapted from virtual-walkthrough src/museum/config/layout.ts (`WallBox`, the
 * door split in `wallXWithDoor` / `wallZWithDoor`), generalised from hand-placed walls to
 * walls derived from any rectilinear room plan.
 *
 * Construction (guarantees disjoint colliders by design; validate.ts re-checks it):
 *   1. every room side becomes an edge on a wall line; collinear edges are merged;
 *   2. every point where wall lines meet is a junction and gets a square post (t x t);
 *   3. each wall line is split at its junctions and every piece is shortened by t/2 at both
 *      ends, so pieces touch posts but never overlap them or each other;
 *   4. a doorway removes the stretch [centre - w/2, centre + w/2] from the piece it lies in.
 */
import { round } from "./canonical";
import { compareStrings } from "./prng";
import type { Collider, Point, Rect } from "./types";

export const EPS = 1e-6;

export type Orient = "h" | "v";
/** h: wall along x at z = c, spanning x in [a, b]; v: wall along z at x = c, spanning z in [a, b]. */
export interface WallEdge {
  orient: Orient;
  c: number;
  a: number;
  b: number;
}

export interface DoorOpening {
  id: string;
  orient: Orient;
  c: number;
  center: number;
  width: number;
}

export interface WallPiece extends WallEdge {
  id: string;
}

export function rectEdges(r: Rect): WallEdge[] {
  return [
    { orient: "h", c: r.minZ, a: r.minX, b: r.maxX },
    { orient: "h", c: r.maxZ, a: r.minX, b: r.maxX },
    { orient: "v", c: r.minX, a: r.minZ, b: r.maxZ },
    { orient: "v", c: r.maxX, a: r.minZ, b: r.maxZ },
  ];
}

const lineKey = (o: Orient, c: number) => `${o}:${round(c)}`;

function mergeIntervals(list: [number, number][]): [number, number][] {
  const sorted = [...list].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export interface WallBuild {
  pieces: WallPiece[];
  posts: Point[];
  colliders: Collider[];
  doorErrors: string[];
}

export function buildWalls(rooms: readonly Rect[], doors: readonly DoorOpening[], t: number, height: number): WallBuild {
  const lines = new Map<string, { orient: Orient; c: number; spans: [number, number][] }>();
  for (const r of rooms) {
    for (const e of rectEdges(r)) {
      const k = lineKey(e.orient, e.c);
      const line = lines.get(k) ?? lines.set(k, { orient: e.orient, c: round(e.c), spans: [] }).get(k)!;
      line.spans.push([e.a, e.b]);
    }
  }
  for (const line of lines.values()) line.spans = mergeIntervals(line.spans);

  const lineList = [...lines.values()].sort((p, q) => compareStrings(p.orient, q.orient) || p.c - q.c);
  const hLines = lineList.filter((l) => l.orient === "h");
  const vLines = lineList.filter((l) => l.orient === "v");
  const within = (spans: [number, number][], x: number) => spans.some(([a, b]) => x >= a - EPS && x <= b + EPS);

  const posts = new Map<string, Point>();
  const pieces: WallPiece[] = [];
  for (const line of lineList) {
    const perpendicular = line.orient === "h" ? vLines : hLines;
    for (const [a, b] of line.spans) {
      const cuts = new Set<number>([round(a), round(b)]);
      for (const p of perpendicular) {
        if (p.c < a - EPS || p.c > b + EPS) continue;
        if (within(p.spans, line.c)) cuts.add(round(p.c));
      }
      const xs = [...cuts].sort((p, q) => p - q);
      for (const x of xs) {
        const pt = line.orient === "h" ? { x, z: line.c } : { x: line.c, z: x };
        posts.set(`${round(pt.x)}:${round(pt.z)}`, pt);
      }
      for (let i = 0; i + 1 < xs.length; i++) {
        const s = xs[i]! + t / 2;
        const e = xs[i + 1]! - t / 2;
        if (e - s > EPS) pieces.push({ id: "", orient: line.orient, c: line.c, a: round(s), b: round(e) });
      }
    }
  }

  const doorErrors: string[] = [];
  let cut = pieces;
  for (const d of [...doors].sort((p, q) => compareStrings(p.id, q.id))) {
    const lo = d.center - d.width / 2;
    const hi = d.center + d.width / 2;
    const idx = cut.findIndex((p) => p.orient === d.orient && Math.abs(p.c - d.c) < EPS && lo >= p.a - EPS && hi <= p.b + EPS);
    if (idx < 0) {
      doorErrors.push(`Doorway ${d.id} (${d.orient} ${d.c} @ ${d.center}, w ${d.width}) does not fit inside a single wall piece`);
      continue;
    }
    const p = cut[idx]!;
    const next: WallPiece[] = [];
    if (lo - p.a > 0.01) next.push({ ...p, b: round(lo) });
    if (p.b - hi > 0.01) next.push({ ...p, a: round(hi) });
    cut = [...cut.slice(0, idx), ...next, ...cut.slice(idx + 1)];
  }

  const named = cut
    .map((p) => ({ ...p, id: `wall:${p.orient}:${round(p.c)}:${round(p.a)}` }))
    .sort((p, q) => compareStrings(p.id, q.id));
  const postList = [...posts.values()].sort((p, q) => p.x - q.x || p.z - q.z);
  const colliders: Collider[] = [
    ...named.map((p) => wallCollider(p, t, height)),
    ...postList.map((p) => ({
      id: `post:${round(p.x)}:${round(p.z)}`,
      kind: "post" as const,
      min: [round(p.x - t / 2), 0, round(p.z - t / 2)] as Collider["min"],
      max: [round(p.x + t / 2), round(height), round(p.z + t / 2)] as Collider["max"],
    })),
  ];
  return { pieces: named, posts: postList, colliders, doorErrors };
}

export function wallCollider(p: WallPiece, t: number, height: number): Collider {
  return p.orient === "h"
    ? { id: p.id, kind: "wall", min: [round(p.a), 0, round(p.c - t / 2)], max: [round(p.b), round(height), round(p.c + t / 2)] }
    : { id: p.id, kind: "wall", min: [round(p.c - t / 2), 0, round(p.a)], max: [round(p.c + t / 2), round(height), round(p.b)] };
}

/** Strict overlap of two colliders on the floor plane (touching is allowed). */
export function collidersOverlap(p: Collider, q: Collider, eps = 1e-4): boolean {
  return p.max[0] > q.min[0] + eps && q.max[0] > p.min[0] + eps && p.max[2] > q.min[2] + eps && q.max[2] > p.min[2] + eps;
}

export function pointInRect(p: Point, r: Rect, eps = EPS): boolean {
  return p.x >= r.minX - eps && p.x <= r.maxX + eps && p.z >= r.minZ - eps && p.z <= r.maxZ + eps;
}

/** Does segment a-b intersect the collider's floor rectangle inflated by `pad`? (slab test) */
export function segmentHitsCollider(a: Point, b: Point, c: Collider, pad = 0): boolean {
  const minX = c.min[0] - pad;
  const maxX = c.max[0] + pad;
  const minZ = c.min[2] - pad;
  const maxZ = c.max[2] + pad;
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clip(-dx, a.x - minX) || !clip(dx, maxX - a.x) || !clip(-dz, a.z - minZ) || !clip(dz, maxZ - a.z)) return false;
  // Require a proper interior crossing, not a graze along the boundary.
  return t1 - t0 > 1e-6;
}

export function polylineLength(points: readonly Point[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  return s;
}

export function rectCenter(r: Rect): Point {
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

export function roundRect(r: Rect): Rect {
  return { minX: round(r.minX), maxX: round(r.maxX), minZ: round(r.minZ), maxZ: round(r.maxZ) };
}

export function roundPoint(p: Point): Point {
  return { x: round(p.x), z: round(p.z) };
}
