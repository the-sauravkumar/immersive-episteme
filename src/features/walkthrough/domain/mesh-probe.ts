import type { Vec3 } from "./geometry";

export interface TriangleGrid {
  readonly triangles: Float32Array;
  readonly min: Vec3;
  readonly cellSize: Vec3;
  readonly cells: readonly [number, number, number];
  readonly buckets: readonly (readonly number[] | undefined)[];
  readonly seen: Uint32Array;
  stamp: number;
}

export interface RayHit {
  readonly distance: number;
  readonly facing: number;
}

const GRID_PADDING = 1e-4;
const TARGET_TRIANGLES_PER_CELL = 8;
const LARGEST_AXIS_CELLS = 64;

export function buildTriangleGrid(triangles: Float32Array): TriangleGrid {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < triangles.length; k++) {
    const axis = k % 3;
    low[axis] = Math.min(low[axis]!, triangles[k]!);
    high[axis] = Math.max(high[axis]!, triangles[k]!);
  }
  const size = [0, 1, 2].map((axis) => Math.max(high[axis]! - low[axis]!, GRID_PADDING));
  const count = triangles.length / 9;
  const unit = Math.cbrt((size[0]! * size[1]! * size[2]! * TARGET_TRIANGLES_PER_CELL) / Math.max(count, 1));
  const cells = [0, 1, 2].map((axis) => Math.min(LARGEST_AXIS_CELLS, Math.max(1, Math.ceil(size[axis]! / unit)))) as [number, number, number];
  const min: Vec3 = [low[0]! - GRID_PADDING, low[1]! - GRID_PADDING, low[2]! - GRID_PADDING];
  const cellSize: Vec3 = [(size[0]! + GRID_PADDING * 2) / cells[0], (size[1]! + GRID_PADDING * 2) / cells[1], (size[2]! + GRID_PADDING * 2) / cells[2]];
  const buckets: (number[] | undefined)[] = new Array(cells[0] * cells[1] * cells[2]);
  const cellOf = (value: number, axis: 0 | 1 | 2) => Math.min(cells[axis] - 1, Math.max(0, Math.floor((value - min[axis]) / cellSize[axis])));
  for (let t = 0; t < count; t++) {
    const o = t * 9;
    const from = ([0, 1, 2] as const).map((axis) => cellOf(Math.min(triangles[o + axis]!, triangles[o + 3 + axis]!, triangles[o + 6 + axis]!), axis));
    const to = ([0, 1, 2] as const).map((axis) => cellOf(Math.max(triangles[o + axis]!, triangles[o + 3 + axis]!, triangles[o + 6 + axis]!), axis));
    for (let x = from[0]!; x <= to[0]!; x++) {
      for (let y = from[1]!; y <= to[1]!; y++) {
        for (let z = from[2]!; z <= to[2]!; z++) {
          const key = x + cells[0] * (y + cells[1] * z);
          (buckets[key] ??= []).push(t);
        }
      }
    }
  }
  return { triangles, min, cellSize, cells, buckets, seen: new Uint32Array(count), stamp: 0 };
}

function hitTriangle(triangles: Float32Array, o: number, origin: Vec3, direction: Vec3): RayHit | null {
  const ax = triangles[o]!;
  const ay = triangles[o + 1]!;
  const az = triangles[o + 2]!;
  const e1x = triangles[o + 3]! - ax;
  const e1y = triangles[o + 4]! - ay;
  const e1z = triangles[o + 5]! - az;
  const e2x = triangles[o + 6]! - ax;
  const e2y = triangles[o + 7]! - ay;
  const e2z = triangles[o + 8]! - az;
  const px = direction[1] * e2z - direction[2] * e2y;
  const py = direction[2] * e2x - direction[0] * e2z;
  const pz = direction[0] * e2y - direction[1] * e2x;
  const determinant = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(determinant) < 1e-14) return null;
  const inverse = 1 / determinant;
  const tx = origin[0] - ax;
  const ty = origin[1] - ay;
  const tz = origin[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inverse;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) * inverse;
  if (v < 0 || u + v > 1) return null;
  const distance = (e2x * qx + e2y * qy + e2z * qz) * inverse;
  if (distance <= 0) return null;
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  return { distance, facing: Math.sign(nx * direction[0] + ny * direction[1] + nz * direction[2]) };
}

