/**
 * Walkable-cell grid over the floor plan. A cell is walkable when its centre lies inside a
 * room rectangle and outside every collider inflated by the visitor radius. Used both by the
 * compiler (routing paths) and by the validator (reachability), which rebuilds it from the
 * manifest alone so the check is independent of the layout engine.
 *
 * Search is 4-connected breadth-first with a fixed neighbour order (deterministic); routes
 * are then shortened by greedy line-of-sight smoothing against the same grid.
 */
import { round } from "./canonical";
import type { Collider, Point, Rect } from "./types";

const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export class NavGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly nx: number;
  readonly nz: number;
  readonly free: Uint8Array;

  constructor(
    rooms: readonly Rect[],
    colliders: readonly Collider[],
    readonly radius: number,
    readonly res: number,
  ) {
    const minX = Math.min(...rooms.map((r) => r.minX)) - 1;
    const maxX = Math.max(...rooms.map((r) => r.maxX)) + 1;
    const minZ = Math.min(...rooms.map((r) => r.minZ)) - 1;
    const maxZ = Math.max(...rooms.map((r) => r.maxZ)) + 1;
    this.minX = minX;
    this.minZ = minZ;
    this.nx = Math.ceil((maxX - minX) / res);
    this.nz = Math.ceil((maxZ - minZ) / res);
    this.free = new Uint8Array(this.nx * this.nz);
    for (const r of rooms) this.paint(r.minX, r.maxX, r.minZ, r.maxZ, 1);
    for (const c of colliders) this.paint(c.min[0] - radius, c.max[0] + radius, c.min[2] - radius, c.max[2] + radius, 0);
  }

  /** Set every cell whose centre lies inside [x0,x1] x [z0,z1] (closed for rooms, open for colliders). */
  private paint(x0: number, x1: number, z0: number, z1: number, value: 0 | 1) {
    const e = value === 1 ? 1e-9 : -1e-9;
    const i0 = Math.max(0, Math.ceil((x0 - e - this.minX) / this.res - 0.5));
    const i1 = Math.min(this.nx - 1, Math.floor((x1 + e - this.minX) / this.res - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - e - this.minZ) / this.res - 0.5));
    const j1 = Math.min(this.nz - 1, Math.floor((z1 + e - this.minZ) / this.res - 0.5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.free[j * this.nx + i] = value;
  }

  center(idx: number): Point {
    const i = idx % this.nx;
    const j = Math.floor(idx / this.nx);
    return { x: round(this.minX + (i + 0.5) * this.res), z: round(this.minZ + (j + 0.5) * this.res) };
  }

  cellOf(p: Point): number {
    const i = Math.floor((p.x - this.minX) / this.res);
    const j = Math.floor((p.z - this.minZ) / this.res);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  isFree(p: Point): boolean {
    const c = this.cellOf(p);
    return c >= 0 && this.free[c] === 1;
  }

  /** Nearest walkable cell to p within `maxDist` metres (ring search, deterministic). */
  nearestFree(p: Point, maxDist = 0.75): number {
    const c = this.cellOf(p);
    if (c >= 0 && this.free[c] === 1) return c;
    if (c < 0) return -1;
    const ci = c % this.nx;
    const cj = Math.floor(c / this.nx);
    const maxR = Math.ceil(maxDist / this.res);
    let best = -1;
    let bestD = Infinity;
    for (let r = 1; r <= maxR && best < 0; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const idx = j * this.nx + i;
          if (this.free[idx] !== 1) continue;
          const q = this.center(idx);
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d < bestD - 1e-9) {
            bestD = d;
            best = idx;
          }
        }
      }
    }
    return best;
  }

  /** Breadth-first search from `start`; returns the parent array (-1 = unreached, start = itself). */
  bfs(start: number, goal = -1): Int32Array {
    const parent = new Int32Array(this.free.length).fill(-1);
    if (start < 0 || this.free[start] !== 1) return parent;
    parent[start] = start;
    const queue = new Int32Array(this.free.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const cur = queue[head++]!;
      if (cur === goal) break;
      const i = cur % this.nx;
      const j = Math.floor(cur / this.nx);
      for (const [di, dj] of NEIGHBOURS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.nx || nj >= this.nz) continue;
        const n = nj * this.nx + ni;
        if (this.free[n] !== 1 || parent[n] !== -1) continue;
        parent[n] = cur;
        queue[tail++] = n;
      }
    }
    return parent;
  }

  /** Clear line of sight on the walkable grid (sampled every res/3). */
  segmentClear(a: Point, b: Point): boolean {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / (this.res / 3)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!this.isFree({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
  }

  /** Walkable route from a to b (both snapped to the nearest walkable cell), or null. */
  route(a: Point, b: Point): Point[] | null {
    const s = this.nearestFree(a);
    const g = this.nearestFree(b);
    if (s < 0 || g < 0) return null;
    const parent = this.bfs(s, g);
    if (parent[g] === -1) return null;
    const cells: number[] = [];
    for (let c = g; ; c = parent[c]!) {
      cells.push(c);
      if (c === s) break;
    }
    cells.reverse();
    const pts = cells.map((c) => this.center(c));
    // Greedy line-of-sight smoothing.
    const out: Point[] = [pts[0]!];
    let anchor = 0;
    for (let k = 1; k < pts.length; k++) {
      if (!this.segmentClear(pts[anchor]!, pts[k]!)) {
        out.push(pts[k - 1]!);
        anchor = k - 1;
      }
    }
    if (pts.length > 1) out.push(pts[pts.length - 1]!);
    return out;
  }
}
