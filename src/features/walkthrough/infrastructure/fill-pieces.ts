import type { SubstanceFill } from "@/features/process/domain/substance-look";
import type { PileForm } from "../domain/pile-form";
import { seededRandom, type PileBlueprint } from "../domain/pile-packing";
import { camelCluster, camelPellet, moistDungLump } from "./piece-dung";
import type { PieceShape, PieceVariant, Tone } from "./piece-mesh";
import { driedCalyx, driedFlake, dryLeaf } from "./piece-plants";
import { chaySheaf, madderCrown, madderCutLength, madderRoot } from "./piece-roots";
import type { WorkPacer } from "./work-pacer";

export type PileFill = Extract<SubstanceFill, "dung" | "roots" | "flowers" | "leaves">;

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
  readonly bare?: boolean;
  readonly bedHeap?: number;
  readonly crown?: number;
  readonly seenDepth?: number;
  readonly tones?: readonly Tone[];
}

export interface TonedPileRecipe extends PileRecipe {
  readonly meanTone: Tone;
}

export const isPileFill = (fill: SubstanceFill): fill is PileFill => fill === "dung" || fill === "roots" || fill === "flowers" || fill === "leaves";

export function blueprintsFrom(variants: readonly PieceShape[], count: number, seed: number, low: number, high: number, shares?: readonly number[]): PileBlueprint[] {
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

async function builtInTurn(pacer: WorkPacer, makers: readonly (() => Generator<void, PieceVariant>)[]): Promise<PieceVariant[]> {
  const variants: PieceVariant[] = [];
  for (const make of makers) variants.push(await pacer.run(make()));
  return variants;
}

const CAMEL_TONES: readonly Tone[] = [[1, 1, 1], [0.88, 0.87, 0.85], [1.1, 1.08, 1.04], [0.78, 0.76, 0.74], [0.96, 0.92, 0.84], [1.04, 1.02, 1]];
const COW_TONES: readonly Tone[] = [[1, 1, 1], [0.84, 0.82, 0.8], [1.14, 1.12, 1.08], [0.72, 0.7, 0.68], [1.04, 1, 0.94]];
const ROOT_TONES: readonly Tone[] = [[1, 1, 1], [0.8, 0.76, 0.74], [1.16, 1.08, 1], [0.64, 0.58, 0.56], [1.08, 0.96, 0.84], [0.92, 0.9, 0.88], [1.26, 1.14, 1.02]];
const FLOWER_TONES: readonly Tone[] = [[1, 1, 1], [0.8, 0.76, 0.72], [1.06, 1.06, 1.04], [0.9, 0.86, 0.8], [0.72, 0.66, 0.6], [1.1, 1.08, 1.06], [0.94, 0.9, 0.86]];
const LEAF_TONES: readonly Tone[] = [[1, 1, 1], [0.84, 0.78, 0.66], [1.08, 1.06, 0.92], [0.9, 0.84, 0.8], [0.74, 0.66, 0.56]];

async function shapedRecipe(pacer: WorkPacer, form: PileForm): Promise<PileRecipe> {
  switch (form) {
    case "camel-pellets": {
      const variants = await builtInTurn(pacer, [() => camelPellet(1, 0.036, 1.62, true), () => camelPellet(2, 0.044, 1.78, false), () => camelPellet(3, 0.03, 1.5, true), () => camelPellet(4, 0.05, 1.9, true), () => camelPellet(5, 0.033, 1.56, false), () => camelPellet(6, 0.04, 1.7, true), () => camelCluster(7, 0.021, 4), () => camelPellet(8, 0.027, 1.44, false)]);
      return { variants, blueprints: blueprintsFrom(variants, 420, 21, 0.78, 1.22, [1, 1, 1, 1, 1, 1, 0.2, 0.9]), candidates: 160, maxTilt: 0.8, anyTumble: false, spins: true, seed: 101, fillsTo: 0.95, wallMargin: 0.0075, leansOnOne: true, bedShare: 0.08, bedHeap: 0.05, crown: 0, seenDepth: 0.026, tones: CAMEL_TONES };
    }
    case "moist-dung": {
      const variants = await builtInTurn(pacer, [() => moistDungLump(1, 0.046), () => moistDungLump(2, 0.04), () => moistDungLump(3, 0.052), () => moistDungLump(4, 0.034), () => moistDungLump(5, 0.043), () => moistDungLump(6, 0.03)]);
      return { variants, blueprints: blueprintsFrom(variants, 420, 26, 0.85, 1.15), candidates: 160, maxTilt: 0.4, anyTumble: false, seed: 116, fillsTo: 0.95, wallMargin: 0.006, leansOnOne: true, bedShare: 0.26, bedHeap: 0.1, crown: 0, seenDepth: 0.04, tones: COW_TONES };
    }
    case "madder-roots": {
      const variants = await builtInTurn(pacer, [
        () => madderRoot(1, 0.17, 0.0072, 3),
        () => madderRoot(2, 0.13, 0.006, 2),
        () => madderRoot(3, 0.1, 0.0088, 2),
        () => madderCutLength(4, 0.055, 0.0095),
        () => madderCutLength(5, 0.042, 0.0125),
        () => madderCutLength(6, 0.034, 0.0072),
        () => madderCutLength(7, 0.062, 0.0056),
        () => madderCrown(8, 0.02, 0.085, 0.0066),
      ]);
      return { variants, blueprints: blueprintsFrom(variants, 1500, 22, 0.8, 1.2, [0.5, 0.6, 0.45, 3, 2, 3.6, 2.4, 0.1]), candidates: 40, maxTilt: 0.5, anyTumble: false, spins: true, seed: 102, fillsTo: 0.95, wallMargin: 0.003, leansOnOne: true, bedShare: 0.04, bare: true, bedHeap: 0, crown: 0, seenDepth: 0.028, tones: ROOT_TONES };
    }
    case "chay-sheaves": {
      const variants = await builtInTurn(pacer, [() => chaySheaf(1, 0.15, 0.024, 150), () => chaySheaf(2, 0.13, 0.02, 120), () => chaySheaf(3, 0.115, 0.016, 76), () => chaySheaf(4, 0.1, 0.013, 56)]);
      return { variants, blueprints: blueprintsFrom(variants, 40, 28, 0.9, 1.05, [1, 1, 2, 2]), candidates: 200, maxTilt: 0.12, anyTumble: false, spins: true, seed: 108, fillsTo: 0.95, wallMargin: 0.008, leansOnOne: true, bedShare: 0.04, bare: true, bedHeap: 0, crown: 0, seenDepth: 0.05, tones: ROOT_TONES.slice(0, 4) };
    }
    case "dried-calyces": {
      const variants = await builtInTurn(pacer, [() => driedCalyx(1, 0.014), () => driedCalyx(2, 0.012), () => driedCalyx(3, 0.016), () => driedCalyx(4, 0.011), () => driedCalyx(5, 0.013), () => driedFlake(6, 0.01)]);
      return { variants, blueprints: blueprintsFrom(variants, 3800, 29, 0.84, 1.16, [1, 1, 1, 1, 1, 0.4]), candidates: 5, maxTilt: 0.6, anyTumble: false, spins: true, seed: 109, fillsTo: 0.9, wallMargin: 0.0055, leansOnOne: true, bedShare: 0.52, bedHeap: 0.2, crown: 0.022, seenDepth: 0.011, tones: FLOWER_TONES };
    }
    case "dry-leaves": {
      const variants = await builtInTurn(pacer, [() => dryLeaf(1, 0.066, 0.031), () => dryLeaf(2, 0.054, 0.028), () => dryLeaf(3, 0.075, 0.036), () => dryLeaf(4, 0.05, 0.026), () => dryLeaf(5, 0.062, 0.033), () => dryLeaf(6, 0.07, 0.03)]);
      return { variants, blueprints: blueprintsFrom(variants, 520, 24, 0.86, 1.12), candidates: 40, maxTilt: 0.3, anyTumble: false, seed: 104, fillsTo: 0.92, wallMargin: 0.003, leansOnOne: true, bedShare: 0.2, bedHeap: 0.08, crown: 0.028, seenDepth: 0.024, tones: LEAF_TONES };
    }
  }
}

function meanVertexTone(variant: PieceVariant): Tone {
  const colour = variant.geometry.attributes.color;
  if (!colour) return [1, 1, 1];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < colour.count; i++) {
    r += colour.getX(i);
    g += colour.getY(i);
    b += colour.getZ(i);
  }
  return [r / colour.count, g / colour.count, b / colour.count];
}

function meanToneOf(recipe: PileRecipe): Tone {
  const perVariant = recipe.variants.map(meanVertexTone);
  const sum: [number, number, number] = [0, 0, 0];
  for (const blueprint of recipe.blueprints) for (const c of [0, 1, 2] as const) sum[c] += perVariant[blueprint.variant]![c];
  const tones = recipe.tones ?? [[1, 1, 1] as Tone];
  const channel = (c: 0 | 1 | 2): number => (sum[c] / recipe.blueprints.length) * (tones.reduce((total, tone) => total + tone[c], 0) / tones.length);
  return [channel(0), channel(1), channel(2)];
}

export async function pileRecipe(pacer: WorkPacer, form: PileForm): Promise<TonedPileRecipe> {
  const recipe = await shapedRecipe(pacer, form);
  return { ...recipe, meanTone: meanToneOf(recipe) };
}
