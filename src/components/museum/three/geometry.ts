/**
 * Geometry built directly from the scene model: world-space metre UVs on every face, merged
 * per room and material (one draw call per material per room), chamfered boxes for free-standing
 * edges, and floor-plane AO coordinates.
 *
 * Adapted from virtual-walkthrough src/museum/materials/geometry.ts (metre-UV box: 1 UV unit =
 * 1 m on every face) and src/museum/effects/StaticMerge.tsx (one merged mesh per material).
 * Differences: UVs are WORLD coordinates rather than per-box coordinates, so the texture runs
 * continuously across abutting wall pieces and posts (no seams at junctions), and merging is
 * done from data, not by traversing mounted meshes.
 */
import * as THREE from "three";

import type { Facing, SceneBox, ScenePlane } from "@/features/immersive/scene-model";

import { faceShade } from "./resources";

type V3 = readonly [number, number, number];

/**
 * Accumulates triangles for one merged mesh. Every vertex carries a colour: the builder's current
 * `tint` times the fixed face shading of its normal (`faceShade`), the baked part of the unlit
 * finish (resources.ts). Materials without `vertexColors` ignore it.
 */
export class GeometryBuilder {
  /** Albedo tint for the faces added next (relative to the material colour). */
  tint: [number, number, number] = [1, 1, 1];
  private readonly col: number[] = [];
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly uv1: number[] = [];
  private readonly idx: number[] = [];

  get triangles() {
    return this.idx.length / 3;
  }

  /**
   * Quad with corners p0..p3 (counter-clockwise seen from the normal side). `uv1` defaults to
   * the AO mapping given by `ao` (floor rectangle or wall height).
   */
  private pushColour(n: V3) {
    const s = faceShade(n);
    this.col.push(this.tint[0] * s, this.tint[1] * s, this.tint[2] * s);
  }

