export interface VesselProfile {
  readonly floorY: number;
  readonly rimY: number;
  readonly heights: Float32Array;
  readonly angleCount: number;
  readonly radii: Float32Array;
}

const HEIGHT_COUNT = 36;
const ANGLE_COUNT = 96;
const MEASURE_SLICES = 72;
const RIM_COVERAGE = 0.6;
const OUTLIER_RATIO = 1.1;
const FLOOR_PROBES = 13;
const WALL_REACH_SHARE = 0.4;
const LOWEST_ROW_SHARE = 0.55;
const TAU = Math.PI * 2;

interface Segment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
}

function sliceAt(triangles: Float32Array, y: number): Segment[] {
  const out: Segment[] = [];
  const crossing = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): [number, number] | null => {
    if ((y1 > y) === (y2 > y)) return null;
    const t = (y - y1) / (y2 - y1);
    return [x1 + (x2 - x1) * t, z1 + (z2 - z1) * t];
  };
  for (let i = 0; i < triangles.length; i += 9) {
    const ay = triangles[i + 1]!;
    const by = triangles[i + 4]!;
    const cy = triangles[i + 7]!;
    if ((ay > y && by > y && cy > y) || (ay <= y && by <= y && cy <= y)) continue;
    const hits = [
      crossing(triangles[i]!, ay, triangles[i + 2]!, triangles[i + 3]!, by, triangles[i + 5]!),
      crossing(triangles[i + 3]!, by, triangles[i + 5]!, triangles[i + 6]!, cy, triangles[i + 8]!),
      crossing(triangles[i + 6]!, cy, triangles[i + 8]!, triangles[i]!, ay, triangles[i + 2]!),
    ].filter((hit): hit is [number, number] => hit !== null);
    if (hits.length === 2) out.push({ ax: hits[0]![0], az: hits[0]![1], bx: hits[1]![0], bz: hits[1]![1] });
  }
  return out;
}

function radialHits(segments: readonly Segment[]): Float32Array {
  const hits = new Float32Array(ANGLE_COUNT).fill(Number.POSITIVE_INFINITY);
  const step = TAU / ANGLE_COUNT;
  for (const { ax, az, bx, bz } of segments) {
    const a0 = Math.atan2(az, ax);
    let span = Math.atan2(bz, bx) - a0;
    if (span > Math.PI) span -= TAU;
    if (span < -Math.PI) span += TAU;
    const low = Math.min(a0, a0 + span);
    const high = Math.max(a0, a0 + span);
    for (let k = Math.ceil(low / step); k <= Math.floor(high / step); k++) {
      const angle = k * step;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const sx = bx - ax;
      const sz = bz - az;
      const denominator = dx * sz - dz * sx;
      if (Math.abs(denominator) < 1e-12) continue;
      const distance = (ax * sz - az * sx) / denominator;
      if (distance <= 0) continue;
      const index = ((k % ANGLE_COUNT) + ANGLE_COUNT) % ANGLE_COUNT;
      if (distance < hits[index]!) hits[index] = distance;
    }
  }
  return hits;
}

function coverage(hits: Float32Array): number {
  let finite = 0;
  for (let i = 0; i < hits.length; i++) if (Number.isFinite(hits[i]!)) finite++;
  return finite / hits.length;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function downwardHit(triangles: Float32Array, x: number, z: number, fromY: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < triangles.length; i += 9) {
    const ax = triangles[i]!;
    const az = triangles[i + 2]!;
    const bx = triangles[i + 3]!;
    const bz = triangles[i + 5]!;
    const cx = triangles[i + 6]!;
    const cz = triangles[i + 8]!;
    const area = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(area) < 1e-14) continue;
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / area;
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / area;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const y = u * triangles[i + 1]! + v * triangles[i + 4]! + w * triangles[i + 7]!;
    if (y < fromY && (best === null || y > best)) best = y;
  }
  return best;
}

function cleaned(hits: Float32Array): Float32Array {
  const out = new Float32Array(hits);
  for (let i = 0; i < ANGLE_COUNT; i++) {
    const near: number[] = [];
    for (let offset = -4; offset <= 4; offset++) {
      const value = hits[(i + offset + ANGLE_COUNT) % ANGLE_COUNT]!;
      if (Number.isFinite(value)) near.push(value);
    }
    if (near.length === 0) continue;
    const middle = median(near);
    const value = hits[i]!;
    if (!Number.isFinite(value) || value > middle * OUTLIER_RATIO) out[i] = middle;
  }
  return out;
}

