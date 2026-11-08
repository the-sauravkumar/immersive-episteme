const CELLS_PER_RADIUS = 2;
const KEY_OFFSET = 32768;

export interface NeighbourhoodGrid {
  readonly cells: number;
  readonly cellOfVertex: Int32Array;
  readonly members: Int32Array;
  readonly centres: Float64Array;
  readonly around: (x: number, y: number, z: number, visit: (cell: number, weight: number) => void) => void;
}

export function neighbourhoodGrid(positions: ArrayLike<number>, radius: number): NeighbourhoodGrid {
  const count = Math.floor(positions.length / 3);
  const size = radius / CELLS_PER_RADIUS;
  const cellOf = (value: number) => Math.floor(value / size);
  const keyOf = (x: number, y: number, z: number) => (x + KEY_OFFSET) * 4294967296 + (y + KEY_OFFSET) * 65536 + (z + KEY_OFFSET);
  const index = new Map<number, number>();
  const cellOfVertex = new Int32Array(count);
  const sums: number[] = [];
  const counts: number[] = [];
  for (let i = 0; i < count; i++) {
    const key = keyOf(cellOf(positions[i * 3]!), cellOf(positions[i * 3 + 1]!), cellOf(positions[i * 3 + 2]!));
    let cell = index.get(key);
    if (cell === undefined) {
      cell = counts.length;
      index.set(key, cell);
      counts.push(0);
      sums.push(0, 0, 0);
    }
    cellOfVertex[i] = cell;
    counts[cell]!++;
    for (let axis = 0; axis < 3; axis++) sums[cell * 3 + axis]! += positions[i * 3 + axis]!;
  }
  const members = Int32Array.from(counts);
  const centres = Float64Array.from(sums, (sum, at) => sum / counts[Math.floor(at / 3)]!);
  const around = (x: number, y: number, z: number, visit: (cell: number, weight: number) => void) => {
    const [cx, cy, cz] = [cellOf(x), cellOf(y), cellOf(z)];
    for (let a = -CELLS_PER_RADIUS; a <= CELLS_PER_RADIUS; a++) {
      for (let b = -CELLS_PER_RADIUS; b <= CELLS_PER_RADIUS; b++) {
        for (let c = -CELLS_PER_RADIUS; c <= CELLS_PER_RADIUS; c++) {
          const cell = index.get(keyOf(cx + a, cy + b, cz + c));
          if (cell === undefined) continue;
          const distance = Math.hypot(centres[cell * 3]! - x, centres[cell * 3 + 1]! - y, centres[cell * 3 + 2]! - z);
          if (distance < radius) visit(cell, 1 - distance / radius);
        }
      }
    }
  };
  return { cells: counts.length, cellOfVertex, members, centres, around };
}

const VERTICES_PER_STEP = 128;

export function* smoothedValueSteps(positions: ArrayLike<number>, values: ArrayLike<number>, width: number, radius: number): Generator<void, Float32Array> {
  const count = Math.floor(positions.length / 3);
  const grid = neighbourhoodGrid(positions, radius);
  const sums = new Float64Array(grid.cells * width);
  for (let i = 0; i < count; i++) for (let k = 0; k < width; k++) sums[grid.cellOfVertex[i]! * width + k]! += values[i * width + k]!;
  const smoothed = new Float32Array(count * width);
  const total = new Float64Array(width);
  for (let i = 0; i < count; i++) {
    if (i % VERTICES_PER_STEP === 0) yield;
    total.fill(0);
    let weights = 0;
    grid.around(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!, (cell, weight) => {
      weights += weight * grid.members[cell]!;
      for (let k = 0; k < width; k++) total[k]! += weight * sums[cell * width + k]!;
    });
    for (let k = 0; k < width; k++) smoothed[i * width + k] = total[k]! / weights;
  }
  return smoothed;
}
