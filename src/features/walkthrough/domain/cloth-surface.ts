import { samplePath, smoothstep, type Box, type Vec3 } from "./geometry";

export type HeightField = (x: number, z: number, y: number) => number;
export type FoldAmount = (point: Vec3) => number;

export interface ClothSpec {
  readonly points: readonly Vec3[];
  readonly width: number;
  readonly metresPerRepeat: number;
  readonly fold: number;
  readonly foldFrequency: number;
  readonly step: number;
  readonly columns: number;
  readonly foldAmount: FoldAmount;
  readonly field: HeightField;
  readonly startAlong?: Float32Array;
}

export interface ClothSurface {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly rows: number;
  readonly columns: number;
  readonly endAlong: Float32Array;
}

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const FOLD_FREE_ENDS_METRES = 0.6;
const BEND_SAGITTA_METRES = 0.00014;
const MOST_PIECES_PER_ROW = 7;
const LOW_CLOTH_METRES = 1.1;
const SETTLE_ROUNDS = 3;
const EASE_ROUNDS = 6;
export const EASE_BELOW_FIELD_METRES = 0.01;
const turnAt = (a: Vec3, b: Vec3, c: Vec3): number => {
  const u = normalize([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const v = normalize([c[0] - b[0], c[1] - b[1], c[2] - b[2]]);
  return Math.acos(Math.min(1, Math.max(-1, dot(u, v))));
};

const LOWEST_SOLID_CLOTH_METRES = 0.12;
const HIGHEST_BLOCKING_CLOTH_METRES = 2.1;

export function clothBodyBoxes(surface: ClothSurface): Box[] {
  const boxes: Box[] = [];
  let low: [number, number, number] | null = null;
  let high: [number, number, number] | null = null;
  const close = () => {
    if (low && high) boxes.push({ min: low, max: high });
    low = high = null;
  };
  for (let row = 0; row < surface.rows; row++) {
    let least = Infinity;
    let most = -Infinity;
    for (let column = 0; column < surface.columns; column++) {
      const y = surface.positions[(row * surface.columns + column) * 3 + 1]!;
      least = Math.min(least, y);
      most = Math.max(most, y);
    }
    if (most < LOWEST_SOLID_CLOTH_METRES || least > HIGHEST_BLOCKING_CLOTH_METRES) {
      close();
      continue;
    }
    const rowLow: [number, number, number] = low ?? [Infinity, Infinity, Infinity];
    const rowHigh: [number, number, number] = high ?? [-Infinity, -Infinity, -Infinity];
    for (let column = 0; column < surface.columns; column++) {
      const k = (row * surface.columns + column) * 3;
      for (let axis = 0; axis < 3; axis++) {
        rowLow[axis] = Math.min(rowLow[axis]!, surface.positions[k + axis]!);
        rowHigh[axis] = Math.max(rowHigh[axis]!, surface.positions[k + axis]!);
      }
    }
    low = rowLow;
    high = rowHigh;
  }
  close();
  return boxes;
}

export function settleCloth(spec: ClothSpec): ClothSurface {
  const path = samplePath(spec.points, spec.step);
  const rows = path.length;
  const cols = spec.columns + 1;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  let side: Vec3 = [1, 0, 0];
  for (let i = 0; i < rows; i++) {
    const point = path[i]!;
    const before = path[Math.max(0, i - 1)]!;
    const after = path[Math.min(rows - 1, i + 1)]!;
    const tangent = normalize([after[0] - before[0], after[1] - before[1], after[2] - before[2]]);
    if (Math.abs(tangent[1]) < 0.5) {
      let flat = normalize(cross(tangent, [0, 1, 0]));
      if (dot(flat, side) < 0) flat = [-flat[0], -flat[1], -flat[2]];
      side = normalize([side[0] + flat[0], side[1] + flat[1], side[2] + flat[2]]);
    }
    const normal = normalize(cross(tangent, side));
    const travelled = i * spec.step;
    const fromEnd = Math.min(travelled, (rows - 1 - i) * spec.step);
    const amount = spec.foldAmount(point) * smoothstep(0, FOLD_FREE_ENDS_METRES, fromEnd);
    for (let j = 0; j < cols; j++) {
      const v = j / spec.columns;
      const across = (v - 0.5) * spec.width;
      const selvedge = Math.sin(Math.PI * Math.min(1, v + 0.02));
      const fold =
        spec.fold *
        amount *
        (Math.sin(v * Math.PI * 2 * spec.foldFrequency + travelled * 0.55) + 0.32 * Math.sin(v * Math.PI * 2 * spec.foldFrequency * 2.3 + travelled * 1.3 + 1.7)) *
        (0.55 + 0.45 * selvedge);
      const k = (i * cols + j) * 3;
      positions[k] = point[0] + side[0] * across + normal[0] * fold;
      positions[k + 1] = point[1] + side[1] * across + normal[1] * fold;
      positions[k + 2] = point[2] + side[2] * across + normal[2] * fold;
      const m = (i * cols + j) * 2;
      uvs[m] = (i * spec.step) / spec.metresPerRepeat;
      uvs[m + 1] = v;
    }
  }
  const lift = () => {
    for (let k = 0; k < positions.length; k += 3) {
      const floor = spec.field(positions[k]!, positions[k + 2]!, positions[k + 1]!);
      if (positions[k + 1]! < floor) positions[k + 1] = floor;
    }
  };
  lift();
  const lowRows: number[] = [];
  for (let i = 1; i < rows - 1; i++) if (positions[(i * cols + (cols >> 1)) * 3 + 1]! < LOW_CLOTH_METRES) lowRows.push(i);
  const relax = (below: number) => {
    const next = positions.slice();
    for (const i of lowRows) {
      for (let j = 0; j < cols; j++) {
        const k = (i * cols + j) * 3;
        if (positions[k + 1]! >= LOW_CLOTH_METRES) continue;
        const left = positions[k + 1 - (j > 0 ? 3 : 0)]!;
        const right = positions[k + 1 + (j < cols - 1 ? 3 : 0)]!;
        const eased = positions[k + 1]! * 0.4 + (positions[k + 1 - cols * 3]! + positions[k + 1 + cols * 3]!) * 0.2 + (left + right) * 0.1;
        next[k + 1] = Math.max(eased, spec.field(positions[k]!, positions[k + 2]!, eased) - below);
      }
    }
    positions.set(next);
  };
  for (let iteration = 0; iteration < SETTLE_ROUNDS; iteration++) relax(0);
  for (let iteration = 0; iteration < EASE_ROUNDS; iteration++) relax(EASE_BELOW_FIELD_METRES);
  return refineBends(positions, uvs, rows, cols, spec);
}

function refineBends(positions: Float32Array, uvs: Float32Array, rows: number, cols: number, spec: ClothSpec): ClothSurface {
  const centre = (row: number): Vec3 => {
    const k = (row * cols + (cols >> 1)) * 3;
    return [positions[k]!, positions[k + 1]!, positions[k + 2]!];
  };
  const steps: number[] = [];
  let total = 1;
  for (let i = 0; i < rows - 1; i++) {
    const before = centre(Math.max(0, i - 1));
    const a = centre(i);
    const b = centre(i + 1);
    const after = centre(Math.min(rows - 1, i + 2));
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const turning = Math.max(turnAt(before, a, b), turnAt(a, b, after));
    const sagitta = (chord / 2) * Math.tan(turning / 4);
    const pieces = Math.min(MOST_PIECES_PER_ROW, Math.max(1, Math.ceil(Math.sqrt(sagitta / BEND_SAGITTA_METRES))));
    steps.push(pieces);
    total += pieces;
  }
  const outPositions = new Float32Array(total * cols * 3);
  const outUvs = new Float32Array(total * cols * 2);
  let row = 0;
  const hermite = (p0: number, p1: number, p2: number, p3: number, t: number) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  const clampRow = (r: number) => (r < 0 ? 0 : r > rows - 1 ? rows - 1 : r);
  for (let i = 0; i < rows - 1; i++) {
    const pieces = steps[i]!;
    for (let piece = 0; piece < pieces; piece++) {
      const t = piece / pieces;
      for (let j = 0; j < cols; j++) {
        const k = (row * cols + j) * 3;
        const base = j * 3;
        for (let axis = 0; axis < 3; axis++) {
          const here = positions[i * cols * 3 + base + axis]!;
          outPositions[k + axis] = piece === 0 ? here : hermite(positions[clampRow(i - 1) * cols * 3 + base + axis]!, here, positions[clampRow(i + 1) * cols * 3 + base + axis]!, positions[clampRow(i + 2) * cols * 3 + base + axis]!, t);
        }
        if (piece > 0) outPositions[k + 1] = Math.max(outPositions[k + 1]!, spec.field(outPositions[k]!, outPositions[k + 2]!, outPositions[k + 1]!));
        const m = (row * cols + j) * 2;
        outUvs[m] = uvs[(i * cols + j) * 2]! + (uvs[((i + 1) * cols + j) * 2]! - uvs[(i * cols + j) * 2]!) * t;
        outUvs[m + 1] = uvs[(i * cols + j) * 2 + 1]!;
      }
      row++;
    }
  }
  for (let j = 0; j < cols; j++) {
    for (let axis = 0; axis < 3; axis++) outPositions[(row * cols + j) * 3 + axis] = positions[((rows - 1) * cols + j) * 3 + axis]!;
    outUvs[(row * cols + j) * 2] = uvs[((rows - 1) * cols + j) * 2]!;
    outUvs[(row * cols + j) * 2 + 1] = uvs[((rows - 1) * cols + j) * 2 + 1]!;
  }
  const along = spec.startAlong ? Float32Array.from(spec.startAlong) : new Float32Array(cols);
  for (let j = 0; j < cols; j++) outUvs[j * 2] = along[j]!;
  for (let i = 1; i < total; i++) {
    for (let j = 0; j < cols; j++) {
      const k = (i * cols + j) * 3;
      const p = k - cols * 3;
      along[j] = along[j]! + Math.hypot(outPositions[k]! - outPositions[p]!, outPositions[k + 1]! - outPositions[p + 1]!, outPositions[k + 2]! - outPositions[p + 2]!) / spec.metresPerRepeat;
      outUvs[(i * cols + j) * 2] = along[j]!;
    }
  }
  const indices = new Uint32Array((total - 1) * spec.columns * 6);
  let n = 0;
  for (let i = 0; i < total - 1; i++) {
    for (let j = 0; j < spec.columns; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices[n++] = a;
      indices[n++] = c;
      indices[n++] = b;
      indices[n++] = b;
      indices[n++] = c;
      indices[n++] = d;
    }
  }
  return { positions: outPositions, uvs: outUvs, indices, rows: total, columns: cols, endAlong: along };
}
