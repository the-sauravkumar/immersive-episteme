import { samplePath, type Vec3 } from "./geometry";

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
}

export interface ClothSurface {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly rows: number;
  readonly columns: number;
}

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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
    const amount = spec.foldAmount(point);
    for (let j = 0; j < cols; j++) {
      const v = j / spec.columns;
      const across = (v - 0.5) * spec.width;
      const selvedge = Math.sin(Math.PI * Math.min(1, v + 0.02));
      const fold =
        spec.fold *
        amount *
        (Math.sin(v * Math.PI * 2 * spec.foldFrequency + travelled * 0.55) + 0.5 * Math.sin(v * Math.PI * 2 * spec.foldFrequency * 2.3 + travelled * 1.3 + 1.7)) *
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
  for (let iteration = 0; iteration < 6; iteration++) {
    for (let i = 1; i < rows - 1; i++) {
      for (let j = 0; j < cols; j++) {
        const k = (i * cols + j) * 3 + 1;
        if (positions[k]! < 1.1) positions[k] = positions[k]! * 0.5 + (positions[k - cols * 3]! + positions[k + cols * 3]!) * 0.25;
      }
    }
    lift();
  }
  const indices = new Uint32Array((rows - 1) * spec.columns * 6);
  let n = 0;
  for (let i = 0; i < rows - 1; i++) {
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
  return { positions, uvs, indices, rows, columns: cols };
}
