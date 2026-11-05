import { wallRadius, type VesselProfile } from "./vessel-profile";

export interface SurfaceGrid {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export interface WallFilmGrid extends SurfaceGrid {
  readonly share: Float32Array;
}

export type HeightAt = (x: number, z: number, wallNearness: number) => number;

const RIM_TUCK_METRES = 0.0015;
const TAU = Math.PI * 2;
const CREST_ROUNDING = 0.3;

const undulation = (x: number, z: number, scale: number): number =>
  (Math.sin(x * scale + 1.3) * Math.sin(z * scale * 0.83 - 0.7) + 0.5 * Math.sin(x * scale * 1.9 - z * scale * 1.3 + 2.1) + 0.25 * Math.sin(x * scale * 3.7 + z * scale * 3.1)) / 1.75;

const fract = (value: number): number => value - Math.floor(value);

const lattice = (i: number, j: number, seed: number): number => fract(Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453);

const easing = (t: number): number => t * t * (3 - 2 * t);

export function valueNoise(x: number, z: number, seed = 0): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const u = easing(x - i);
  const v = easing(z - j);
  const low = lattice(i, j, seed) * (1 - u) + lattice(i + 1, j, seed) * u;
  const high = lattice(i, j + 1, seed) * (1 - u) + lattice(i + 1, j + 1, seed) * u;
  return low * (1 - v) + high * v;
}

function layeredNoise(x: number, z: number, seed: number, octaves: number): number {
  let total = 0;
  let weight = 1;
  let reach = 0;
  let scale = 1;
  for (let octave = 0; octave < octaves; octave++) {
    total += weight * valueNoise(x * scale + octave * 17.3, z * scale - octave * 9.1, seed + octave);
    reach += weight;
    weight *= 0.5;
    scale *= 2.03;
  }
  return total / reach - 0.5;
}

export function levelInVessel(profile: VesselProfile, fraction: number): number {
  return profile.floorY + (profile.rimY - profile.floorY) * fraction;
}

export function meanWallRadius(profile: VesselProfile, y: number): number {
  let total = 0;
  for (let a = 0; a < profile.angleCount; a++) total += wallRadius(profile, (a / profile.angleCount) * TAU, y);
  return total / profile.angleCount;
}

export function fittedSurface(profile: VesselProfile, rimLevel: number, rings: number, spokes: number, heightAt: HeightAt, tuck = RIM_TUCK_METRES): SurfaceGrid {
  const positions = new Float32Array((1 + rings * spokes) * 3);
  positions.set([0, heightAt(0, 0, 0), 0], 0);
  for (let ring = 1; ring <= rings; ring++) {
    const along = ring / rings;
    const reach = 1 - (1 - along) * (1 - along);
    for (let spoke = 0; spoke < spokes; spoke++) {
      const theta = (spoke / spokes) * TAU;
      const first = (wallRadius(profile, theta, rimLevel) + tuck) * reach;
      const raised = heightAt(Math.cos(theta) * first, Math.sin(theta) * first, reach);
      const radius = (Math.min(wallRadius(profile, theta, rimLevel), wallRadius(profile, theta, raised)) + tuck) * reach;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;
      positions.set([x, heightAt(x, z, reach), z], (1 + (ring - 1) * spokes + spoke) * 3);
    }
  }
  const indices = new Uint32Array((spokes + (rings - 1) * spokes * 2) * 3);
  let cursor = 0;
  for (let spoke = 0; spoke < spokes; spoke++) {
    const next = (spoke + 1) % spokes;
    indices.set([0, 1 + next, 1 + spoke], cursor);
    cursor += 3;
    for (let ring = 1; ring < rings; ring++) {
      const inner = 1 + (ring - 1) * spokes;
      const outer = inner + spokes;
      indices.set([inner + spoke, inner + next, outer + spoke, inner + next, outer + next, outer + spoke], cursor);
      cursor += 6;
    }
  }
  return { positions, indices };
}

export const flatLevel = (level: number): HeightAt => () => level;

export interface HeapShape {
  readonly reach: number;
  readonly seed: number;
  readonly crownOffset: number;
  readonly slumps: number;
  readonly slumpDepth: number;
  readonly lineDepth: number;
  readonly lumpDepth: number;
  readonly fineDepth: number;
  readonly climb: number;
}

interface SlumpScar {
  readonly angle: number;
  readonly at: number;
  readonly width: number;
  readonly length: number;
  readonly depth: number;
}

const angleBetween = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function slumpScars(shape: HeapShape): readonly SlumpScar[] {
  return Array.from({ length: shape.slumps }, (_, i) => {
    const pick = (slot: number) => lattice(i, slot, shape.seed + 3);
    return { angle: (i / shape.slumps + pick(1) * 0.7) * TAU, at: 0.38 + pick(2) * 0.3, width: 0.16 + pick(3) * 0.16, length: 0.16 + pick(4) * 0.12, depth: 0.55 + pick(5) * 0.45 };
  });
}

