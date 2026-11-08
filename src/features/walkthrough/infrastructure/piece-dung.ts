import { seededRandom } from "../domain/pile-packing";
import { addBody, addTube, layered, mixTone, noise3, PieceMesh, PLAIN, shadeTone, smoothstep, surfaceCover, type BodyPoint, type PieceVariant, type Point, type Tone } from "./piece-mesh";

const TORN_FIBRE: Tone = [1.24, 1.02, 0.74];
const STRAW: Tone = [1.32, 1.1, 0.78];
const DEEP_CREVICE = 0.6;
const FINE_DETAIL = 13;
const COARSE_DETAIL = 3;

interface PelletShape {
  readonly halfLength: number;
  readonly ratio: number;
  readonly taper: number;
  readonly bend: number;
  readonly creases: readonly { readonly angle: number; readonly depth: number; readonly width: number; readonly wander: number }[];
  readonly seam: { readonly angle: number; readonly from: number; readonly to: number } | null;
  readonly splitAngle: number;
  readonly seed: number;
}

function pelletPoint(shape: PelletShape, dx: number, dy: number, dz: number): BodyPoint {
  const { halfLength, ratio, taper, bend, creases, seam, seed } = shape;
  const girth = 1 - taper * (dx + 1) * 0.5;
  const halfWidth = (halfLength / ratio) * girth;
  const around = Math.atan2(dz, dy);
  const lump = 1 + 0.07 * layered(dx, dy, dz, 1.6, seed) + 0.018 * layered(dx, dy, dz, 7, seed + 3);
  let groove = 0;
  let crevice = 0;
  const endFade = 1 - dx * dx * dx * dx;
  for (const crease of creases) {
    const offset = Math.abs(Math.sin((around - crease.angle - crease.wander * Math.sin(dx * 2.6 + seed)) * 0.5));
    const cut = Math.exp(-((offset / crease.width) ** 2)) * endFade;
    groove += cut * crease.depth;
    crevice = Math.max(crevice, cut);
  }
  let tone: Tone = PLAIN;
  const split = smoothstep(0.62, 0.98, dx);
  if (split > 0) {
    const cleft = Math.abs(Math.sin((around - shape.splitAngle) * 0.5 + 0.08 * noise3(dx * 7 + seed, dy * 7, dz * 7)));
    const open = (1 - smoothstep(0.05, 0.2, cleft)) * split;
    groove += open * 0.16;
    crevice = Math.max(crevice, open * 0.8);
    tone = mixTone(tone, shadeTone(TORN_FIBRE, 0.78 + 0.3 * noise3(dx * 34, dy * 34 + seed, dz * 34)), open * 0.9 + split * 0.25);
  }
  let lip = 0;
  if (seam) {
    const across = Math.abs(Math.sin((around - seam.angle - 0.14 * Math.sin(dx * 5.2 + seed)) * 0.5));
    const spread = smoothstep(seam.from, seam.from + 0.18, dx) * (1 - smoothstep(seam.to - 0.18, seam.to, dx));
    const ragged = 0.11 + 0.07 * noise3(dx * 9 + seed, dy * 9, dz * 9);
    const open = (1 - smoothstep(ragged * 0.6, ragged, across)) * spread;
    lip = 0.035 * Math.exp(-(((across - ragged * 1.2) / 0.04) ** 2)) * spread;
    groove += open * 0.1;
    tone = mixTone(tone, shadeTone(TORN_FIBRE, 0.82 + 0.3 * noise3(dx * 30, dy * 30 + seed, dz * 30)), open);
  }
  const shrink = lump - groove + lip;
  const shade = 1 - (1 - DEEP_CREVICE) * crevice * crevice;
  const x = dx * halfLength * shrink;
  const lift = bend * (dx * dx - 0.35) * halfLength;
  return { point: [x, dy * halfWidth * shrink + lift, dz * halfWidth * 1.04 * shrink], tone: shadeTone(tone, shade) };
}

