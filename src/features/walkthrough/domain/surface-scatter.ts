import type { HeightAt } from "./fill-surface";
import { rotateYXZ, seededRandom, type PieceSphere, type PlacedPiece } from "./pile-packing";
import { wallRadius, type VesselProfile } from "./vessel-profile";

export interface ScatterKind {
  readonly variants: readonly number[];
  readonly spheresOf: (variant: number) => readonly PieceSphere[];
  readonly count: number;
  readonly smallest: number;
  readonly largest: number;
  readonly towardWall: number;
  readonly sink: number;
  readonly tries?: number;
  readonly lying?: boolean;
}

export interface ScatterOptions {
  readonly profile: VesselProfile;
  readonly heightAt: HeightAt;
  readonly level: number;
  readonly seed: number;
  readonly margin: number;
  readonly avoid?: readonly PieceSphere[];
}

const CELL_METRES = 0.012;
const DEFAULT_TRIES = 10;
const SLOPE_SPAN_METRES = 0.012;
const LYING_TILT = 0.22;

const cellKey = (i: number, j: number, k: number): number => (i + 512) * 1048576 + (j + 512) * 1024 + (k + 512);

class SphereField {
  private readonly cells = new Map<number, PieceSphere[]>();
  private largest = 0;

  add(sphere: PieceSphere): void {
    this.largest = Math.max(this.largest, sphere.r);
    const key = cellKey(Math.floor(sphere.x / CELL_METRES), Math.floor(sphere.y / CELL_METRES), Math.floor(sphere.z / CELL_METRES));
    const known = this.cells.get(key);
    if (known) known.push(sphere);
    else this.cells.set(key, [sphere]);
  }

  clashes(sphere: PieceSphere): boolean {
    const span = Math.ceil((sphere.r + this.largest) / CELL_METRES);
    const ci = Math.floor(sphere.x / CELL_METRES);
    const cj = Math.floor(sphere.y / CELL_METRES);
    const ck = Math.floor(sphere.z / CELL_METRES);
    for (let i = ci - span; i <= ci + span; i++) {
      for (let j = cj - span; j <= cj + span; j++) {
        for (let k = ck - span; k <= ck + span; k++) {
          const known = this.cells.get(cellKey(i, j, k));
          if (!known) continue;
          for (const other of known) if (Math.hypot(sphere.x - other.x, sphere.y - other.y, sphere.z - other.z) < sphere.r + other.r) return true;
        }
      }
    }
    return false;
  }
}

function insideWall(profile: VesselProfile, sphere: PieceSphere, margin: number): boolean {
  const theta = Math.atan2(sphere.z, sphere.x);
  const radial = Math.hypot(sphere.x, sphere.z);
  const reach = Math.min(wallRadius(profile, theta, sphere.y), wallRadius(profile, theta, sphere.y - sphere.r), wallRadius(profile, theta, sphere.y + sphere.r));
  return radial + sphere.r + margin <= reach;
}

export function* scatterSteps(kinds: readonly ScatterKind[], options: ScatterOptions): Generator<void, PlacedPiece[]> {
  const random = seededRandom(options.seed);
  const field = new SphereField();
  for (const sphere of options.avoid ?? []) field.add(sphere);
  const placed: PlacedPiece[] = [];
  for (const kind of kinds) {
    for (let n = 0; n < kind.count; n++) {
      const variant = kind.variants[n % kind.variants.length]!;
      const spheres = kind.spheresOf(variant);
      const scale = kind.smallest + random() * (kind.largest - kind.smallest);
      for (let attempt = 0; attempt < (kind.tries ?? DEFAULT_TRIES); attempt++) {
        const theta = random() * Math.PI * 2;
        const along = random() ** (1 / (1 + kind.towardWall * 3));
        const wall = wallRadius(options.profile, theta, options.level);
        const x = Math.cos(theta) * wall * along;
        const z = Math.sin(theta) * wall * along;
        const yaw = random() * Math.PI * 2;
        const ground = options.heightAt(x, z, along);
        const slopeAlong = (dx: number, dz: number): number => (options.heightAt(x + dx * SLOPE_SPAN_METRES, z + dz * SLOPE_SPAN_METRES, along) - options.heightAt(x - dx * SLOPE_SPAN_METRES, z - dz * SLOPE_SPAN_METRES, along)) / (2 * SLOPE_SPAN_METRES);
        const pitch = kind.lying ? -Math.atan(slopeAlong(Math.sin(yaw), Math.cos(yaw))) + (random() - 0.5) * LYING_TILT : random() * Math.PI * 2;
        const roll = kind.lying ? Math.atan(slopeAlong(Math.cos(yaw), -Math.sin(yaw))) + (random() - 0.5) * LYING_TILT : random() * Math.PI * 2;
        const turned = spheres.map((sphere) => {
          const [sx, sy, sz] = rotateYXZ(sphere.x * scale, sphere.y * scale, sphere.z * scale, yaw, pitch, roll);
          return { x: sx, y: sy, z: sz, r: sphere.r * scale };
        });
        const under = turned.reduce((lowest, sphere) => Math.min(lowest, sphere.y - sphere.r), 0);
        const y = ground - under * (1 - kind.sink);
        const world = turned.map((sphere) => ({ x: sphere.x + x, y: sphere.y + y, z: sphere.z + z, r: sphere.r }));
        if (!world.every((sphere) => insideWall(options.profile, sphere, options.margin))) continue;
        if (world.some((sphere) => field.clashes(sphere))) continue;
        for (const sphere of world) field.add(sphere);
        placed.push({ variant, scale, x, y, z, yaw, pitch, roll });
        break;
      }
      yield;
    }
  }
  return placed;
}

export function scatterOnSurface(kinds: readonly ScatterKind[], options: ScatterOptions): PlacedPiece[] {
  const steps = scatterSteps(kinds, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