export function heapHeight(level: number, heap: number, shape: HeapShape): HeightAt {
  const crownAngle = lattice(1, 2, shape.seed) * TAU;
  const crownX = Math.cos(crownAngle) * shape.crownOffset;
  const crownZ = Math.sin(crownAngle) * shape.crownOffset;
  const scars = slumpScars(shape);
  const flatTop = Math.sqrt(1 + CREST_ROUNDING * CREST_ROUNDING);
  const { reach, seed } = shape;
  return (x, z, wallNearness) => {
    const u = x / reach;
    const v = z / reach;
    const dx = u - crownX;
    const dz = v - crownZ;
    const warp = 1 + 0.42 * layeredNoise(u * 1.7 + 4, v * 1.7 - 2, seed, 2);
    const fromCrown = Math.hypot(dx, dz) * warp;
    const rise = Math.max(0, 1 - fromCrown / (1 + shape.crownOffset));
    const body = (flatTop - Math.sqrt((1 - rise) * (1 - rise) + CREST_ROUNDING * CREST_ROUNDING)) / (flatTop - CREST_ROUNDING);
    const inner = 1 - wallNearness ** 12;
    const angle = Math.atan2(dz, dx);
    let slump = 0;
    for (const scar of scars) {
      const across = (angleBetween(angle, scar.angle) * Math.max(fromCrown, 0.05)) / scar.width;
      if (Math.abs(across) > 2.6) continue;
      const along = (fromCrown - scar.at) / scar.length;
      slump += scar.depth * Math.exp(-across * across) * (-Math.exp(-(along + 0.55) * (along + 0.55) * 5) + 0.7 * Math.exp(-(along - 0.6) * (along - 0.6) * 7));
    }
    const streak = 1 - Math.abs(2 * valueNoise(Math.cos(angle) * 5 + 11, Math.sin(angle) * 5 + fromCrown * 1.3, seed + 5) - 1);
    const broken = valueNoise(u * 4.1 + 3, v * 4.1 - 8, seed + 6);
    const fall = (streak * streak * streak - 0.25) * shape.lineDepth * easing(Math.min(1, Math.max(0, (fromCrown - 0.22) * 3.2))) * (0.25 + broken);
    const lumps = layeredNoise(u * 9, v * 9, seed + 7, 3) * shape.lumpDepth;
    const fine = layeredNoise(x * 260, z * 260, seed + 9, 2) * shape.fineDepth;
    const climb = shape.climb * wallNearness ** 30 * (0.25 + valueNoise(x * 42, z * 42, seed + 11));
    return level + heap * body * inner + slump * shape.slumpDepth * inner + fall * inner + lumps + fine + climb;
  };
}

export function moundHeight(level: number, heap: number, grain: number): HeightAt {
  return (x, z, wallNearness) => {
    const crown = heap * (1 - wallNearness * wallNearness) ** 1.25;
    const rough = grain * (undulation(x, z, 60) + 0.4 * undulation(x + 3, z - 2, 170)) * (1 - wallNearness ** 10);
    return level + crown + rough;
  };
}

export interface PasteBody {
  readonly reach: number;
  readonly seed: number;
  readonly dome: number;
  readonly meniscus: number;
  readonly creep: number;
  readonly strokes: number;
  readonly tracks: number;
  readonly furrowDepth: number;
  readonly furrowWidth: number;
  readonly folds: number;
  readonly swell: number;
}

const DEFAULT_PASTE: PasteBody = { reach: 0.1, seed: 3, dome: 0.05, meniscus: 0.07, creep: 14, strokes: 4, tracks: 2, furrowDepth: 0.03, furrowWidth: 0.045, folds: 0, swell: 0.02 };

interface Stroke {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly middle: number;
  readonly span: number;
  readonly depth: number;
}

function pasteStrokes(body: PasteBody): readonly Stroke[] {
  return Array.from({ length: body.strokes }, (_, i) => {
    const pick = (slot: number) => lattice(i + 1, slot, body.seed + 21);
    const away = 0.18 + pick(1) * 0.62;
    const heading = pick(2) * TAU;
    return { x: Math.cos(heading) * away, z: Math.sin(heading) * away, radius: 0.32 + pick(3) * 0.42, middle: pick(4) * TAU, span: 0.7 + pick(5) * 0.9, depth: 0.65 + pick(6) * 0.35 };
  });
}

