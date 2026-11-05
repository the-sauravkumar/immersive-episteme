import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { SubstanceFill } from "@/features/process/domain/substance-look";
import type { PileForm } from "../domain/pile-form";
import { seededRandom, type PileBlueprint } from "../domain/pile-packing";
import { camelCluster, camelPellet, dungCake, dungLump } from "./piece-dung";
import { coverWithSpheres, type PieceVariant, type Tone } from "./piece-mesh";
import { driedCalyx, driedFlake, driedFruit, dryLeaf } from "./piece-plants";
import { chaySheaf, madderCrown, madderCutLength, madderRoot } from "./piece-roots";

export type PileFill = Extract<SubstanceFill, "dung" | "roots" | "flowers" | "leaves" | "crystals" | "fruit">;

export type { PieceVariant };

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
  readonly spins?: boolean;
  readonly bedShare?: number;
  readonly bedHeap?: number;
  readonly crown?: number;
  readonly seenDepth?: number;
  readonly tones?: readonly Tone[];
}

export const isPileFill = (fill: SubstanceFill): fill is PileFill => fill === "dung" || fill === "roots" || fill === "flowers" || fill === "leaves" || fill === "crystals" || fill === "fruit";

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
  return { geometry, buried: geometry, spheres: coverWithSpheres(geometry, [[0, 0, 0]]) };
}

function blueprintsFrom(variants: readonly PieceVariant[], count: number, seed: number, low: number, high: number, shares?: readonly number[]): PileBlueprint[] {
  const random = seededRandom(seed);
  const total = shares?.reduce((sum, share) => sum + share, 0) ?? 0;
  const pickVariant = (i: number): number => {
    if (!shares) return i % variants.length;
    let left = random() * total;
    for (let v = 0; v < shares.length; v++) {
      left -= shares[v]!;
      if (left <= 0) return v;
    }
    return shares.length - 1;
  };
  return Array.from({ length: count }, (_, i) => {
    const variant = pickVariant(i);
    return { variant, scale: low + random() * (high - low), spheres: variants[variant]!.spheres };
  });
}

