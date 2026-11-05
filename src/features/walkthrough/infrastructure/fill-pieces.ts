import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SubstanceFill } from "@/features/process/domain/substance-look";
import { seededRandom, type PieceSphere, type PileBlueprint } from "../domain/pile-packing";

export type PileFill = Extract<SubstanceFill, "dung" | "roots" | "flowers" | "leaves" | "crystals">;

export interface PieceVariant {
  readonly geometry: THREE.BufferGeometry;
  readonly spheres: readonly PieceSphere[];
}

export interface PileRecipe {
  readonly variants: readonly PieceVariant[];
  readonly blueprints: readonly PileBlueprint[];
  readonly candidates: number;
  readonly maxTilt: number;
  readonly anyTumble: boolean;
  readonly seed: number;
  readonly fillsTo: number;
  readonly wallMargin?: number;
  readonly leansOnOne?: boolean;
}

export const isPileFill = (fill: SubstanceFill): fill is PileFill => fill === "dung" || fill === "roots" || fill === "flowers" || fill === "leaves" || fill === "crystals";

function coverWithSpheres(geometry: THREE.BufferGeometry, centres: readonly (readonly [number, number, number])[]): PieceSphere[] {
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

const swell = (x: number, y: number, z: number, phase: number): number =>
  0.5 * Math.sin(x * 2.3 + phase) * Math.sin(y * 2.7 - phase * 0.6) + 0.3 * Math.sin(z * 4.4 + y * 1.9 + phase * 1.7) + 0.16 * Math.sin(x * 7.3 - z * 6.1 + phase) + 0.08 * Math.sin(y * 13.1 + x * 11.3);

function smoothSphere(detail: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  return mergeVertices(base, 1e-4);
}

function dungLump(seed: number): PieceVariant {
  const geometry = smoothSphere(14);
  const position = geometry.attributes.position!;
  const stretch: readonly [number, number, number] = [0.031 + seed * 0.003, 0.023, 0.027];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k = 1 + 0.2 * swell(x, y, z, seed * 2.1);
    position.setXYZ(i, x * k * stretch[0], y * k * stretch[1], z * k * stretch[2]);
  }
  geometry.computeVertexNormals();
  const [a, b, c] = stretch;
  const spheres = coverWithSpheres(geometry, [[0, 0, 0], [a * 0.55, 0, 0], [-a * 0.55, 0, 0], [0, 0, c * 0.5], [0, 0, -c * 0.5], [0, b * 0.5, 0], [0, -b * 0.5, 0]]);
  return { geometry, spheres };
}

function rootPiece(seed: number, length: number, radius: number): PieceVariant {
  const random = seededRandom(seed * 991 + 7);
  const spine = new THREE.CatmullRomCurve3(
    Array.from({ length: 6 }, (_, i) => new THREE.Vector3((i / 5 - 0.5) * length, (random() - 0.5) * radius * 2.2, (random() - 0.5) * length * 0.24)),
  );
  const rings = 56;
  const sides = 14;
  const frames = spine.computeFrenetFrames(rings, false);
  const points: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const centre = spine.getPointAt(t);
    const tip = Math.min(1, Math.min(t, 1 - t) * 14) ** 0.5;
    const taper = (1 - 0.68 * t) * tip;
    for (let side = 0; side < sides; side++) {
      const a = (side / sides) * Math.PI * 2;
      const wrinkle = 1 + 0.09 * Math.sin(a * 3 + t * 31 + seed) + 0.05 * Math.sin(t * 73 + a * 5);
      const r = Math.max(0.0002, radius * taper * wrinkle);
      const offset = frames.normals[ring]!.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(frames.binormals[ring]!, Math.sin(a) * r);
      points.push(centre.x + offset.x, centre.y + offset.y, centre.z + offset.z);
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side;
      const b = ring * sides + ((side + 1) % sides);
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const count = Math.ceil(length / (radius * 1.6));
  const centres = Array.from({ length: count + 1 }, (_, i) => {
    const p = spine.getPointAt(i / count);
    return [p.x, p.y, p.z] as const;
  });
  return { geometry, spheres: coverWithSpheres(geometry, centres) };
}

function driedFloret(seed: number): PieceVariant {
  const geometry = smoothSphere(7);
  const position = geometry.attributes.position!;
  const size = 0.0085 + (seed % 5) * 0.0011;
  const stretch = 0.82 + (seed % 3) * 0.2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const crumple = 1 + 0.26 * swell(x * 1.6, y * 1.6, z * 1.6, seed * 1.3) + 0.09 * Math.sin(x * 15 + z * 12 + seed);
    position.setXYZ(i, x * crumple * size * stretch, y * crumple * size * 0.62, z * crumple * size);
  }
  geometry.computeVertexNormals();
  return { geometry, spheres: coverWithSpheres(geometry, [[0, 0, 0]]) };
}