function fibreOnSkin(mesh: PieceMesh, surface: (x: number, y: number, z: number) => BodyPoint, seed: number, length: number, radius: number): void {
  const random = seededRandom(seed);
  const start: [number, number, number] = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
  const heading: [number, number, number] = [random() * 2 - 1, (random() - 0.5) * 0.6, (random() - 0.5) * 0.6];
  const count = 10;
  const stand = radius * 1.4;
  const path: Point[] = [];
  let [x, y, z] = start;
  for (let i = 0; i <= count; i++) {
    const norm = Math.hypot(x, y, z) || 1;
    const { point } = surface(x / norm, y / norm, z / norm);
    const out = Math.hypot(point[0], point[1], point[2]) || 1;
    path.push([point[0] + (point[0] / out) * stand, point[1] + (point[1] / out) * stand, point[2] + (point[2] / out) * stand]);
    x = x / norm + heading[0] * length;
    y = y / norm + heading[1] * length;
    z = z / norm + heading[2] * length;
  }
  addTube(mesh, {
    rings: count,
    sides: 5,
    lengthMetres: 0.02,
    pathAt: (t) => path[Math.min(count, Math.round(t * count))]!,
    radiusAt: (t) => radius * (t < 0.1 ? 0.4 : 1 - t * 0.5),
    surfaceAt: () => ({ radial: 1, tone: STRAW }),
  });
}

function pelletShape(seed: number, length: number, ratio: number, seamed: boolean): PelletShape {
  const random = seededRandom(seed * 577 + 19);
  const creaseCount = 1 + Math.floor(random() * 3);
  return {
    halfLength: length / 2,
    ratio,
    taper: 0.08 + random() * 0.17,
    bend: random() < 0.4 ? 0.1 + random() * 0.12 : random() * 0.04,
    creases: Array.from({ length: creaseCount }, () => ({ angle: random() * Math.PI * 2, depth: 0.035 + random() * 0.035, width: 0.025 + random() * 0.035, wander: 0.1 + random() * 0.3 })),
    seam: seamed ? { angle: random() * Math.PI * 2, from: -0.75 + random() * 0.4, to: 0.3 + random() * 0.5 } : null,
    splitAngle: random() * Math.PI * 2,
    seed: seed * 3.7,
  };
}

export function* camelPellet(seed: number, length: number, ratio: number, seamed: boolean): Generator<void, PieceVariant> {
  const shape = pelletShape(seed, length, ratio, seamed);
  const surface = (x: number, y: number, z: number) => pelletPoint(shape, x, y, z);
  const fine = new PieceMesh();
  addBody(fine, FINE_DETAIL, surface);
  for (let f = 0; f < 5; f++) fibreOnSkin(fine, surface, seed * 37 + f, 0.05 + f * 0.012, 0.00022 + f * 0.00004);
  const coarse = new PieceMesh();
  addBody(coarse, COARSE_DETAIL, surface);
  const geometry = yield* fine.buildSteps();
  const thickness = (shape.halfLength / shape.ratio) * 2 * (1 - shape.taper * 0.5);
  return { geometry, buried: yield* coarse.buildSteps(), spheres: surfaceCover(geometry, thickness * 0.75, thickness * 0.38) };
}

interface Lobe {
  readonly centre: Point;
  readonly radius: number;
}

function exitAlong(lobe: Lobe, dx: number, dy: number, dz: number): number {
  const along = dx * lobe.centre[0] + dy * lobe.centre[1] + dz * lobe.centre[2];
  const within = along * along - (lobe.centre[0] ** 2 + lobe.centre[1] ** 2 + lobe.centre[2] ** 2) + lobe.radius * lobe.radius;
  return within <= 0 ? 0 : along + Math.sqrt(within);
}

