export interface ClothShading {
  readonly normals: Float32Array;
  readonly tangents: Float32Array;
}

const TRIANGLES_PER_STEP = 2048;
const VERTICES_PER_STEP = 4096;

function* vertexNormalSteps(positions: Float32Array, indices: Uint32Array, normals: Float32Array): Generator<void, void> {
  for (let i = 0; i < indices.length; i += 3) {
    if (i % (TRIANGLES_PER_STEP * 3) === 0) yield;
    const a = indices[i]! * 3;
    const b = indices[i + 1]! * 3;
    const c = indices[i + 2]! * 3;
    const cbx = positions[c]! - positions[b]!;
    const cby = positions[c + 1]! - positions[b + 1]!;
    const cbz = positions[c + 2]! - positions[b + 2]!;
    const abx = positions[a]! - positions[b]!;
    const aby = positions[a + 1]! - positions[b + 1]!;
    const abz = positions[a + 2]! - positions[b + 2]!;
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    const ax = normals[a]! + nx;
    const ay = normals[a + 1]! + ny;
    const az = normals[a + 2]! + nz;
    const bx = normals[b]! + nx;
    const by = normals[b + 1]! + ny;
    const bz = normals[b + 2]! + nz;
    const cx = normals[c]! + nx;
    const cy = normals[c + 1]! + ny;
    const cz = normals[c + 2]! + nz;
    normals[a] = ax;
    normals[a + 1] = ay;
    normals[a + 2] = az;
    normals[b] = bx;
    normals[b + 1] = by;
    normals[b + 2] = bz;
    normals[c] = cx;
    normals[c + 1] = cy;
    normals[c + 2] = cz;
  }
  for (let v = 0; v < normals.length; v += 3) {
    if (v % (VERTICES_PER_STEP * 3) === 0) yield;
    const x = normals[v]!;
    const y = normals[v + 1]!;
    const z = normals[v + 2]!;
    const scale = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    normals[v] = x * scale;
    normals[v + 1] = y * scale;
    normals[v + 2] = z * scale;
  }
}

function* tangentSteps(positions: Float32Array, uvs: Float32Array, indices: Uint32Array, normals: Float32Array, tangents: Float32Array): Generator<void, void> {
  const count = positions.length / 3;
  const along = new Float64Array(count * 3);
  const across = new Float64Array(count * 3);
  for (let i = 0; i < indices.length; i += 3) {
    if (i % (TRIANGLES_PER_STEP * 3) === 0) yield;
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    const ax = positions[a * 3]!;
    const ay = positions[a * 3 + 1]!;
    const az = positions[a * 3 + 2]!;
    const bx = positions[b * 3]! - ax;
    const by = positions[b * 3 + 1]! - ay;
    const bz = positions[b * 3 + 2]! - az;
    const cx = positions[c * 3]! - ax;
    const cy = positions[c * 3 + 1]! - ay;
    const cz = positions[c * 3 + 2]! - az;
    const au = uvs[a * 2]!;
    const av = uvs[a * 2 + 1]!;
    const bu = uvs[b * 2]! - au;
    const bv = uvs[b * 2 + 1]! - av;
    const cu = uvs[c * 2]! - au;
    const cv = uvs[c * 2 + 1]! - av;
    const r = 1.0 / (bu * cv - cu * bv);
    if (!isFinite(r)) continue;
    const sx = (bx * cv + cx * -bv) * r;
    const sy = (by * cv + cy * -bv) * r;
    const sz = (bz * cv + cz * -bv) * r;
    const tx = (cx * bu + bx * -cu) * r;
    const ty = (cy * bu + by * -cu) * r;
    const tz = (cz * bu + bz * -cu) * r;
    for (const v of [a, b, c]) {
      along[v * 3] = along[v * 3]! + sx;
      along[v * 3 + 1] = along[v * 3 + 1]! + sy;
      along[v * 3 + 2] = along[v * 3 + 2]! + sz;
      across[v * 3] = across[v * 3]! + tx;
      across[v * 3 + 1] = across[v * 3 + 1]! + ty;
      across[v * 3 + 2] = across[v * 3 + 2]! + tz;
    }
  }
  for (let i = 0; i < indices.length; i++) {
    if (i % (VERTICES_PER_STEP * 3) === 0) yield;
    const v = indices[i]!;
    const nx = normals[v * 3]!;
    const ny = normals[v * 3 + 1]!;
    const nz = normals[v * 3 + 2]!;
    const tx = along[v * 3]!;
    const ty = along[v * 3 + 1]!;
    const tz = along[v * 3 + 2]!;
    const d = nx * tx + ny * ty + nz * tz;
    const ox = tx - nx * d;
    const oy = ty - ny * d;
    const oz = tz - nz * d;
    const scale = 1 / (Math.sqrt(ox * ox + oy * oy + oz * oz) || 1);
    const hx = ny * tz - nz * ty;
    const hy = nz * tx - nx * tz;
    const hz = nx * ty - ny * tx;
    const test = hx * across[v * 3]! + hy * across[v * 3 + 1]! + hz * across[v * 3 + 2]!;
    tangents[v * 4] = ox * scale;
    tangents[v * 4 + 1] = oy * scale;
    tangents[v * 4 + 2] = oz * scale;
    tangents[v * 4 + 3] = test < 0.0 ? -1.0 : 1.0;
  }
}

export function* clothShadingSteps(positions: Float32Array, uvs: Float32Array, indices: Uint32Array): Generator<void, ClothShading> {
  const normals = new Float32Array(positions.length);
  yield* vertexNormalSteps(positions, indices, normals);
  const tangents = new Float32Array((positions.length / 3) * 4);
  yield* tangentSteps(positions, uvs, indices, normals, tangents);
  return { normals, tangents };
}