export function firstHit(grid: TriangleGrid, origin: Vec3, direction: Vec3): RayHit | null {
  const { cells, cellSize, min, buckets, triangles, seen } = grid;
  let entry = 0;
  let exit = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const low = min[axis]!;
    const high = low + cellSize[axis]! * cells[axis]!;
    const d = direction[axis]!;
    if (Math.abs(d) < 1e-12) {
      if (origin[axis]! < low || origin[axis]! > high) return null;
      continue;
    }
    const a = (low - origin[axis]!) / d;
    const b = (high - origin[axis]!) / d;
    entry = Math.max(entry, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  if (entry > exit) return null;
  grid.stamp++;
  const cell = [0, 0, 0];
  const step = [0, 0, 0];
  const next = [0, 0, 0];
  const delta = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const start = origin[axis]! + direction[axis]! * entry;
    cell[axis] = Math.min(cells[axis]! - 1, Math.max(0, Math.floor((start - min[axis]!) / cellSize[axis]!)));
    const d = direction[axis]!;
    step[axis] = d > 0 ? 1 : d < 0 ? -1 : 0;
    delta[axis] = d === 0 ? Infinity : cellSize[axis]! / Math.abs(d);
    next[axis] = d === 0 ? Infinity : (min[axis]! + (cell[axis]! + (d > 0 ? 1 : 0)) * cellSize[axis]! - origin[axis]!) / d;
  }
  let best: RayHit | null = null;
  for (;;) {
    const bucket = buckets[cell[0]! + cells[0] * (cell[1]! + cells[1] * cell[2]!)];
    if (bucket) {
      for (const t of bucket) {
        if (seen[t] === grid.stamp) continue;
        seen[t] = grid.stamp;
        const hit = hitTriangle(triangles, t * 9, origin, direction);
        if (hit && (!best || hit.distance < best.distance)) best = hit;
      }
    }
    const axis = next[0]! < next[1]! ? (next[0]! < next[2]! ? 0 : 2) : next[1]! < next[2]! ? 1 : 2;
    if (best && best.distance <= next[axis]!) return best;
    if (next[axis]! > exit) return best;
    cell[axis]! += step[axis]!;
    if (cell[axis]! < 0 || cell[axis]! >= cells[axis]!) return best;
    next[axis]! += delta[axis]!;
  }
}

export interface VesselProbe {
  readonly grid: TriangleGrid;
  readonly rimY: number;
  readonly axisX: number;
  readonly axisZ: number;
  readonly cavitySign: number;
}

const DIRECTIONS = 16;
const DIRECTIONS_REQUIRED = 11;
const RAY_TILTS = [0, -0.35, 0.2, -0.7] as const;
const BELOW_RIM_METRES = 0.003;
export const VESSEL_TUCK_METRES = 0.003;
const EMBEDDED_DIRECTIONS = 14;
const DOWN_RAYS: readonly Vec3[] = [[0, -1, 0], ...[0.2, 0.45, 0.8].flatMap((spread) => Array.from({ length: 12 }, (_, i): Vec3 => {
  const angle = (i / 12) * Math.PI * 2 + spread;
  const length = Math.hypot(spread, 1);
  return [(Math.cos(angle) * spread) / length, -1 / length, (Math.sin(angle) * spread) / length];
}))];

function directionsCovered(probe: VesselProbe, point: Vec3): { covered: number; embedded: number } {
  let covered = 0;
  let embedded = 0;
  for (let d = 0; d < DIRECTIONS; d++) {
    const angle = (d / DIRECTIONS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let first: RayHit | null = null;
    for (const tilt of RAY_TILTS) {
      const length = Math.hypot(1, tilt);
      first = firstHit(probe.grid, point, [cos / length, tilt / length, sin / length]);
      if (first) break;
    }
    if (!first) continue;
    covered++;
    if (first.facing !== probe.cavitySign) embedded++;
  }
  return { covered, embedded };
}

export function makeVesselProbe(triangles: Float32Array, axisX: number, axisZ: number, rimY: number, floorY: number): VesselProbe {
  const grid = buildTriangleGrid(triangles);
  const unsigned: VesselProbe = { grid, rimY, axisX, axisZ, cavitySign: 0 };
  let balance = 0;
  const middle: Vec3 = [axisX, floorY + (rimY - floorY) * 0.5, axisZ];
  for (let d = 0; d < DIRECTIONS; d++) {
    const angle = (d / DIRECTIONS) * Math.PI * 2;
    balance += firstHit(grid, middle, [Math.cos(angle), 0, Math.sin(angle)])?.facing ?? 0;
  }
  const cavitySign = Math.abs(balance) >= DIRECTIONS / 2 ? Math.sign(balance) : 0;
  if (cavitySign === 0) throw new Error("Vessel probe cannot tell the cavity side of this mesh");
  return { ...unsigned, cavitySign };
}

export function vertexOutsideVessel(probe: VesselProbe, point: Vec3, tuckMetres: number): boolean {
  const dx = point[0] - probe.axisX;
  const dz = point[2] - probe.axisZ;
  const reach = Math.hypot(dx, dz);
  const pull = reach > tuckMetres ? (reach - tuckMetres) / reach : 0;
  const inner: Vec3 = [probe.axisX + dx * pull, Math.min(point[1], probe.rimY - BELOW_RIM_METRES), probe.axisZ + dz * pull];
  if (!DOWN_RAYS.some((ray) => firstHit(probe.grid, inner, ray))) return true;
  const { covered, embedded } = directionsCovered(probe, inner);
  return covered < DIRECTIONS_REQUIRED || embedded >= EMBEDDED_DIRECTIONS;
}
