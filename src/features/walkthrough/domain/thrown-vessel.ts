export type ProfilePoint = readonly [radius: number, height: number];

export interface ThrownForm {
  readonly path: readonly ProfilePoint[];
  readonly rings: number;
  readonly segments: number;
  readonly seed: number;
  readonly outOfRound: number;
  readonly rimTiltMetres: number;
  readonly ringDepthMetres: number;
  readonly ringPitchMetres: number;
  readonly rimWearMetres: number;
  readonly rimNicks: number;
}

export interface ThrownMesh {
  readonly positions: Float32Array;
  readonly tones: Float32Array;
  readonly indices: Uint32Array;
  readonly rings: number;
  readonly segments: number;
  readonly heightMetres: number;
}

const TAU = Math.PI * 2;
const SMALLEST_RADIUS = 1e-4;
const RIM_ZONE_SHARE = 0.11;
const NICK_DEPTH_SHARE = 2.4;
const NICK_WIDTH_RADIANS = 0.07;
const INNER_RING_GAIN = 1.5;
const TONE_RIM_RUB = 0.16;
const TONE_FOOT_DARKENING = 0.2;
const TONE_FLOOR_DARKENING = 0.26;
const TONE_MOTTLE = 0.05;

const catmullRom = (a: number, b: number, c: number, d: number, t: number): number => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

