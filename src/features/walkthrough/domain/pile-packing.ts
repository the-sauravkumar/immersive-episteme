import { wallRadius, type VesselProfile } from "./vessel-profile";

export interface PieceSphere {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

export interface PileBlueprint {
  readonly variant: number;
  readonly scale: number;
  readonly spheres: readonly PieceSphere[];
}

export interface PlacedPiece {
  readonly variant: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
}

export interface PackOptions {
  readonly seed: number;
  readonly candidates: number;
  readonly maxTilt: number;
  readonly anyTumble: boolean;
  readonly topY: number;
  readonly margin: number;
  readonly fillRadius: number;
  readonly leansOnOne?: boolean;
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rotateYXZ(x: number, y: number, z: number, yaw: number, pitch: number, roll: number): [number, number, number] {
  const cz = Math.cos(roll);
  const sz = Math.sin(roll);
  const x1 = x * cz - y * sz;
  const y1 = x * sz + y * cz;
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const y2 = y1 * cx - z * sx;
  const z2 = y1 * sx + z * cx;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];
}

function sphereFits(profile: VesselProfile, x: number, y: number, z: number, r: number, margin: number): boolean {
  const radial = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  for (const k of [-1, -0.5, 0, 0.5, 1]) {
    const reach = Math.sqrt(1 - k * k) * r;
    if (radial + reach + margin > wallRadius(profile, theta, y + k * r)) return false;
  }
  return true;
}

const WALL_SPAN_METRES = 0.015;
const STEEPEST_WALL_THAT_HOLDS = 0.5;
const MOST_OFF_CENTRE_REST = 0.72;
const CONTACT_TOLERANCE_METRES = 0.002;
const NESTED_CONTACTS = 2;

function wallCanHold(profile: VesselProfile, x: number, y: number, z: number): boolean {
  const theta = Math.atan2(z, x);
  const flare = (wallRadius(profile, theta, y + WALL_SPAN_METRES) - wallRadius(profile, theta, y - WALL_SPAN_METRES)) / (2 * WALL_SPAN_METRES);
  return flare >= STEEPEST_WALL_THAT_HOLDS;
}

export function packPile(profile: VesselProfile, blueprints: readonly PileBlueprint[], options: PackOptions): PlacedPiece[] {
  const steps = packingSteps(profile, blueprints, options);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function* packingSteps(profile: VesselProfile, blueprints: readonly PileBlueprint[], options: PackOptions): Generator<void, PlacedPiece[]> {
  const random = seededRandom(options.seed);
  const placed: PlacedPiece[] = [];
  const settled: PieceSphere[] = [];
  const step = 0.002;
  for (const blueprint of blueprints) {
    let best: { piece: PlacedPiece; spheres: PieceSphere[] } | null = null;
    for (let c = 0; c < options.candidates; c++) {
      const yaw = random() * Math.PI * 2;
      const pitch = options.anyTumble ? random() * Math.PI * 2 : (random() - 0.5) * options.maxTilt;
      const roll = options.anyTumble ? random() * Math.PI * 2 : (random() - 0.5) * options.maxTilt;
      const angle = random() * Math.PI * 2;
      const radial = Math.sqrt(random()) * options.fillRadius;
      const x = Math.cos(angle) * radial;
      const z = Math.sin(angle) * radial;
      const own = blueprint.spheres.map((sphere) => {
        const [sx, sy, sz] = rotateYXZ(sphere.x * blueprint.scale, sphere.y * blueprint.scale, sphere.z * blueprint.scale, yaw, pitch, roll);
        return { x: sx + x, y: sy, z: sz + z, r: sphere.r * blueprint.scale };
      });
      let y = profile.floorY;
      for (const sphere of own) y = Math.max(y, profile.floorY + sphere.r - sphere.y);
      let slidesOff = false;
      for (const sphere of own) {
        for (const other of settled) {
          const dx = sphere.x - other.x;
          const dz = sphere.z - other.z;
          const reach = sphere.r + other.r;
          const flat = dx * dx + dz * dz;
          if (flat >= reach * reach) continue;
          const onOther = other.y + Math.sqrt(reach * reach - flat) - sphere.y;
          if (onOther <= y) continue;
          y = onOther;
          slidesOff = flat > (reach * MOST_OFF_CENTRE_REST) ** 2;
        }
      }
      if (best && y >= best.piece.y) continue;
      const contacts = own.reduce((count, sphere) => count + settled.filter((other) => Math.hypot(sphere.x - other.x, sphere.y + y - other.y, sphere.z - other.z) <= sphere.r + other.r + CONTACT_TOLERANCE_METRES).length, 0);
      if (slidesOff && !options.leansOnOne && contacts < NESTED_CONTACTS) continue;
      const restingY = y;
      let fits = false;
      while (!fits && y <= options.topY) {
        fits = own.every((sphere) => sphereFits(profile, sphere.x, sphere.y + y, sphere.z, sphere.r, options.margin));
        if (!fits) y += step;
      }
      if (!fits || y > options.topY || (best && y >= best.piece.y)) continue;
      if (y > restingY && !wallCanHold(profile, x, y, z)) continue;
      const finalY = y;
      const clearOfOthers = own.every((sphere) => settled.every((other) => Math.hypot(sphere.x - other.x, sphere.y + finalY - other.y, sphere.z - other.z) >= sphere.r + other.r - 1e-5));
      if (!clearOfOthers) continue;
      best = {
        piece: { variant: blueprint.variant, scale: blueprint.scale, x, y: finalY, z, yaw, pitch, roll },
        spheres: own.map((sphere) => ({ ...sphere, y: sphere.y + finalY })),
      };
    }
    yield;
    if (!best) continue;
    placed.push(best.piece);
    settled.push(...best.spheres);
  }
  return placed;
}
