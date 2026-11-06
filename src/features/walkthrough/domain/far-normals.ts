const CELLS_PER_RADIUS = 2;

interface Cell {
  normal: [number, number, number];
  centre: [number, number, number];
  members: number;
}

export function smoothedNormals(positions: ArrayLike<number>, normals: ArrayLike<number>, radius: number): Float32Array {
  const count = Math.floor(positions.length / 3);
  const size = radius / CELLS_PER_RADIUS;
  const cellOf = (value: number) => Math.floor(value / size);
  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const cells = new Map<string, Cell>();
  for (let i = 0; i < count; i++) {
    const key = keyOf(cellOf(positions[i * 3]!), cellOf(positions[i * 3 + 1]!), cellOf(positions[i * 3 + 2]!));
    const cell = cells.get(key) ?? { normal: [0, 0, 0], centre: [0, 0, 0], members: 0 };
    for (let axis = 0; axis < 3; axis++) {
      cell.normal[axis]! += normals[i * 3 + axis]!;
      cell.centre[axis]! += positions[i * 3 + axis]!;
    }
    cell.members++;
    cells.set(key, cell);
  }
  for (const cell of cells.values()) for (let axis = 0; axis < 3; axis++) cell.centre[axis]! /= cell.members;
  const smoothed = new Float32Array(count * 3);
  const reach = CELLS_PER_RADIUS;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const [cx, cy, cz] = [cellOf(x), cellOf(y), cellOf(z)];
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let a = -reach; a <= reach; a++) {
      for (let b = -reach; b <= reach; b++) {
        for (let c = -reach; c <= reach; c++) {
          const cell = cells.get(keyOf(cx + a, cy + b, cz + c));
          if (!cell) continue;
          const distance = Math.hypot(cell.centre[0] - x, cell.centre[1] - y, cell.centre[2] - z);
          if (distance >= radius) continue;
          const weight = 1 - distance / radius;
          sx += cell.normal[0] * weight;
          sy += cell.normal[1] * weight;
          sz += cell.normal[2] * weight;
        }
      }
    }
    const length = Math.hypot(sx, sy, sz);
    if (length < 1e-6) smoothed.set([normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!], i * 3);
    else smoothed.set([sx / length, sy / length, sz / length], i * 3);
  }
  return smoothed;
}