const smoothBetween = (low: number, high: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

export function sampledPath(path: readonly ProfilePoint[], rings: number): ProfilePoint[] {
  const spans = path.length - 1;
  const lengths = path.slice(1).map((point, i) => Math.hypot(point[0] - path[i]![0], point[1] - path[i]![1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const out: ProfilePoint[] = [];
  let span = 0;
  let travelled = 0;
  for (let ring = 0; ring < rings; ring++) {
    const wanted = (ring / (rings - 1)) * total;
    while (span < spans - 1 && travelled + lengths[span]! < wanted) {
      travelled += lengths[span]!;
      span++;
    }
    const t = Math.min(1, (wanted - travelled) / lengths[span]!);
    const before = path[Math.max(0, span - 1)]!;
    const from = path[span]!;
    const to = path[span + 1]!;
    const after = path[Math.min(path.length - 1, span + 2)]!;
    out.push([Math.max(SMALLEST_RADIUS, catmullRom(before[0], from[0], to[0], after[0], t)), Math.max(0, catmullRom(before[1], from[1], to[1], after[1], t))]);
  }
  return out;
}

function phasesFrom(seed: number): readonly number[] {
  return Array.from({ length: 8 }, (_, i) => (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % TAU);
}

const RINGS_PER_STEP = 12;

export function* throwingSteps(form: ThrownForm): Generator<void, ThrownMesh> {
  const profile = sampledPath(form.path, form.rings);
  const height = Math.max(...profile.map(([, y]) => y));
  const topRing = profile.findIndex(([, y]) => y === height);
  const phases = phasesFrom(form.seed);
  const nicks = Array.from({ length: form.rimNicks }, (_, i) => (phases[i % phases.length]! + (i * TAU) / Math.max(1, form.rimNicks)) % TAU);
  const positions = new Float32Array(form.rings * form.segments * 3);
  const tones = new Float32Array(form.rings * form.segments);
  for (let ring = 0; ring < form.rings; ring++) {
    if (ring % RINGS_PER_STEP === 0) yield;
    const [radius, y] = profile[ring]!;
    const share = y / height;
    const inside = ring > topRing;
    const rim = smoothBetween(1 - RIM_ZONE_SHARE, 1, share);
    const ringing = form.ringDepthMetres * (inside ? INNER_RING_GAIN : 1) * (1 - rim) * (Math.sin((y * TAU) / form.ringPitchMetres + phases[0]!) + 0.55 * Math.sin((y * TAU * 2.37) / form.ringPitchMetres + phases[1]!));
    const faded = smoothBetween(0, 0.004, radius);
    for (let segment = 0; segment < form.segments; segment++) {
      const theta = (segment / form.segments) * TAU;
      const round = 1 + form.outOfRound * (0.35 + 0.65 * share) * (0.62 * Math.sin(2 * theta + phases[2]!) + 0.28 * Math.sin(3 * theta + phases[3]!) + 0.1 * Math.sin(5 * theta + phases[4]! + share * 2));
      const wear = form.rimWearMetres * rim * (0.6 * Math.sin(theta * 23 + phases[5]!) + 0.4 * Math.sin(theta * 41 + phases[6]!));
      const nick = rim * nicks.reduce((deepest, at) => {
        const gap = Math.abs(((theta - at + Math.PI + TAU * 4) % TAU) - Math.PI);
        return Math.max(deepest, Math.exp(-((gap / NICK_WIDTH_RADIANS) ** 2)));
      }, 0);
      const across = radius * round + faded * ringing + wear * (inside ? 1 : -1);
      const lifted = y + form.rimTiltMetres * share ** 3 * Math.cos(theta - phases[7]!) - nick * form.rimWearMetres * NICK_DEPTH_SHARE;
      const k = (ring * form.segments + segment) * 3;
      positions[k] = Math.cos(theta) * across;
      positions[k + 1] = Math.max(0, lifted);
      positions[k + 2] = Math.sin(theta) * across;
      const mottle = TONE_MOTTLE * (Math.sin(theta * 3 + y * 40 + phases[1]!) * 0.6 + Math.sin(theta * 7 - y * 90 + phases[3]!) * 0.4);
      const foot = inside ? 0 : TONE_FOOT_DARKENING * (1 - smoothBetween(0, 0.28, share));
      const floor = inside ? TONE_FLOOR_DARKENING * (1 - smoothBetween(0.05, 0.75, share)) : 0;
      tones[ring * form.segments + segment] = 1 + mottle + rim * TONE_RIM_RUB + nick * TONE_RIM_RUB - foot - floor;
    }
  }
  const indices = new Uint32Array((form.rings - 1) * form.segments * 6);
  let cursor = 0;
  for (let ring = 0; ring + 1 < form.rings; ring++) {
    for (let segment = 0; segment < form.segments; segment++) {
      const next = (segment + 1) % form.segments;
      const a = ring * form.segments + segment;
      const b = (ring + 1) * form.segments + segment;
      const c = ring * form.segments + next;
      const d = (ring + 1) * form.segments + next;
      indices.set([a, b, c, b, d, c], cursor);
      cursor += 6;
    }
  }
  return { positions, tones, indices, rings: form.rings, segments: form.segments, heightMetres: height };
}

export const CLAY_BOWL: ThrownForm = {
  path: [
    [0.0005, 0],
    [0.06, 0],
    [0.0675, 0.0008],
    [0.0725, 0.0045],
    [0.095, 0.0215],
    [0.12, 0.0465],
    [0.1375, 0.0715],
    [0.144, 0.0855],
    [0.1505, 0.092],
    [0.153, 0.098],
    [0.1505, 0.1035],
    [0.145, 0.105],
    [0.1395, 0.1025],
    [0.1365, 0.0965],
    [0.1285, 0.08],
    [0.1115, 0.056],
    [0.09, 0.0345],
    [0.06, 0.0185],
    [0.03, 0.0115],
    [0.0005, 0.0095],
  ],
  rings: 150,
  segments: 128,
  seed: 3.7,
  outOfRound: 0.012,
  rimTiltMetres: 0.0028,
  ringDepthMetres: 0.00016,
  ringPitchMetres: 0.0095,
  rimWearMetres: 0.00045,
  rimNicks: 4,
};

export const CLAY_POT: ThrownForm = {
  path: [
    [0.0005, 0],
    [0.068, 0],
    [0.0765, 0.001],
    [0.083, 0.006],
    [0.107, 0.033],
    [0.1275, 0.07],
    [0.136, 0.108],
    [0.1295, 0.142],
    [0.1115, 0.1665],
    [0.0985, 0.1775],
    [0.1, 0.1825],
    [0.1065, 0.1875],
    [0.108, 0.193],
    [0.1045, 0.1975],
    [0.099, 0.1985],
    [0.094, 0.196],
    [0.091, 0.189],
    [0.089, 0.1795],
    [0.1, 0.1665],
    [0.118, 0.1415],
    [0.1265, 0.108],
    [0.118, 0.0695],
    [0.098, 0.0355],
    [0.07, 0.0185],
    [0.035, 0.0115],
    [0.0005, 0.0095],
  ],
  rings: 190,
  segments: 128,
  seed: 8.1,
  outOfRound: 0.011,
  rimTiltMetres: 0.0025,
  ringDepthMetres: 0.00014,
  ringPitchMetres: 0.011,
  rimWearMetres: 0.0004,
  rimNicks: 3,
};