export function* camelCluster(seed: number, spread: number, lobes: number): Generator<void, PieceVariant> {
  const random = seededRandom(seed * 211 + 5);
  const parts: Lobe[] = Array.from({ length: lobes }, (_, i) => {
    const theta = (i / lobes) * Math.PI * 2 + random() * 0.7;
    const off = spread * (0.55 + random() * 0.25);
    return { centre: [Math.cos(theta) * off, (random() - 0.5) * spread * 0.5, Math.sin(theta) * off * 0.78] as const, radius: spread * (0.48 + random() * 0.2) };
  });
  const surface = (dx: number, dy: number, dz: number): BodyPoint => {
    const exits = parts.map((part) => exitAlong(part, dx, dy, dz));
    const softest = Math.log(exits.reduce((sum, value) => sum + Math.exp(value / (spread * 0.1)), 0)) * spread * 0.1;
    const sorted = [...exits].sort((a, b) => b - a);
    const join = 1 - smoothstep(0, spread * 0.09, sorted[0]! - (sorted[1] ?? 0));
    const crack = Math.abs(layered(dx, dy, dz, 3.2, seed));
    const cracked = 1 - smoothstep(0.015, 0.05, crack);
    const reach = Math.max(spread * 0.4, softest) * (1 + 0.03 * layered(dx, dy, dz, 6, seed + 2) - 0.035 * cracked - 0.07 * join);
    const tone = shadeTone(mixTone(PLAIN, TORN_FIBRE, cracked * 0.35), 1 - 0.55 * Math.max(join * 0.9, cracked * 0.65));
    return { point: [dx * reach, dy * reach * 0.88, dz * reach], tone };
  };
  const fine = new PieceMesh();
  addBody(fine, FINE_DETAIL + 6, surface);
  const coarse = new PieceMesh();
  addBody(coarse, COARSE_DETAIL + 1, surface);
  const geometry = yield* fine.buildSteps();
  return { geometry, buried: yield* coarse.buildSteps(), spheres: surfaceCover(geometry, spread * 0.8, spread * 0.4) };
}

export function* moistDungLump(seed: number, size: number): Generator<void, PieceVariant> {
  const random = seededRandom(seed * 773 + 29);
  const bulges = Array.from({ length: 3 + Math.floor(random() * 3) }, () => {
    const theta = random() * Math.PI * 2;
    const rise = random() * 1.2 - 0.2;
    const flat = Math.sqrt(Math.max(0, 1 - rise * rise));
    return { x: Math.cos(theta) * flat, y: rise, z: Math.sin(theta) * flat, height: 0.12 + random() * 0.16, width: 0.45 + random() * 0.35 };
  });
  const foldTurn = random() * Math.PI;
  const stretch: Point = [size * (0.55 + random() * 0.12), size * (0.3 + random() * 0.08), size * (0.48 + random() * 0.1)];
  const surface = (dx: number, dy: number, dz: number): BodyPoint => {
    let swell = 1;
    for (const bulge of bulges) swell += bulge.height * Math.exp(-(((dx - bulge.x) ** 2 + (dy - bulge.y) ** 2 + (dz - bulge.z) ** 2) / (bulge.width * bulge.width)));
    const settle = dy < 0 ? 1 - 0.35 * dy * dy : 1;
    const fold = Math.abs(Math.sin((dx * Math.cos(foldTurn) + dz * Math.sin(foldTurn)) * 3.1 + 0.6 * layered(dx, dy, dz, 1.4, seed + 6)));
    const crease = (1 - smoothstep(0.04, 0.3, fold)) * smoothstep(-0.1, 0.5, dy);
    const soft = 0.05 * layered(dx, dy, dz, 2.4, seed) + 0.014 * layered(dx, dy, dz, 9, seed + 1);
    const reach = (swell + soft - crease * 0.05) * settle;
    const damp = smoothstep(0.45, 0.75, noise3(dx * 2.2 + seed, dy * 2.2, dz * 2.2));
    const tone = shadeTone(PLAIN, (1 - 0.32 * crease) * (1 - 0.16 * damp));
    return { point: [dx * reach * stretch[0], dy * reach * stretch[1], dz * reach * stretch[2]], tone };
  };
  const fine = new PieceMesh();
  addBody(fine, 24, surface);
  for (let f = 0; f < 4; f++) fibreOnSkin(fine, surface, seed * 41 + f, 0.035 + f * 0.01, 0.00045 + f * 0.00008);
  const coarse = new PieceMesh();
  addBody(coarse, 6, surface);
  const geometry = yield* fine.buildSteps();
  return { geometry, buried: yield* coarse.buildSteps(), spheres: surfaceCover(geometry, stretch[1] * 1.6, stretch[1] * 0.8) };
}