export function pasteHeight(level: number, depth: number, body: PasteBody = DEFAULT_PASTE): HeightAt {
  const strokes = pasteStrokes(body);
  const dome = depth * body.dome;
  const meniscus = depth * body.meniscus;
  const swell = depth * body.swell;
  const furrow = depth * body.furrowDepth;
  const { reach, seed, furrowWidth: width } = body;
  return (x, z, wallNearness) => {
    const u = x / reach;
    const v = z / reach;
    const inner = 1 - wallNearness ** 8;
    let carved = 0;
    for (const stroke of strokes) {
      const dx = u - stroke.x;
      const dz = v - stroke.z;
      const along = angleBetween(Math.atan2(dz, dx), stroke.middle) / stroke.span;
      if (Math.abs(along) >= 1) continue;
      const fade = easing(Math.min(1, (1 - Math.abs(along)) * 4));
      const from = Math.hypot(dx, dz) - stroke.radius + 0.09 * layeredNoise(u * 3.3 + stroke.x * 9, v * 3.3 + stroke.z * 9, seed + 8, 2);
      for (let track = 0; track < body.tracks; track++) {
        const off = (from - (track - (body.tracks - 1) / 2) * width * 2.3) / (width * (0.8 + 0.5 * valueNoise(along * 3 + track * 5, stroke.x * 7, seed + 10)));
        carved += stroke.depth * fade * (-Math.exp(-off * off) + 0.42 * Math.exp(-(Math.abs(off) - 1.7) * (Math.abs(off) - 1.7) * 1.6));
      }
    }
    const warpU = u + 0.5 * layeredNoise(u * 2.1, v * 2.1, seed + 2, 2);
    const warpV = v + 0.5 * layeredNoise(u * 2.1 + 9, v * 2.1 - 5, seed + 3, 2);
    const folded = body.folds === 0 ? 0 : (1 - Math.abs(Math.sin((warpU * 0.8 + warpV * 0.6) * body.folds))) ** 2 - 0.3;
    const soft = undulation(x, z, 34) * swell + layeredNoise(u * 6, v * 6, seed + 4, 2) * swell;
    const climb = meniscus * wallNearness ** body.creep * (0.7 + 0.6 * valueNoise(x * 30, z * 30, seed + 5));
    const rise = dome * (1 - wallNearness * wallNearness);
    return level + rise + climb + (soft + carved * furrow + folded * depth * 0.045) * inner;
  };
}

const SHADE_RING_REACH = 1 / 12;
const SHADE_SPOKE_REACH = 1 / 40;

export interface SurfaceShading {
  readonly cavityMetres: number;
  readonly cavity: number;
  readonly wall: number;
}

export function surfaceShade(grid: SurfaceGrid, rings: number, spokes: number, shading: SurfaceShading): Float32Array {
  const heights = grid.positions;
  const heightOf = (ring: number, spoke: number): number => {
    if (ring <= 0) return heights[1]!;
    const clamped = Math.min(rings, ring);
    return heights[(1 + (clamped - 1) * spokes + ((spoke % spokes) + spokes) % spokes) * 3 + 1]!;
  };
  const ringStep = Math.max(1, Math.round(rings * SHADE_RING_REACH));
  const spokeStep = Math.max(1, Math.round(spokes * SHADE_SPOKE_REACH));
  const colours = new Float32Array((1 + rings * spokes) * 3).fill(1);
  for (let ring = 1; ring <= rings; ring++) {
    const along = ring / rings;
    const reach = 1 - (1 - along) * (1 - along);
    const nearWall = 1 - shading.wall * reach ** 7;
    for (let spoke = 0; spoke < spokes; spoke++) {
      const around = (heightOf(ring - ringStep, spoke) + heightOf(ring + ringStep, spoke) + heightOf(ring, spoke - spokeStep) + heightOf(ring, spoke + spokeStep)) / 4;
      const proud = Math.max(-1, Math.min(1, (heightOf(ring, spoke) - around) / shading.cavityMetres));
      const shade = nearWall * (1 + shading.cavity * proud);
      colours.set([shade, shade, shade], (1 + (ring - 1) * spokes + spoke) * 3);
    }
  }
  return colours;
}

const FILM_ROWS_TUCKED = 2;

export function wallFilm(rows: number, spokes: number, bottom: (theta: number) => number, top: (theta: number) => number, wallAt: (theta: number, y: number) => number, inset: number): WallFilmGrid {
  const across = rows + 1;
  const positions = new Float32Array(across * spokes * 3);
  const share = new Float32Array(across * spokes);
  for (let spoke = 0; spoke < spokes; spoke++) {
    const theta = (spoke / spokes) * TAU;
    const from = bottom(theta);
    const to = top(theta);
    for (let row = 0; row <= rows; row++) {
      const along = row / rows;
      const y = from + (to - from) * along;
      const radius = wallAt(theta, y) - inset;
      positions.set([Math.cos(theta) * radius, y, Math.sin(theta) * radius], (spoke * across + row) * 3);
      share[spoke * across + row] = Math.max(0, (row - FILM_ROWS_TUCKED) / (rows - FILM_ROWS_TUCKED));
    }
  }
  const indices = new Uint32Array(rows * spokes * 6);
  let cursor = 0;
  for (let spoke = 0; spoke < spokes; spoke++) {
    const next = (spoke + 1) % spokes;
    for (let row = 0; row < rows; row++) {
      const a = spoke * across + row;
      const b = next * across + row;
      indices.set([a, b, a + 1, b, b + 1, a + 1], cursor);
      cursor += 6;
    }
  }
  return { positions, indices, share };
}
