import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { seededRandom, type PieceSphere } from "../domain/pile-packing";

export type Tone = readonly [number, number, number];
export type Point = readonly [number, number, number];

export const PLAIN: Tone = [1, 1, 1];

export interface PieceShape {
  readonly geometry: THREE.BufferGeometry;
  readonly spheres: readonly PieceSphere[];
}

export interface PieceVariant extends PieceShape {
  readonly buried: THREE.BufferGeometry;
}

export const mixTone = (a: Tone, b: Tone, share: number): Tone => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share];
export const shadeTone = (tone: Tone, by: number): Tone => [tone[0] * by, tone[1] * by, tone[2] * by];
export const smoothstep = (low: number, high: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return (
    lerp(
      lerp(lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), u), lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), u), v),
      lerp(lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), u), lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), u), v),
      w,
    ) *
      2 -
    1
  );
}

export const layered = (x: number, y: number, z: number, scale: number, seed: number): number => noise3(x * scale + seed, y * scale - seed, z * scale) * 0.6 + noise3(x * scale * 2.3 - seed, y * scale * 2.3, z * scale * 2.3 + seed) * 0.28 + noise3(x * scale * 5.1, y * scale * 5.1 + seed, z * scale * 5.1) * 0.12;

export class PieceMesh {
  private readonly positions: number[] = [];
  private readonly colours: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(point: Point, tone: Tone, u = 0, v = 0): number {
    this.positions.push(point[0], point[1], point[2]);
    this.colours.push(tone[0], tone[1], tone[2]);
    this.uvs.push(u, v);
    return this.vertexCount - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c);
  }

  quad(a: number, b: number, c: number, d: number): void {
    this.indices.push(a, b, d, b, c, d);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    return geometry;
  }
}

const unitSpheres = new Map<number, { readonly directions: Float32Array; readonly indices: ArrayLike<number> }>();

function unitSphere(detail: number): { readonly directions: Float32Array; readonly indices: ArrayLike<number> } {
  const known = unitSpheres.get(detail);
  if (known) return known;
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const merged = mergeVertices(base, 1e-4);
  const made = { directions: merged.attributes.position!.array as Float32Array, indices: merged.index!.array };
  unitSpheres.set(detail, made);
  return made;
}

export interface BodyPoint {
  readonly point: Point;
  readonly tone: Tone;
}

export function addBody(mesh: PieceMesh, detail: number, at: (x: number, y: number, z: number) => BodyPoint): void {
  const { directions, indices } = unitSphere(detail);
  const first = mesh.vertexCount;
  for (let i = 0; i < directions.length; i += 3) {
    const { point, tone } = at(directions[i]!, directions[i + 1]!, directions[i + 2]!);
    mesh.vertex(point, tone, directions[i]! * 0.04 + directions[i + 2]! * 0.02, directions[i + 1]! * 0.04);
  }
  for (let i = 0; i < indices.length; i += 3) mesh.triangle(first + indices[i]!, first + indices[i + 1]!, first + indices[i + 2]!);
}

export interface TubeOptions {
  readonly rings: number;
  readonly sides: number;
  readonly pathAt: (t: number) => Point;
  readonly radiusAt: (t: number) => number;
  readonly surfaceAt?: (t: number, angle: number, along: number) => { readonly radial: number; readonly tone: Tone };
  readonly capStart?: (radial: number, angle: number) => { readonly lift: number; readonly tone: Tone };
  readonly capEnd?: (radial: number, angle: number) => { readonly lift: number; readonly tone: Tone };
  readonly capRings?: number;
  readonly lengthMetres: number;
}

const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Point): Point => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

