import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { seededRandom, type PieceSphere } from "../domain/pile-packing";
import type { PieceShape } from "./piece-mesh";

const FACET_CREASE_RADIANS = 0.55;
const COVER_PULL = 0.55;
const LUMP_COVER_SPHERES = 12;

function coverWith(geometry: THREE.BufferGeometry, centres: readonly (readonly [number, number, number])[]): PieceSphere[] {
  const position = geometry.attributes.position!;
  const reach = centres.map(() => 0);
  for (let i = 0; i < position.count; i++) {
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    centres.forEach(([x, y, z], c) => {
      const distance = Math.hypot(position.getX(i) - x, position.getY(i) - y, position.getZ(i) - z);
      if (distance < best) {
        best = distance;
        nearest = c;
      }
    });
    reach[nearest] = Math.max(reach[nearest]!, best);
  }
  return centres.map(([x, y, z], c) => ({ x, y, z, r: reach[c]! })).filter((sphere) => sphere.r > 0);
}

function tightCover(geometry: THREE.BufferGeometry, count: number): PieceSphere[] {
  const position = geometry.attributes.position!;
  const at = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(position, i);
  const chosen: THREE.Vector3[] = [at(0)];
  const nearest = new Float32Array(position.count).fill(Number.POSITIVE_INFINITY);
  while (chosen.length < count) {
    const latest = chosen[chosen.length - 1]!;
    let far = 0;
    let farIndex = 0;
    for (let i = 0; i < position.count; i++) {
      nearest[i] = Math.min(nearest[i]!, at(i).distanceTo(latest));
      if (nearest[i]! > far) {
        far = nearest[i]!;
        farIndex = i;
      }
    }
    chosen.push(at(farIndex));
  }
  return coverWith(geometry, chosen.map((point) => [point.x * COVER_PULL, point.y * COVER_PULL, point.z * COVER_PULL] as const));
}

function ball(detail: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  return mergeVertices(base, 1e-4);
}

const wobble = (x: number, y: number, z: number, phase: number): number =>
  0.5 * Math.sin(x * 2.9 + phase) * Math.sin(y * 3.1 - phase * 0.7) + 0.3 * Math.sin(z * 5.3 + y * 2.3 + phase * 1.6) + 0.2 * Math.sin(x * 9.1 - z * 7.7 + phase);

export function crumb(seed: number, radius: number, detail: number): PieceShape {
  const random = seededRandom(seed * 739 + 13);
  const geometry = ball(detail);
  const position = geometry.attributes.position!;
  const stretch = [0.72 + random() * 0.56, 0.62 + random() * 0.4, 0.72 + random() * 0.56] as const;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k = radius * (1 + 0.34 * wobble(x, y, z, seed * 1.9));
    position.setXYZ(i, x * k * stretch[0], y * k * stretch[1], z * k * stretch[2]);
  }
  geometry.computeVertexNormals();
  return { geometry, spheres: coverWith(geometry, [[0, 0, 0]]) };
}

export function grit(seed: number, radius: number): PieceShape {
  const random = seededRandom(seed * 853 + 41);
  const base = ball(1);
  const position = base.attributes.position!;
  const stretch = [0.55 + random() * 0.8, 0.45 + random() * 0.45, 0.55 + random() * 0.8] as const;
  for (let i = 0; i < position.count; i++) {
    const k = 0.62 + random() * 0.62;
    position.setXYZ(i, position.getX(i) * radius * stretch[0] * k, position.getY(i) * radius * stretch[1] * k, position.getZ(i) * radius * stretch[2] * k);
  }
  base.computeVertexNormals();
  return { geometry: base, spheres: coverWith(base, [[0, 0, 0]]) };
}

export function crystalGrain(seed: number, radius: number): PieceShape {
  const random = seededRandom(seed * 311 + 5);
  const base = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
  base.deleteAttribute("uv");
  const position = base.attributes.position!;
  const stretch = [0.6 + random() * 0.8, 0.5 + random() * 0.6, 0.6 + random() * 0.8] as const;
  for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getX(i) * radius * stretch[0], position.getY(i) * radius * stretch[1], position.getZ(i) * radius * stretch[2]);
  base.computeVertexNormals();
  return { geometry: base, spheres: coverWith(base, [[0, 0, 0]]) };
}