  quad(p: [V3, V3, V3, V3], n: V3, uvs: [number, number][], uv1s: [number, number][]) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pushColour(n);
      this.pos.push(p[i]![0], p[i]![1], p[i]![2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i]![0], uvs[i]![1]);
      this.uv1.push(uv1s[i]![0], uv1s[i]![1]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(p: [V3, V3, V3], n: V3, uvs: [number, number][], uv1s: [number, number][]) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 3; i++) {
      this.pushColour(n);
      this.pos.push(p[i]![0], p[i]![1], p[i]![2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i]![0], uvs[i]![1]);
      this.uv1.push(uv1s[i]![0], uv1s[i]![1]);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  build(name: string): THREE.BufferGeometry | null {
    if (this.idx.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("uv1", new THREE.Float32BufferAttribute(this.uv1, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    g.name = name;
    return g;
  }
}

/** World-space metre UV for a point on a face with the given normal. */
function worldUv(p: V3, n: V3): [number, number] {
  if (Math.abs(n[1]) > 0.5) return [p[0], -p[2]];
  if (Math.abs(n[0]) > 0.5) return [n[0] > 0 ? -p[2] : p[2], p[1]];
  return [n[2] > 0 ? p[0] : -p[0], p[1]];
}

export interface AoMapping {
  /** Floor/ceiling rectangle mapped to uv1 0..1. */
  rect?: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Wall height: uv1.y = y / height (vertical AO gradient). */
  height?: number;
}

function aoUv(p: V3, ao: AoMapping): [number, number] {
  if (ao.rect) return [(p[0] - ao.rect.minX) / (ao.rect.maxX - ao.rect.minX), 1 - (p[2] - ao.rect.minZ) / (ao.rect.maxZ - ao.rect.minZ)];
  return [0.5, ao.height ? p[1] / ao.height : 0.5];
}

const FACES: { n: V3; corners: (a: V3, b: V3) => [V3, V3, V3, V3] }[] = [
  { n: [1, 0, 0], corners: (a, b) => [[b[0], a[1], b[2]], [b[0], a[1], a[2]], [b[0], b[1], a[2]], [b[0], b[1], b[2]]] },
  { n: [-1, 0, 0], corners: (a, b) => [[a[0], a[1], a[2]], [a[0], a[1], b[2]], [a[0], b[1], b[2]], [a[0], b[1], a[2]]] },
  { n: [0, 1, 0], corners: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [b[0], b[1], a[2]], [a[0], b[1], a[2]]] },
  { n: [0, -1, 0], corners: (a, b) => [[a[0], a[1], a[2]], [b[0], a[1], a[2]], [b[0], a[1], b[2]], [a[0], a[1], b[2]]] },
  { n: [0, 0, 1], corners: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [b[0], b[1], b[2]], [a[0], b[1], b[2]]] },
  { n: [0, 0, -1], corners: (a, b) => [[b[0], a[1], a[2]], [a[0], a[1], a[2]], [a[0], b[1], a[2]], [b[0], b[1], a[2]]] },
];

/**
 * Axis-aligned box. `skipBottom` drops the face resting on the floor (never visible, and it
 * would be coplanar with the floor plane facing the other way).
 */
export function addBox(
  b: GeometryBuilder,
  box: Pick<SceneBox, "min" | "max">,
  ao: AoMapping,
  opts: { skipBottom?: boolean; skipTop?: boolean; tintFor?: (n: V3) => [number, number, number] | null } = {},
) {
  const base = b.tint;
  for (const f of FACES) {
    if (opts.skipBottom && f.n[1] === -1) continue;
    if (opts.skipTop && f.n[1] === 1) continue;
    b.tint = opts.tintFor?.(f.n) ?? base;
    const c = f.corners(box.min, box.max);
    b.quad(c, f.n, c.map((p) => worldUv(p, f.n)) as [number, number][], c.map((p) => aoUv(p, ao)) as [number, number][]);
  }
  b.tint = base;
}

/**
 * Box with a 45 degree chamfer of size `r` on every edge that is visible (all but the bottom
 * ones): the light catches the edge as a real bevel would: 30 triangles (no bottom face) instead of 10.
 */
export function addChamferedBox(b: GeometryBuilder, box: Pick<SceneBox, "min" | "max">, r: number, ao: AoMapping) {
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;
  const s = Math.SQRT1_2;
  const q = (pts: [V3, V3, V3, V3], n: V3) => b.quad(pts, n, pts.map((p) => worldUv(p, n)) as [number, number][], pts.map((p) => aoUv(p, ao)) as [number, number][]);
  const t = (pts: [V3, V3, V3], n: V3) => b.tri(pts, n, pts.map((p) => worldUv(p, n)) as [number, number][], pts.map((p) => aoUv(p, ao)) as [number, number][]);
  const Y = y1 - r;
  // Side faces (inset by r at the vertical edges and the top).
  q([[x1, y0, z1 - r], [x1, y0, z0 + r], [x1, Y, z0 + r], [x1, Y, z1 - r]], [1, 0, 0]);
  q([[x0, y0, z0 + r], [x0, y0, z1 - r], [x0, Y, z1 - r], [x0, Y, z0 + r]], [-1, 0, 0]);
  q([[x0 + r, y0, z1], [x1 - r, y0, z1], [x1 - r, Y, z1], [x0 + r, Y, z1]], [0, 0, 1]);
  q([[x1 - r, y0, z0], [x0 + r, y0, z0], [x0 + r, Y, z0], [x1 - r, Y, z0]], [0, 0, -1]);
  // Top.
  q([[x0 + r, y1, z1 - r], [x1 - r, y1, z1 - r], [x1 - r, y1, z0 + r], [x0 + r, y1, z0 + r]], [0, 1, 0]);
  // Vertical edge chamfers.
  q([[x1 - r, y0, z1], [x1, y0, z1 - r], [x1, Y, z1 - r], [x1 - r, Y, z1]], [s, 0, s]);
  q([[x1, y0, z0 + r], [x1 - r, y0, z0], [x1 - r, Y, z0], [x1, Y, z0 + r]], [s, 0, -s]);
  q([[x0 + r, y0, z0], [x0, y0, z0 + r], [x0, Y, z0 + r], [x0 + r, Y, z0]], [-s, 0, -s]);
  q([[x0, y0, z1 - r], [x0 + r, y0, z1], [x0 + r, Y, z1], [x0, Y, z1 - r]], [-s, 0, s]);
  // Top edge chamfers.
  q([[x1, Y, z0 + r], [x1 - r, y1, z0 + r], [x1 - r, y1, z1 - r], [x1, Y, z1 - r]], [s, s, 0]);
  q([[x0, Y, z1 - r], [x0 + r, y1, z1 - r], [x0 + r, y1, z0 + r], [x0, Y, z0 + r]], [-s, s, 0]);
  q([[x0 + r, Y, z1], [x1 - r, Y, z1], [x1 - r, y1, z1 - r], [x0 + r, y1, z1 - r]], [0, s, s]);
  q([[x1 - r, Y, z0], [x0 + r, Y, z0], [x0 + r, y1, z0 + r], [x1 - r, y1, z0 + r]], [0, s, -s]);
  // Corner triangles.
  const k = 1 / Math.sqrt(3);
  t([[x1, Y, z1 - r], [x1 - r, y1, z1 - r], [x1 - r, Y, z1]], [k, k, k]);
  t([[x1 - r, Y, z0], [x1 - r, y1, z0 + r], [x1, Y, z0 + r]], [k, k, -k]);
  t([[x0, Y, z0 + r], [x0 + r, y1, z0 + r], [x0 + r, Y, z0]], [-k, k, -k]);
  t([[x0 + r, Y, z1], [x0 + r, y1, z1 - r], [x0, Y, z1 - r]], [-k, k, k]);
}

const NORMALS: Record<Facing, V3> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };

/** Corners of a manifest plane in counter-clockwise order seen from its facing side. */
export function planeCorners(p: Pick<ScenePlane, "min" | "max" | "facing">): [V3, V3, V3, V3] {
  const [x0, y0, z0] = p.min;
  const [x1, y1, z1] = p.max;
  switch (p.facing) {
    case "+y":
      return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]];
    case "-y":
      return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
    case "+x":
      return [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]];
    case "-x":
      return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
    case "+z":
      return [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]];
    case "-z":
      return [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]];
  }
}

