import { neighbourhoodGrid } from "./neighbourhood-grid";

const SWEEPS = 10;
const TIE_BREAK: readonly [number, number, number] = [0.0031, 0.0083, 0.0047];

type Symmetric = readonly [number, number, number, number, number, number];

function flattestAxis(matrix: Symmetric): [number, number, number] {
  const a = [
    [matrix[0], matrix[1], matrix[2]],
    [matrix[1], matrix[3], matrix[4]],
    [matrix[2], matrix[4], matrix[5]],
  ];
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const pairs: readonly (readonly [number, number])[] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (const [p, q] of pairs) {
      const off = a[p]![q]!;
      if (Math.abs(off) < 1e-20) continue;
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * off);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;
      for (let k = 0; k < 3; k++) {
        const kp = a[k]![p]!;
        const kq = a[k]![q]!;
        a[k]![p] = c * kp - s * kq;
        a[k]![q] = s * kp + c * kq;
      }
      for (let k = 0; k < 3; k++) {
        const pk = a[p]![k]!;
        const qk = a[q]![k]!;
        a[p]![k] = c * pk - s * qk;
        a[q]![k] = s * pk + c * qk;
      }
      for (let k = 0; k < 3; k++) {
        const kp = v[k]![p]!;
        const kq = v[k]![q]!;
        v[k]![p] = c * kp - s * kq;
        v[k]![q] = s * kp + c * kq;
      }
    }
  }
  let least = 0;
  for (let j = 1; j < 3; j++) if (a[j]![j]! < a[least]![least]!) least = j;
  return [v[0]![least]!, v[1]![least]!, v[2]![least]!];
}

export function wallPlaneNormals(positions: ArrayLike<number>, radius: number): Float32Array {
  const count = Math.floor(positions.length / 3);
  const grid = neighbourhoodGrid(positions, radius);
  const products = new Float64Array(grid.cells * 6);
  const middle: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
    const at = grid.cellOfVertex[i]! * 6;
    products[at]! += x * x;
    products[at + 1]! += x * y;
    products[at + 2]! += x * z;
    products[at + 3]! += y * y;
    products[at + 4]! += y * z;
    products[at + 5]! += z * z;
    middle[0] += x / count;
    middle[1] += y / count;
    middle[2] += z / count;
  }
  const normals = new Float32Array(count * 3);
  const gathered = new Float64Array(6);
  const mean = new Float64Array(3);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
    gathered.fill(0);
    mean.fill(0);
    let weights = 0;
    grid.around(x, y, z, (cell, weight) => {
      const members = weight * grid.members[cell]!;
      weights += members;
      for (let axis = 0; axis < 3; axis++) mean[axis]! += members * grid.centres[cell * 3 + axis]!;
      for (let k = 0; k < 6; k++) gathered[k]! += weight * products[cell * 6 + k]!;
    });
    const [mx, my, mz] = [mean[0]! / weights, mean[1]! / weights, mean[2]! / weights];
    const axis = flattestAxis([gathered[0]! / weights - mx * mx, gathered[1]! / weights - mx * my, gathered[2]! / weights - mx * mz, gathered[3]! / weights - my * my, gathered[4]! / weights - my * mz, gathered[5]! / weights - mz * mz]);
    const outward = axis[0] * (x - middle[0] + TIE_BREAK[0]) + axis[1] * (y - middle[1] + TIE_BREAK[1]) + axis[2] * (z - middle[2] + TIE_BREAK[2]);
    const sign = outward < 0 ? -1 : 1;
    normals.set([axis[0] * sign, axis[1] * sign, axis[2] * sign], i * 3);
  }
  return normals;
}