function ribbon(along: number, across: number, at: (t: number, s: number) => readonly [number, number, number]): { geometry: THREE.BufferGeometry; centres: (readonly [number, number, number])[] } {
  const points: number[] = [];
  const indices: number[] = [];
  for (let u = 0; u <= along; u++) {
    for (let v = 0; v <= across; v++) points.push(...at(u / along, v / across - 0.5));
  }
  for (let u = 0; u < along; u++) {
    for (let v = 0; v < across; v++) {
      const a = u * (across + 1) + v;
      const b = a + across + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const centres = Array.from({ length: 5 }, (_, i) => at((i + 0.5) / 5, 0));
  return { geometry, centres };
}

export function curledShaving(seed: number): PieceShape {
  const random = seededRandom(seed * 421 + 3);
  const width = 0.0028 + random() * 0.0034;
  const coil = 0.0028 + random() * 0.0036;
  const turns = 0.32 + random() * 0.62;
  const flare = 0.6 + random() * 1.2;
  const { geometry, centres } = ribbon(20, 2, (t, s) => {
    const angle = t * turns * Math.PI * 2;
    const radius = coil * (1 + flare * t * t) * (1 + 0.05 * Math.sin(t * 19 + seed));
    const frayed = 1 + 0.18 * Math.sin(t * 23 + seed * 3);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, s * width * frayed];
  });
  return { geometry, spheres: coverWith(geometry, centres) };
}

export function woodFlake(seed: number): PieceShape {
  const random = seededRandom(seed * 967 + 9);
  const length = 0.009 + random() * 0.014;
  const width = length * (0.3 + random() * 0.45);
  const bend = length * (0.08 + random() * 0.14);
  const { geometry, centres } = ribbon(10, 3, (t, s) => {
    const edge = 1 + 0.16 * Math.sin(t * 17 + seed * 2.1);
    return [(t - 0.5) * length, bend * Math.sin(t * Math.PI) + 0.00035 * Math.sin(t * 29 + s * 7 + seed), s * width * edge];
  });
  return { geometry, spheres: coverWith(geometry, centres) };
}

function subdivided(geometry: THREE.BufferGeometry, levels: number): THREE.BufferGeometry {
  let soup = Array.from(geometry.attributes.position!.array as Float32Array);
  for (let level = 0; level < levels; level++) {
    const next: number[] = [];
    for (let i = 0; i < soup.length; i += 9) {
      const a = soup.slice(i, i + 3);
      const b = soup.slice(i + 3, i + 6);
      const c = soup.slice(i + 6, i + 9);
      const ab = a.map((value, k) => (value + b[k]!) / 2);
      const bc = b.map((value, k) => (value + c[k]!) / 2);
      const ca = c.map((value, k) => (value + a[k]!) / 2);
      next.push(...a, ...ab, ...ca, ...ab, ...b, ...bc, ...ca, ...bc, ...c, ...ab, ...bc, ...ca);
    }
    soup = next;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(soup, 3));
  return out;
}

function brokenSolid(seed: number, corners: THREE.Vector3[], cuts: number, cutReach: number, ripple: number, size: number, levels = 2, crease = FACET_CREASE_RADIANS): PieceShape {
  const random = seededRandom(seed * 577 + 3);
  const planes = Array.from({ length: cuts }, () => {
    const rise = random() * 2 - 1;
    const turn = random() * Math.PI * 2;
    const flat = Math.sqrt(1 - rise * rise);
    return { normal: new THREE.Vector3(Math.cos(turn) * flat, rise, Math.sin(turn) * flat), at: size * (cutReach + random() * 0.32) };
  });
  for (const point of corners) {
    for (const { normal, at } of planes) {
      const over = point.dot(normal) - at;
      if (over > 0) point.addScaledVector(normal, -over);
    }
  }
  const hull = new ConvexGeometry(corners);
  const fine = subdivided(hull, levels);
  hull.dispose();
  const position = fine.attributes.position!;
  const phase = seed * 2.3;
  const away = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    away.fromBufferAttribute(position, i);
    const scale = 1 / size;
    const shift = ripple * size * (wobble(away.x * scale * 2.2, away.y * scale * 2.2, away.z * scale * 2.2, phase) + 0.45 * wobble(away.x * scale * 6.1, away.y * scale * 6.1, away.z * scale * 6.1, phase + 3));
    away.multiplyScalar(1 + shift / Math.max(away.length(), 1e-5));
    position.setXYZ(i, away.x, away.y, away.z);
  }
  const geometry = toCreasedNormals(fine, crease);
  fine.dispose();
  return { geometry, spheres: tightCover(geometry, LUMP_COVER_SPHERES) };
}

export function alumLump(seed: number, levels: number): PieceShape {
  const random = seededRandom(seed * 131 + 17);
  const size = 0.011 + random() * 0.006;
  const stretch = new THREE.Vector3(0.75 + random() * 0.65, 0.55 + random() * 0.45, 0.7 + random() * 0.55);
  const corners = Array.from({ length: 22 + Math.floor(random() * 16) }, () => {
    const theta = random() * Math.PI * 2;
    const rise = random() * 2 - 1;
    const flat = Math.sqrt(1 - rise * rise);
    const reach = 0.74 + random() * 0.26;
    return new THREE.Vector3(Math.cos(theta) * flat, rise, Math.sin(theta) * flat).multiplyScalar(reach * size).multiply(stretch);
  });
  return brokenSolid(seed, corners, 3 + Math.floor(random() * 4), 0.42, 0.018, size, levels);
}

export function indigoCake(seed: number): PieceShape {
  const random = seededRandom(seed * 233 + 29);
  const half = new THREE.Vector3(0.018 + random() * 0.012, 0.0065 + random() * 0.004, 0.014 + random() * 0.009);
  const corners = Array.from({ length: 40 + Math.floor(random() * 16) }, () => {
    const theta = random() * Math.PI * 2;
    const rise = (random() * 2 - 1) * 0.9;
    const flat = Math.sqrt(1 - rise * rise);
    const reach = 0.8 + random() * 0.2;
    const lowered = rise < -0.35 ? -0.92 : rise;
    return new THREE.Vector3(Math.cos(theta) * flat * reach * half.x, lowered * half.y, Math.sin(theta) * flat * reach * half.z);
  });
  return brokenSolid(seed + 40, corners, 3 + Math.floor(random() * 3), 0.55, 0.045, Math.max(half.x, half.z), 3, 1.25);
}

export async function grainsInTurn(makers: readonly (() => PieceShape)[]): Promise<PieceShape[]> {
  const variants: PieceShape[] = [];
  for (const make of makers) {
    variants.push(make());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return variants;
}