export function addTube(mesh: PieceMesh, options: TubeOptions): void {
  const { rings, sides, pathAt, radiusAt, surfaceAt, capStart, capEnd, lengthMetres } = options;
  const capRings = options.capRings ?? 3;
  const centres = Array.from({ length: rings + 1 }, (_, i) => pathAt(i / rings));
  const tangents = centres.map((_, i) => {
    const a = centres[Math.max(0, i - 1)]!;
    const b = centres[Math.min(rings, i + 1)]!;
    return unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  });
  const seed: Point = Math.abs(tangents[0]![1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let side = unit(cross(tangents[0]!, seed));
  const first = mesh.vertexCount;
  const meanRadius = radiusAt(0.5);
  const widthStep = (Math.PI * 2 * meanRadius) / sides;
  const ringPoint = (centre: Point, s: Point, n: Point, angle: number, radius: number): Point => [centre[0] + (s[0] * Math.cos(angle) + n[0] * Math.sin(angle)) * radius, centre[1] + (s[1] * Math.cos(angle) + n[1] * Math.sin(angle)) * radius, centre[2] + (s[2] * Math.cos(angle) + n[2] * Math.sin(angle)) * radius];
  const frames: { readonly side: Point; readonly normal: Point }[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const tangent = tangents[ring]!;
    const along = dot(side, tangent);
    side = unit([side[0] - tangent[0] * along, side[1] - tangent[1] * along, side[2] - tangent[2] * along]);
    const normal = cross(tangent, side);
    frames.push({ side, normal });
    const t = ring / rings;
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      const shaped = surfaceAt ? surfaceAt(t, angle, t * lengthMetres) : { radial: 1, tone: PLAIN };
      const mirrored = (s <= sides / 2 ? s : sides - s) * widthStep;
      mesh.vertex(ringPoint(centres[ring]!, side, normal, angle, radiusAt(t) * shaped.radial), shaped.tone, mirrored, t * lengthMetres);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < sides; s++) {
      const a = first + ring * sides + s;
      const b = first + ring * sides + ((s + 1) % sides);
      mesh.quad(a, b, b + sides, a + sides);
    }
  }
  const cap = (ring: number, shape: (radial: number, angle: number) => { readonly lift: number; readonly tone: Tone }, outward: number) => {
    const centre = centres[ring]!;
    const { side: s, normal: n } = frames[ring]!;
    const tangent = tangents[ring]!;
    const radius = radiusAt(ring / rings);
    const rimStart = first + ring * sides;
    let previous = rimStart;
    for (let c = 1; c <= capRings; c++) {
      const radial = 1 - c / (capRings + 1);
      const start = mesh.vertexCount;
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const { lift, tone } = shape(radial, angle);
        const p = ringPoint(centre, s, n, angle, radius * radial);
        mesh.vertex([p[0] + tangent[0] * lift * outward, p[1] + tangent[1] * lift * outward, p[2] + tangent[2] * lift * outward], tone, Math.cos(angle) * radius * radial, Math.sin(angle) * radius * radial);
      }
      for (let i = 0; i < sides; i++) {
        const a = previous + i;
        const b = previous + ((i + 1) % sides);
        const c0 = start + i;
        const c1 = start + ((i + 1) % sides);
        if (outward > 0) mesh.quad(a, b, c1, c0);
        else mesh.quad(a, c0, c1, b);
      }
      previous = start;
    }
    const { lift, tone } = shape(0, 0);
    const tip = mesh.vertex([centre[0] + tangent[0] * lift * outward, centre[1] + tangent[1] * lift * outward, centre[2] + tangent[2] * lift * outward], tone);
    for (let i = 0; i < sides; i++) {
      const a = previous + i;
      const b = previous + ((i + 1) % sides);
      if (outward > 0) mesh.triangle(a, b, tip);
      else mesh.triangle(a, tip, b);
    }
  };
  if (capEnd) cap(rings, capEnd, 1);
  if (capStart) cap(0, capStart, -1);
}

export function coverWithSpheres(geometry: THREE.BufferGeometry, centres: readonly Point[]): PieceSphere[] {
  const position = geometry.attributes.position!;
  const reach = centres.map(() => 0);
  for (let i = 0; i < position.count; i++) {
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let c = 0; c < centres.length; c++) {
      const [x, y, z] = centres[c]!;
      const distance = (position.getX(i) - x) ** 2 + (position.getY(i) - y) ** 2 + (position.getZ(i) - z) ** 2;
      if (distance < best) {
        best = distance;
        nearest = c;
      }
    }
    reach[nearest] = Math.max(reach[nearest]!, Math.sqrt(best));
  }
  return centres.map(([x, y, z], c) => ({ x, y, z, r: reach[c]! })).filter((sphere) => sphere.r > 0);
}

export function surfaceCover(geometry: THREE.BufferGeometry, spacing: number, inward: number): PieceSphere[] {
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal!;
  const count = position.count;
  const nearest = new Float32Array(count).fill(Number.POSITIVE_INFINITY);
  const centres: Point[] = [];
  let next = 0;
  let farthest = Number.POSITIVE_INFINITY;
  while (farthest > spacing && centres.length < 400) {
    const sx = position.getX(next);
    const sy = position.getY(next);
    const sz = position.getZ(next);
    centres.push([sx - normal.getX(next) * inward, sy - normal.getY(next) * inward, sz - normal.getZ(next) * inward]);
    farthest = 0;
    for (let i = 0; i < count; i++) {
      const distance = Math.hypot(position.getX(i) - sx, position.getY(i) - sy, position.getZ(i) - sz);
      if (distance < nearest[i]!) nearest[i] = distance;
      if (nearest[i]! > farthest) {
        farthest = nearest[i]!;
        next = i;
      }
    }
  }
  return coverWithSpheres(geometry, centres);
}

export function wanderingPath(seed: number, length: number, wander: number, kinks: number): (t: number) => Point {
  const random = seededRandom(seed * 991 + 7);
  const count = 6 + kinks * 2;
  const points: THREE.Vector3[] = [];
  let y = 0;
  let z = 0;
  for (let i = 0; i < count; i++) {
    const kicked = i > 0 && i < count - 1 && i % Math.max(1, Math.floor(count / (kinks + 1))) === 0;
    const reach = kicked ? wander * 2.2 : wander;
    y += (random() - 0.5) * reach;
    z += (random() - 0.5) * reach;
    points.push(new THREE.Vector3((i / (count - 1) - 0.5) * length, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const centre = curve.getPoint(0.5);
  return (t) => {
    const p = curve.getPoint(t);
    return [p.x, p.y - centre.y, p.z - centre.z];
  };
}