export function measureVesselProfile(triangles: Float32Array): VesselProfile {
  const steps = measuringSteps(triangles);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export function* measuringSteps(triangles: Float32Array): Generator<void, VesselProfile> {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 1; i < triangles.length; i += 3) {
    minY = Math.min(minY, triangles[i]!);
    maxY = Math.max(maxY, triangles[i]!);
  }
  const span = maxY - minY;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < triangles.length; i += 3) {
    minX = Math.min(minX, triangles[i]!);
    maxX = Math.max(maxX, triangles[i]!);
    minZ = Math.min(minZ, triangles[i + 2]!);
    maxZ = Math.max(maxZ, triangles[i + 2]!);
  }
  const wallReach = (Math.min(maxX - minX, maxZ - minZ) / 2) * WALL_REACH_SHARE;
  let rimY = minY;
  const reach: number[] = [];
  for (let s = 1; s < MEASURE_SLICES; s++) {
    const y = minY + (span * s) / MEASURE_SLICES;
    yield;
    const hits = radialHits(sliceAt(triangles, y));
    const finite = [...hits].filter((value) => Number.isFinite(value));
    if (coverage(hits) < RIM_COVERAGE) continue;
    const typical = median(finite);
    if (typical < wallReach) continue;
    if (reach.length > 0 && typical > median(reach) * 2) continue;
    reach.push(typical);
    rimY = y;
  }
  const typicalReach = median(reach);
  const probes: number[] = [];
  for (let k = 0; k < FLOOR_PROBES; k++) {
    const distance = k === 0 ? 0 : typicalReach * 0.2;
    const angle = (k / (FLOOR_PROBES - 1)) * TAU;
    yield;
    const hit = downwardHit(triangles, Math.cos(angle) * distance, Math.sin(angle) * distance, rimY + span * 0.01);
    if (hit !== null) probes.push(hit);
  }
  const floorY = probes.length > 0 ? median(probes) : minY;
  const heights = new Float32Array(HEIGHT_COUNT);
  const radii = new Float32Array(HEIGHT_COUNT * ANGLE_COUNT);
  const rows: Float32Array[] = new Array<Float32Array>(HEIGHT_COUNT);
  let typicalAbove = typicalReach;
  for (let h = HEIGHT_COUNT - 1; h >= 0; h--) {
    const y = floorY + ((rimY - floorY) * (h + 0.04)) / (HEIGHT_COUNT - 0.96);
    heights[h] = y;
    yield;
    const row = cleaned(radialHits(sliceAt(triangles, y)));
    const finite = [...row].filter((value) => Number.isFinite(value));
    const typical = finite.length > 0 ? median(finite) : 0;
    if (typical < typicalAbove * LOWEST_ROW_SHARE) rows[h] = new Float32Array(ANGLE_COUNT).fill(Number.POSITIVE_INFINITY);
    else {
      rows[h] = row;
      typicalAbove = typical;
    }
  }
  for (let h = 0; h < HEIGHT_COUNT; h++) {
    for (let a = 0; a < ANGLE_COUNT; a++) {
      let value = rows[h]![a]!;
      for (let distance = 1; !Number.isFinite(value) && distance < HEIGHT_COUNT; distance++) {
        const above = rows[h + distance]?.[a];
        const below = rows[h - distance]?.[a];
        if (above !== undefined && Number.isFinite(above)) value = above;
        else if (below !== undefined && Number.isFinite(below)) value = below;
      }
      radii[h * ANGLE_COUNT + a] = Number.isFinite(value) ? value : typicalReach;
    }
  }
  return { floorY, rimY, heights, angleCount: ANGLE_COUNT, radii };
}

export function wallRadius(profile: VesselProfile, theta: number, y: number): number {
  const { heights, angleCount, radii } = profile;
  const count = heights.length;
  const first = heights[0]!;
  const last = heights[count - 1]!;
  const clamped = Math.min(last, Math.max(first, y));
  const position = ((clamped - first) / (last - first || 1)) * (count - 1);
  const h0 = Math.min(count - 2, Math.floor(position));
  const ht = position - h0;
  const turn = (((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * angleCount;
  const a0 = Math.floor(turn) % angleCount;
  const a1 = (a0 + 1) % angleCount;
  const at = turn - Math.floor(turn);
  const low = radii[h0 * angleCount + a0]! * (1 - at) + radii[h0 * angleCount + a1]! * at;
  const high = radii[(h0 + 1) * angleCount + a0]! * (1 - at) + radii[(h0 + 1) * angleCount + a1]! * at;
  return low * (1 - ht) + high * ht;
}

export function smallestWallRadius(profile: VesselProfile, y: number): number {
  let smallest = Number.POSITIVE_INFINITY;
  for (let a = 0; a < profile.angleCount; a++) smallest = Math.min(smallest, wallRadius(profile, (a / profile.angleCount) * Math.PI * 2, y));
  return smallest;
}

export function widestWallRadius(profile: VesselProfile, y: number): number {
  let widest = 0;
  for (let a = 0; a < profile.angleCount; a++) widest = Math.max(widest, wallRadius(profile, (a / profile.angleCount) * Math.PI * 2, y));
  return widest;
}

export function outsideDepth(profile: VesselProfile, x: number, y: number, z: number): number {
  const belowFloor = profile.floorY - y;
  const radial = Math.hypot(x, z);
  const beyondWall = y <= profile.rimY || radial < wallRadius(profile, Math.atan2(z, x), profile.rimY) * 1.5 ? radial - wallRadius(profile, Math.atan2(z, x), y) : 0;
  return Math.max(belowFloor, beyondWall, 0);
}