function dryLeaf(seed: number): PieceVariant {
  const random = seededRandom(seed * 313 + 11);
  const length = 0.05 + random() * 0.02;
  const width = length * (0.36 + random() * 0.12);
  const curl = 0.004 + random() * 0.006;
  const along = 24;
  const across = 8;
  const points: number[] = [];
  const indices: number[] = [];
  for (let u = 0; u <= along; u++) {
    const t = u / along;
    const half = (width / 2) * Math.sin(Math.PI * t) ** 0.72;
    for (let v = 0; v <= across; v++) {
      const s = v / across - 0.5;
      const x = (t - 0.5) * length;
      const z = s * 2 * half;
      const y = curl * Math.sin(Math.PI * t) * 1.6 + 0.0035 * Math.abs(s) * 2 + 0.0012 * Math.sin(t * 37 + seed) * Math.abs(s) * 2;
      points.push(x, y, z);
    }
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
  const count = 7;
  const centres = Array.from({ length: count }, (_, i) => [((i + 0.5) / count - 0.5) * length, curl, 0] as const);
  return { geometry, spheres: coverWithSpheres(geometry, centres) };
}

function crystal(seed: number): PieceVariant {
  const random = seededRandom(seed * 577 + 3);
  const size = 0.0075 + random() * 0.0085;
  const stretch = new THREE.Vector3(0.55 + random() * 0.9, 0.45 + random() * 0.6, 0.55 + random() * 0.9);
  const corners = 9 + Math.floor(random() * 10);
  const points = Array.from({ length: corners }, () => {
    const theta = random() * Math.PI * 2;
    const rise = random() * 2 - 1;
    const flat = Math.sqrt(1 - rise * rise);
    const reach = 0.72 + random() * 0.28;
    return new THREE.Vector3(Math.cos(theta) * flat, rise, Math.sin(theta) * flat).multiplyScalar(reach).multiply(stretch).multiplyScalar(size);
  });
  for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)]) points.push(axis.multiply(stretch).multiplyScalar(size * 0.42));
  const geometry = new ConvexGeometry(points);
  return { geometry, spheres: coverWithSpheres(geometry, [[0, 0, 0]]) };
}

function blueprintsFrom(variants: readonly PieceVariant[], count: number, seed: number, low: number, high: number): PileBlueprint[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({ variant: i % variants.length, scale: low + random() * (high - low), spheres: variants[i % variants.length]!.spheres }));
}

async function builtInTurn(makers: readonly (() => PieceVariant)[]): Promise<PieceVariant[]> {
  const variants: PieceVariant[] = [];
  for (const make of makers) {
    variants.push(make());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return variants;
}

export async function pileRecipe(fill: PileFill): Promise<PileRecipe> {
  switch (fill) {
    case "dung": {
      const variants = await builtInTurn([() => dungLump(1), () => dungLump(2), () => dungLump(3)]);
      return { variants, blueprints: blueprintsFrom(variants, 56, 21, 0.72, 1.08), candidates: 60, maxTilt: 0.5, anyTumble: true, seed: 101, fillsTo: 0.78, wallMargin: 0.012, leansOnOne: true };
    }
    case "roots": {
      const variants = await builtInTurn([() => rootPiece(1, 0.17, 0.0108), () => rootPiece(2, 0.14, 0.0122), () => rootPiece(3, 0.2, 0.0094), () => rootPiece(4, 0.12, 0.013), () => rootPiece(5, 0.16, 0.0084)]);
      return { variants, blueprints: blueprintsFrom(variants, 130, 22, 0.85, 1.1), candidates: 30, maxTilt: 0.34, anyTumble: false, seed: 102, fillsTo: 1, leansOnOne: true };
    }
    case "flowers": {
      const variants = await builtInTurn([() => driedFloret(1), () => driedFloret(2), () => driedFloret(3), () => driedFloret(4), () => driedFloret(5)]);
      return { variants, blueprints: blueprintsFrom(variants, 420, 23, 0.8, 1.2), candidates: 8, maxTilt: 0.5, anyTumble: true, seed: 103, fillsTo: 1, wallMargin: 0.0095, leansOnOne: true };
    }
    case "leaves": {
      const variants = await builtInTurn([() => dryLeaf(1), () => dryLeaf(2), () => dryLeaf(3), () => dryLeaf(4)]);
      return { variants, blueprints: blueprintsFrom(variants, 110, 24, 0.82, 1.12), candidates: 18, maxTilt: 0.5, anyTumble: false, seed: 104, fillsTo: 1 };
    }
    case "crystals": {
      const variants = await builtInTurn(Array.from({ length: 9 }, (_, i) => () => crystal(i + 1)));
      return { variants, blueprints: blueprintsFrom(variants, 340, 25, 0.5, 1.45), candidates: 40, maxTilt: 0.5, anyTumble: true, seed: 105, fillsTo: 0.6 };
    }
  }
}