async function builtInTurn(makers: readonly (() => PieceVariant)[]): Promise<PieceVariant[]> {
  const variants: PieceVariant[] = [];
  for (const make of makers) {
    variants.push(make());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return variants;
}

const CAMEL_TONES: readonly Tone[] = [[1, 1, 1], [0.88, 0.87, 0.85], [1.1, 1.08, 1.04], [0.78, 0.76, 0.74], [0.96, 0.92, 0.84], [1.04, 1.02, 1]];
const COW_TONES: readonly Tone[] = [[1, 1, 1], [0.84, 0.82, 0.8], [1.14, 1.12, 1.08], [0.72, 0.7, 0.68], [1.04, 1, 0.94]];
const ROOT_TONES: readonly Tone[] = [[1, 1, 1], [0.8, 0.76, 0.74], [1.16, 1.08, 1], [0.64, 0.58, 0.56], [1.08, 0.96, 0.84], [0.92, 0.9, 0.88], [1.26, 1.14, 1.02]];
const FLOWER_TONES: readonly Tone[] = [[1, 1, 1], [0.8, 0.76, 0.72], [1.06, 1.06, 1.04], [0.9, 0.86, 0.8], [0.72, 0.66, 0.6], [1.1, 1.08, 1.06], [0.94, 0.9, 0.86]];
const LEAF_TONES: readonly Tone[] = [[1, 1, 1], [0.84, 0.78, 0.66], [1.08, 1.06, 0.92], [0.9, 0.84, 0.8], [0.74, 0.66, 0.56]];
const FRUIT_TONES: readonly Tone[] = [[1, 1, 1], [0.7, 0.64, 0.66], [1.14, 1.1, 0.96], [0.92, 0.76, 0.62], [0.58, 0.54, 0.58], [1.12, 1.02, 0.66], [0.82, 0.72, 0.62]];

export async function pileRecipe(form: Exclude<PileForm, "wet-dung">): Promise<PileRecipe> {
  switch (form) {
    case "camel-pellets": {
      const variants = await builtInTurn([() => camelPellet(1, 0.034, 1.32, true), () => camelPellet(2, 0.042, 1.48, false), () => camelPellet(3, 0.028, 1.2, true), () => camelPellet(4, 0.046, 1.62, true), () => camelPellet(5, 0.031, 1.26, false), () => camelPellet(6, 0.038, 1.42, false), () => camelCluster(7, 0.021, 4), () => camelCluster(8, 0.024, 5), () => camelPellet(9, 0.024, 1.18, false)]);
      return { variants, blueprints: blueprintsFrom(variants, 520, 21, 0.82, 1.18, [1, 1, 1, 1, 1, 1, 0.35, 0.25, 0.9]), candidates: 160, maxTilt: 0.8, anyTumble: false, spins: true, seed: 101, fillsTo: 0.9, wallMargin: 0.004, leansOnOne: true, bedShare: 0.08, bedHeap: 0.08, crown: 0.034, seenDepth: 0.026, tones: CAMEL_TONES };
    }
    case "dung-lumps": {
      const variants = await builtInTurn([() => dungLump(1, 0.056), () => dungLump(2, 0.05), () => dungLump(3, 0.062), () => dungLump(4, 0.044), () => dungLump(5, 0.052), () => dungLump(6, 0.032), () => dungLump(7, 0.025)]);
      return { variants, blueprints: blueprintsFrom(variants, 260, 26, 0.85, 1.15, [1, 1, 1, 1, 1, 0.8, 1]), candidates: 160, maxTilt: 0.7, anyTumble: false, spins: false, seed: 116, fillsTo: 0.92, wallMargin: 0.009, leansOnOne: true, bedShare: 0.08, bedHeap: 0.06, crown: 0.05, seenDepth: 0.04, tones: COW_TONES };
    }
    case "dung-cakes": {
      const variants = await builtInTurn([() => dungCake(1, 0.125, 0.016), () => dungCake(2, 0.11, 0.015), () => dungCake(3, 0.14, 0.018), () => dungCake(4, 0.1, 0.014)]);
      return { variants, blueprints: blueprintsFrom(variants, 70, 27, 0.88, 1.12), candidates: 160, maxTilt: 0.22, anyTumble: false, seed: 107, fillsTo: 0.9, wallMargin: 0.006, leansOnOne: true, bedShare: 0.08, bedHeap: 0.04, crown: 0.05, seenDepth: 0.03, tones: COW_TONES };
    }
    case "madder-roots": {
      const variants = await builtInTurn([
        () => madderRoot(1, 0.17, 0.0042, 3),
        () => madderRoot(2, 0.13, 0.0035, 2),
        () => madderRoot(3, 0.1, 0.0052, 2),
        () => madderCutLength(4, 0.052, 0.0058),
        () => madderCutLength(5, 0.041, 0.0078),
        () => madderCutLength(6, 0.03, 0.0042),
        () => madderCutLength(7, 0.06, 0.0031),
        () => madderCrown(8, 0.013, 0.085, 0.0038),
      ]);
      return { variants, blueprints: blueprintsFrom(variants, 2000, 22, 0.86, 1.14, [0.5, 0.6, 0.45, 3, 2, 3.6, 2.4, 0.1]), candidates: 40, maxTilt: 0.5, anyTumble: false, spins: true, seed: 102, fillsTo: 0.9, wallMargin: 0.003, leansOnOne: true, bedShare: 0.22, bedHeap: 0.1, crown: 0.032, seenDepth: 0.018, tones: ROOT_TONES };
    }
    case "chay-sheaves": {
      const variants = await builtInTurn([() => chaySheaf(1, 0.2, 0.036, 150), () => chaySheaf(2, 0.18, 0.03, 120), () => chaySheaf(3, 0.15, 0.02, 70), () => chaySheaf(4, 0.13, 0.016, 50)]);
      return { variants, blueprints: blueprintsFrom(variants, 40, 28, 0.9, 1.05, [1, 1, 2, 2]), candidates: 160, maxTilt: 0.2, anyTumble: false, spins: true, seed: 108, fillsTo: 0.9, wallMargin: 0.004, leansOnOne: true, bedShare: 0.08, bedHeap: 0.04, crown: 0.05, seenDepth: 0.05, tones: ROOT_TONES.slice(0, 4) };
    }
    case "dried-flakes": {
      const variants = await builtInTurn([() => driedFlake(1, 0.011), () => driedFlake(2, 0.009), () => driedFlake(3, 0.013), () => driedFlake(4, 0.008), () => driedFlake(5, 0.012), () => driedCalyx(6, 0.012)]);
      return { variants, blueprints: blueprintsFrom(variants, 4600, 23, 0.82, 1.2, [1, 1, 1, 1, 1, 0.6]), candidates: 5, maxTilt: 0.55, anyTumble: false, seed: 103, fillsTo: 0.9, wallMargin: 0.0055, leansOnOne: true, bedShare: 0.52, bedHeap: 0.2, crown: 0.022, seenDepth: 0.011, tones: FLOWER_TONES };
    }
    case "dried-calyces": {
      const variants = await builtInTurn([() => driedCalyx(1, 0.014), () => driedCalyx(2, 0.012), () => driedCalyx(3, 0.016), () => driedCalyx(4, 0.011), () => driedCalyx(5, 0.013), () => driedFlake(6, 0.01)]);
      return { variants, blueprints: blueprintsFrom(variants, 3800, 29, 0.84, 1.16, [1, 1, 1, 1, 1, 0.4]), candidates: 5, maxTilt: 0.6, anyTumble: false, spins: true, seed: 109, fillsTo: 0.9, wallMargin: 0.0055, leansOnOne: true, bedShare: 0.52, bedHeap: 0.2, crown: 0.022, seenDepth: 0.011, tones: FLOWER_TONES };
    }
    case "dry-leaves": {
      const variants = await builtInTurn([() => dryLeaf(1, 0.066, 0.031), () => dryLeaf(2, 0.054, 0.028), () => dryLeaf(3, 0.075, 0.036), () => dryLeaf(4, 0.05, 0.026), () => dryLeaf(5, 0.062, 0.033), () => dryLeaf(6, 0.07, 0.03)]);
      return { variants, blueprints: blueprintsFrom(variants, 520, 24, 0.86, 1.12), candidates: 40, maxTilt: 0.3, anyTumble: false, seed: 104, fillsTo: 0.92, wallMargin: 0.003, leansOnOne: true, bedShare: 0.2, bedHeap: 0.08, crown: 0.028, seenDepth: 0.024, tones: LEAF_TONES };
    }
    case "dried-fruit": {
      const variants = await builtInTurn([() => driedFruit(1, 0.031, 1.72, false, false), () => driedFruit(2, 0.028, 1.46, false, false), () => driedFruit(3, 0.034, 1.95, true, false), () => driedFruit(4, 0.029, 1.6, true, false), () => driedFruit(5, 0.03, 1.84, false, true), () => driedFruit(6, 0.026, 1.28, false, false), () => driedFruit(7, 0.033, 2.05, true, true)]);
      return { variants, blueprints: blueprintsFrom(variants, 700, 30, 0.84, 1.16), candidates: 50, maxTilt: 0.7, anyTumble: false, spins: true, seed: 110, fillsTo: 0.9, wallMargin: 0.003, leansOnOne: true, bedShare: 0.2, bedHeap: 0.1, crown: 0.03, seenDepth: 0.018, tones: FRUIT_TONES };
    }
    case "crystals": {
      const variants = await builtInTurn(Array.from({ length: 9 }, (_, i) => () => crystal(i + 1)));
      return { variants, blueprints: blueprintsFrom(variants, 340, 25, 0.5, 1.45), candidates: 40, maxTilt: 0.5, anyTumble: true, seed: 105, fillsTo: 0.6 };
    }
  }
}
