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
  readonly crown?: number;
  readonly spins?: boolean;
  readonly restAt?: (x: number, z: number) => number;
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

class SettledColumns {
  private readonly columns = new Map<number, PieceSphere[]>();

  constructor(private readonly cell: number) {}

  private key(ix: number, iz: number): number {
    return (ix + 4096) * 8192 + iz + 4096;
  }

  add(sphere: PieceSphere): void {
    const key = this.key(Math.floor(sphere.x / this.cell), Math.floor(sphere.z / this.cell));
    const column = this.columns.get(key);
    if (column) column.push(sphere);
    else this.columns.set(key, [sphere]);
  }

  near(x: number, z: number, reach: number, visit: (other: PieceSphere) => void): void {
    const lowX = Math.floor((x - reach) / this.cell);
    const highX = Math.floor((x + reach) / this.cell);
    const lowZ = Math.floor((z - reach) / this.cell);
    const highZ = Math.floor((z + reach) / this.cell);
    for (let ix = lowX; ix <= highX; ix++) {
      for (let iz = lowZ; iz <= highZ; iz++) {
        const column = this.columns.get(this.key(ix, iz));
        if (column) for (const other of column) visit(other);
      }
    }
  }
}

const SMALLEST_COLUMN_METRES = 0.006;

const CANDIDATES_PER_STEP = 24;

export function* packingSteps(profile: VesselProfile, blueprints: readonly PileBlueprint[], options: PackOptions): Generator<void, PlacedPiece[]> {
  const random = seededRandom(options.seed);
  const placed: PlacedPiece[] = [];
  let largest = 0;
  for (const blueprint of blueprints) for (const sphere of blueprint.spheres) largest = Math.max(largest, sphere.r * blueprint.scale);
  const settled = new SettledColumns(Math.max(largest, SMALLEST_COLUMN_METRES));
  const crown = options.crown ?? 0;
  const restAt = options.restAt ?? (() => profile.floorY);
  const step = 0.002;
  for (const blueprint of blueprints) {
    let best: { piece: PlacedPiece; spheres: PieceSphere[]; score: number } | null = null;
    for (let c = 0; c < options.candidates; c++) {
      if (c > 0 && c % CANDIDATES_PER_STEP === 0) yield;
      const yaw = random() * Math.PI * 2;
      const pitch = options.anyTumble || options.spins ? random() * Math.PI * 2 : (random() - 0.5) * options.maxTilt;
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
      for (const sphere of own) y = Math.max(y, restAt(sphere.x, sphere.z) + sphere.r - sphere.y);
      let slidesOff = false;
      for (const sphere of own) {
        settled.near(sphere.x, sphere.z, sphere.r + largest, (other) => {
          const dx = sphere.x - other.x;
          const dz = sphere.z - other.z;
          const reach = sphere.r + other.r;
          const flat = dx * dx + dz * dz;
          if (flat >= reach * reach) return;
          const onOther = other.y + Math.sqrt(reach * reach - flat) - sphere.y;
          if (onOther <= y) return;
          y = onOther;
          slidesOff = flat > (reach * MOST_OFF_CENTRE_REST) ** 2;
        });
      }
      const heapRise = crown * (1 - (radial / options.fillRadius) ** 2);
      const topY = options.topY + heapRise;
      if (best && y - heapRise >= best.score) continue;
      if (slidesOff && !options.leansOnOne) {
        let contacts = 0;
        for (const sphere of own) {
          settled.near(sphere.x, sphere.z, sphere.r + largest + CONTACT_TOLERANCE_METRES, (other) => {
            if (Math.hypot(sphere.x - other.x, sphere.y + y - other.y, sphere.z - other.z) <= sphere.r + other.r + CONTACT_TOLERANCE_METRES) contacts++;
          });
        }
        if (contacts < NESTED_CONTACTS) continue;
      }
      const restingY = y;
      let fits = false;
      while (!fits && y <= topY) {
        fits = own.every((sphere) => sphereFits(profile, sphere.x, sphere.y + y, sphere.z, sphere.r, options.margin));
        if (!fits) y += step;
      }
      if (!fits || y > topY || (best && y - heapRise >= best.score)) continue;
      if (y > restingY && !wallCanHold(profile, x, y, z)) continue;
      const finalY = y;
      let clear = true;
      for (const sphere of own) {
        settled.near(sphere.x, sphere.z, sphere.r + largest, (other) => {
          if (Math.hypot(sphere.x - other.x, sphere.y + finalY - other.y, sphere.z - other.z) < sphere.r + other.r - 1e-5) clear = false;
        });
        if (!clear) break;
      }
      if (!clear) continue;
      best = {
        piece: { variant: blueprint.variant, scale: blueprint.scale, x, y: finalY, z, yaw, pitch, roll },
        spheres: own.map((sphere) => ({ ...sphere, y: sphere.y + finalY })),
        score: finalY - heapRise,
      };
    }
    yield;
    if (!best) continue;
    placed.push(best.piece);
    for (const sphere of best.spheres) settled.add(sphere);
  }
  return placed;
}

export function worldSpheresOf(piece: PlacedPiece, spheres: readonly PieceSphere[]): PieceSphere[] {
  return spheres.map((sphere) => {
    const [x, y, z] = rotateYXZ(sphere.x * piece.scale, sphere.y * piece.scale, sphere.z * piece.scale, piece.yaw, piece.pitch, piece.roll);
    return { x: x + piece.x, y: y + piece.y, z: z + piece.z, r: sphere.r * piece.scale };
  });
}

const HEIGHT_CELL_METRES = 0.004;

export function piecesNearTop(pieces: readonly (readonly PieceSphere[])[], depthMetres: number): boolean[] {
  const tops = new Map<number, number>();
  const eachCell = (sphere: PieceSphere, visit: (key: number, top: number) => void) => {
    const lowX = Math.floor((sphere.x - sphere.r) / HEIGHT_CELL_METRES);
    const highX = Math.floor((sphere.x + sphere.r) / HEIGHT_CELL_METRES);
    const lowZ = Math.floor((sphere.z - sphere.r) / HEIGHT_CELL_METRES);
    const highZ = Math.floor((sphere.z + sphere.r) / HEIGHT_CELL_METRES);
    for (let ix = lowX; ix <= highX; ix++) {
      for (let iz = lowZ; iz <= highZ; iz++) {
        const dx = (ix + 0.5) * HEIGHT_CELL_METRES - sphere.x;
        const dz = (iz + 0.5) * HEIGHT_CELL_METRES - sphere.z;
        const flat = dx * dx + dz * dz;
        if (flat <= sphere.r * sphere.r) visit((ix + 4096) * 8192 + iz + 4096, sphere.y + Math.sqrt(sphere.r * sphere.r - flat));
      }
    }
  };
  for (const piece of pieces) {
    for (const sphere of piece) {
      eachCell(sphere, (key, top) => {
        if (top > (tops.get(key) ?? -Infinity)) tops.set(key, top);
      });
    }
  }
  return pieces.map((piece) => {
    let near = false;
    for (const sphere of piece) {
      eachCell(sphere, (key, top) => {
        if (top >= tops.get(key)! - depthMetres) near = true;
      });
      if (near) break;
    }
    return near;
  });
}