/** Manifest plane with world metre UVs (floors, ceilings, thresholds). */
export function addPlane(b: GeometryBuilder, p: Pick<ScenePlane, "min" | "max" | "facing">, ao: AoMapping) {
  const c = planeCorners(p);
  const n = NORMALS[p.facing];
  b.quad(c, n, c.map((x) => worldUv(x, n)) as [number, number][], c.map((x) => aoUv(x, ao)) as [number, number][]);
}

/** Manifest plane with a sub-rectangle of an atlas as UVs (wall panels, signs). */
export function addAtlasPlane(b: GeometryBuilder, p: Pick<ScenePlane, "min" | "max" | "facing">, rect: { u0: number; v0: number; u1: number; v1: number }) {
  const c = planeCorners(p);
  const n = NORMALS[p.facing];
  const uvs: [number, number][] = [
    [rect.u0, rect.v0],
    [rect.u1, rect.v0],
    [rect.u1, rect.v1],
    [rect.u0, rect.v1],
  ];
  b.quad(c, n, uvs, uvs);
}

/** Facing normal of a manifest plane. */
export function facingNormal(f: Facing): V3 {
  return NORMALS[f];
}

/**
 * Flat ribbon on the floor along a polyline (mitred joins, so segments never overlap).
 * `y` is the height above the floor (>= 1.5 mm: immersive-rendering-quality.md §1).
 */
export function ribbonGeometry(points: readonly { x: number; z: number }[], width: number, y: number): THREE.BufferGeometry | null {
  if (points.length < 2) return null;
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z) > 1e-3);
  if (pts.length < 2) return null;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const h = width / 2;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(pts.length - 1, i + 1)]!;
    const d0 = i === 0 ? null : norm(pts[i]!.x - prev.x, pts[i]!.z - prev.z);
    const d1 = i === pts.length - 1 ? null : norm(next.x - pts[i]!.x, next.z - pts[i]!.z);
    let nx: number;
    let nz: number;
    let scale = 1;
    if (d0 && d1) {
      const tx = d0[0] + d1[0];
      const tz = d0[1] + d1[1];
      const t = norm(tx, tz) ?? d1;
      nx = -t[1];
      nz = t[0];
      const dot = nx * -d1[1] + nz * d1[0];
      scale = Math.min(3, 1 / Math.max(0.33, dot));
    } else {
      const d = (d0 ?? d1)!;
      nx = -d[1];
      nz = d[0];
    }
    left.push([pts[i]!.x + nx * h * scale, pts[i]!.z + nz * h * scale]);
    right.push([pts[i]!.x - nx * h * scale, pts[i]!.z - nz * h * scale]);
  }
  const b = new GeometryBuilder();
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z);
    const quad: [V3, V3, V3, V3] = [
      [right[i]![0], y, right[i]![1]],
      [right[i + 1]![0], y, right[i + 1]![1]],
      [left[i + 1]![0], y, left[i + 1]![1]],
      [left[i]![0], y, left[i]![1]],
    ];
    // Wind counter-clockwise seen from above (+y).
    const cross = (quad[1][0] - quad[0][0]) * (quad[3][2] - quad[0][2]) - (quad[1][2] - quad[0][2]) * (quad[3][0] - quad[0][0]);
    const ordered = cross > 0 ? ([quad[0], quad[3], quad[2], quad[1]] as [V3, V3, V3, V3]) : quad;
    b.quad(ordered, [0, 1, 0], [[along, 0], [along + seg, 0], [along + seg, 1], [along, 1]], [[0, 0], [0, 0], [0, 0], [0, 0]]);
    along += seg;
  }
  return b.build("path-ribbon");
}

function norm(x: number, z: number): [number, number] | null {
  const l = Math.hypot(x, z);
  return l < 1e-9 ? null : [x / l, z / l];
}
