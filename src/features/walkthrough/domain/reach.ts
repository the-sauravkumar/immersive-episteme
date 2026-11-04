import type { Box, Vec3 } from "./geometry";
import { BODY_RADIUS, blocksBody } from "./walk-state";
import { EYE_HEIGHT } from "./yard-plan";

export interface ReachField {
  readonly minX: number;
  readonly minZ: number;
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly squaredCells: Float32Array;
  readonly nearestCell: Int32Array;
}

export interface WalkArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface NearestEye {
  readonly distance: number;
  readonly eye: Vec3;
}

const CELL_METRES = 0.05;

function walkableFrom(area: WalkArea, colliders: readonly Box[], seed: readonly [number, number]): { free: Uint8Array; columns: number; rows: number } {
  const columns = Math.ceil((area.maxX - area.minX) / CELL_METRES) + 1;
  const rows = Math.ceil((area.maxZ - area.minZ) / CELL_METRES) + 1;
  const open = new Uint8Array(columns * rows).fill(1);
  for (const box of colliders) {
    if (!blocksBody(box)) continue;
    const firstColumn = Math.max(0, Math.ceil((box.min[0] - BODY_RADIUS - area.minX) / CELL_METRES));
    const lastColumn = Math.min(columns - 1, Math.floor((box.max[0] + BODY_RADIUS - area.minX) / CELL_METRES));
    const firstRow = Math.max(0, Math.ceil((box.min[2] - BODY_RADIUS - area.minZ) / CELL_METRES));
    const lastRow = Math.min(rows - 1, Math.floor((box.max[2] + BODY_RADIUS - area.minZ) / CELL_METRES));
    for (let row = firstRow; row <= lastRow; row++) open.fill(0, firstColumn + row * columns, lastColumn + row * columns + 1);
  }
  const free = new Uint8Array(columns * rows);
  const startColumn = Math.round((seed[0] - area.minX) / CELL_METRES);
  const startRow = Math.round((seed[1] - area.minZ) / CELL_METRES);
  const stack = [startColumn + startRow * columns];
  while (stack.length > 0) {
    const at = stack.pop()!;
    if (at < 0 || at >= free.length || free[at] || !open[at]) continue;
    free[at] = 1;
    const column = at % columns;
    if (column > 0) stack.push(at - 1);
    if (column < columns - 1) stack.push(at + 1);
    stack.push(at - columns, at + columns);
  }
  return { free, columns, rows };
}

function distanceAlong(source: Float32Array, sourceFrom: Int32Array, count: number, target: Float32Array, targetFrom: Int32Array, stride: number, offset: number): void {
  const parabolas = new Int32Array(count);
  const bounds = new Float64Array(count + 1);
  let k = -1;
  for (let q = 0; q < count; q++) {
    const value = source[offset + q * stride]!;
    if (!Number.isFinite(value)) continue;
    let s = -Infinity;
    while (k >= 0) {
      const p = parabolas[k]!;
      const other = source[offset + p * stride]!;
      s = (value + q * q - other - p * p) / (2 * q - 2 * p);
      if (s > bounds[k]!) break;
      k--;
    }
    k++;
    parabolas[k] = q;
    bounds[k] = k === 0 ? -Infinity : s;
    bounds[k + 1] = Infinity;
  }
  if (k < 0) {
    for (let q = 0; q < count; q++) {
      target[offset + q * stride] = Infinity;
      targetFrom[offset + q * stride] = -1;
    }
    return;
  }
  let at = 0;
  for (let q = 0; q < count; q++) {
    while (bounds[at + 1]! < q) at++;
    const p = parabolas[at]!;
    target[offset + q * stride] = (q - p) * (q - p) + source[offset + p * stride]!;
    targetFrom[offset + q * stride] = sourceFrom[offset + p * stride]!;
  }
}

export function reachField(area: WalkArea, colliders: readonly Box[], seed: readonly [number, number]): ReachField {
  const { free, columns, rows } = walkableFrom(area, colliders, seed);
  const first = new Float32Array(columns * rows);
  const firstFrom = new Int32Array(columns * rows);
  for (let i = 0; i < first.length; i++) {
    first[i] = free[i] ? 0 : Infinity;
    firstFrom[i] = free[i] ? i : -1;
  }
  const between = new Float32Array(columns * rows);
  const betweenFrom = new Int32Array(columns * rows);
  for (let row = 0; row < rows; row++) distanceAlong(first, firstFrom, columns, between, betweenFrom, 1, row * columns);
  const squaredCells = new Float32Array(columns * rows);
  const nearestCell = new Int32Array(columns * rows);
  for (let column = 0; column < columns; column++) distanceAlong(between, betweenFrom, rows, squaredCells, nearestCell, columns, column);
  return { minX: area.minX, minZ: area.minZ, cell: CELL_METRES, columns, rows, squaredCells, nearestCell };
}

export function nearestEye(field: ReachField, point: Vec3): NearestEye {
  const column = Math.min(field.columns - 1, Math.max(0, Math.round((point[0] - field.minX) / field.cell)));
  const row = Math.min(field.rows - 1, Math.max(0, Math.round((point[2] - field.minZ) / field.cell)));
  const at = column + row * field.columns;
  const from = field.nearestCell[at]!;
  if (from < 0) return { distance: Infinity, eye: [point[0], EYE_HEIGHT, point[2]] };
  const eye: Vec3 = [field.minX + (from % field.columns) * field.cell, EYE_HEIGHT, field.minZ + Math.floor(from / field.columns) * field.cell];
  return { distance: Math.hypot(eye[0] - point[0], eye[1] - point[1], eye[2] - point[2]), eye };
}
