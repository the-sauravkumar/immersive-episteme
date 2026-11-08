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
const ROWS_PER_STEP = 24;
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

export function* clothSettlingSteps(spec: ClothSpec): Generator<void, ClothSurface> {
  const path = samplePath(spec.points, spec.step);
  const rows = path.length;
  const cols = spec.columns + 1;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  let side: Vec3 = [1, 0, 0];
  for (let i = 0; i < rows; i++) {
    if (i % ROWS_PER_STEP === 0) yield;
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
  for (let k = 0; k < positions.length; k += 3) {
    if (k % (ROWS_PER_STEP * cols * 3) === 0) yield;
    const floor = spec.field(positions[k]!, positions[k + 2]!, positions[k + 1]!);
    if (positions[k + 1]! < floor) positions[k + 1] = floor;
  }
  const lowRows: number[] = [];
  for (let i = 1; i < rows - 1; i++) if (positions[(i * cols + (cols >> 1)) * 3 + 1]! < LOW_CLOTH_METRES) lowRows.push(i);
  function* relax(below: number): Generator<void, void> {
    const next = positions.slice();
    for (const [n, i] of lowRows.entries()) {
      if (n % ROWS_PER_STEP === 0) yield;
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
  }
  for (let iteration = 0; iteration < SETTLE_ROUNDS; iteration++) yield* relax(0);
  for (let iteration = 0; iteration < EASE_ROUNDS; iteration++) yield* relax(EASE_BELOW_FIELD_METRES);
  return yield* refinedBendSteps(positions, uvs, rows, cols, spec);
}

export function* settledClothSteps(specs: readonly ClothSpec[]): Generator<void, ClothSurface[]> {
  const surfaces: ClothSurface[] = [];
  for (const spec of specs) {
    const startAlong = surfaces[surfaces.length - 1]?.endAlong;
    surfaces.push(yield* clothSettlingSteps(startAlong ? { ...spec, startAlong } : spec));
  }
  return surfaces;
}

function* refinedBendSteps(positions: Float32Array, uvs: Float32Array, rows: number, cols: number, spec: ClothSpec): Generator<void, ClothSurface> {
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
    if (i % ROWS_PER_STEP === 0) yield;
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
        if (piece > 0) {
          const height = outPositions[k + 1]!;
          const slack = height < LOW_CLOTH_METRES ? EASE_BELOW_FIELD_METRES : 0;
          outPositions[k + 1] = Math.max(height, spec.field(outPositions[k]!, outPositions[k + 2]!, height) - slack);
        }
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

export interface FoldedPileSpec {
  readonly sizeLong: number;
  readonly sizeShort: number;
  readonly layers: number;
  readonly pitch: number;
  readonly thickness: number;
  readonly floorY: number;
  readonly longOnX: boolean;
  readonly centre: number;
  readonly seed: number;
}

export interface FoldedPile {
  readonly positions: Float32Array;
  readonly shade: Float32Array;
  readonly indices: Uint32Array;
}

const FOLD_STATIONS = 26;
const FOLD_FLAT_POINTS = 14;
const FOLD_ROUND_POINTS = 7;
const FOLD_LAP_POINTS = 3;
const FOLD_LOOP = FOLD_FLAT_POINTS * 2 + FOLD_ROUND_POINTS + FOLD_LAP_POINTS;
const LAYER_SHIFT_METRES = 0.011;
const PILE_SLUMP_METRES = 0.016;
const PILE_SAG_METRES = 0.016;
const TOP_FOLD_LIFT_METRES = 0.014;
const LAP_THICKNESS_SHARE = 0.34;

const wobble = (a: number, b: number, seed: number): number => Math.sin(a * 2.3 + seed * 1.7) * 0.5 + Math.sin(b * 3.1 - seed * 0.9) * 0.3 + Math.sin((a + b) * 6.7 + seed * 2.9) * 0.2;

function layerJitter(at: number): number {
  const value = Math.sin(at * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function foldedPile(spec: FoldedPileSpec): FoldedPile {
  const count = spec.layers * (FOLD_STATIONS + 1) * FOLD_LOOP;
  const positions = new Float32Array(count * 3);
  const shade = new Float32Array(count);
  const indices = new Uint32Array(spec.layers * FOLD_STATIONS * FOLD_LOOP * 6);
  const pileHeight = spec.layers * spec.pitch;
  const margin = LAYER_SHIFT_METRES + PILE_SLUMP_METRES;
  const halfLong = spec.sizeLong / 2 - margin;
  const halfShort = spec.sizeShort / 2 - margin;
  let vertex = 0;
  let index = 0;
  for (let layer = 0; layer < spec.layers; layer++) {
    const seed = spec.seed * 7.1 + layer * 2.37;
    const thin = 0.78 + 0.22 * (0.5 + 0.5 * layerJitter(seed * 3.3));
    const half = (spec.thickness / 2) * thin;
    const shiftLong = LAYER_SHIFT_METRES * layerJitter(seed * 1.9) * 0.9;
    const shiftShort = LAYER_SHIFT_METRES * layerJitter(seed * 2.7 + 1) * 0.9;
    const trimLong = 1 - 0.06 * (0.5 + 0.5 * layerJitter(seed * 4.1));
    const trimShort = 1 - 0.08 * (0.5 + 0.5 * layerJitter(seed * 5.3));
    const midY = spec.floorY + spec.pitch * (layer + 0.5);
    const isTop = layer === spec.layers - 1;
    for (let station = 0; station <= FOLD_STATIONS; station++) {
      const l = (station / FOLD_STATIONS) * 2 - 1;
      const endClose = Math.sqrt(Math.max(0, 1 - Math.abs(l) ** 8));
      for (let point = 0; point < FOLD_LOOP; point++) {
        let s: number;
        let h: number;
        let contact: number;
        if (point < FOLD_FLAT_POINTS) {
          const t = point / (FOLD_FLAT_POINTS - 1);
          s = -1 + 2 * t;
          h = LAP_THICKNESS_SHARE + (1 - LAP_THICKNESS_SHARE) * smoothstep(0, 0.22, t);
          contact = 1;
        } else if (point < FOLD_FLAT_POINTS + FOLD_ROUND_POINTS) {
          const a = ((point - FOLD_FLAT_POINTS + 1) / (FOLD_ROUND_POINTS + 1)) * Math.PI;
          s = 1 + (Math.sin(a) * half) / (halfShort * trimShort);
          h = Math.cos(a);
          contact = 0.58 + 0.42 * Math.abs(Math.cos(a));
        } else if (point < FOLD_FLAT_POINTS + FOLD_ROUND_POINTS + FOLD_FLAT_POINTS) {
          const t = (point - FOLD_FLAT_POINTS - FOLD_ROUND_POINTS) / (FOLD_FLAT_POINTS - 1);
          s = 1 - 2 * t;
          h = -(LAP_THICKNESS_SHARE + (1 - LAP_THICKNESS_SHARE) * smoothstep(0, 0.22, 1 - t));
          contact = 0.45;
        } else {
          const a = ((point - FOLD_FLAT_POINTS * 2 - FOLD_ROUND_POINTS + 1) / (FOLD_LAP_POINTS + 1)) * Math.PI;
          s = -1 - (Math.sin(a) * half * LAP_THICKNESS_SHARE) / (halfShort * trimShort);
          h = -Math.cos(a) * LAP_THICKNESS_SHARE;
          contact = 0.5;
        }
        const longAt = l * halfLong * trimLong + shiftLong;
        const shortAt = s * halfShort * trimShort + shiftShort;
        const puff = 0.82 + 0.18 * wobble(l * 2.1, s * 1.7, seed);
        let y = midY + h * half * puff * endClose;
        if (isTop) y += TOP_FOLD_LIFT_METRES * smoothstep(0.35, -1, s) * (0.5 + 0.5 * wobble(l * 1.4, 0.3, seed));
        const q = (y - spec.floorY) / pileHeight;
        const slump = PILE_SLUMP_METRES * q * q * (0.65 + 0.35 * Math.sin(spec.seed * 2.1 + l * 2));
        y += PILE_SAG_METRES * q * (0.55 * wobble(l * 1.3, s * 1.1, spec.seed * 3.3) - 0.5 * (Math.abs(s) ** 3 + Math.abs(l) ** 4));
        const across = shortAt + slump;
        const lengthwise = longAt + slump * 0.4 * Math.sin(spec.seed + 1.1);
        positions[vertex * 3] = spec.longOnX ? spec.centre + lengthwise : across;
        positions[vertex * 3 + 1] = y;
        positions[vertex * 3 + 2] = spec.longOnX ? across : spec.centre + lengthwise;
        shade[vertex] = contact * (endClose < 0.7 ? 0.5 + 0.5 * (endClose / 0.7) : 1);
        vertex++;
      }
    }
    const base = layer * (FOLD_STATIONS + 1) * FOLD_LOOP;
    for (let station = 0; station < FOLD_STATIONS; station++) {
      for (let point = 0; point < FOLD_LOOP; point++) {
        const next = (point + 1) % FOLD_LOOP;
        const a = base + station * FOLD_LOOP + point;
        const b = base + station * FOLD_LOOP + next;
        const c = a + FOLD_LOOP;
        const d = b + FOLD_LOOP;
        if (spec.longOnX) {
          indices[index++] = a;
          indices[index++] = b;
          indices[index++] = c;
          indices[index++] = b;
          indices[index++] = d;
          indices[index++] = c;
        } else {
          indices[index++] = a;
          indices[index++] = c;
          indices[index++] = b;
          indices[index++] = b;
          indices[index++] = c;
          indices[index++] = d;
        }
      }
    }
  }
  return { positions, shade, indices };
}
