import { seededRandom } from "../domain/pile-packing";
import { addBody, addTube, coverWithSpheres, layered, mixTone, noise3, PieceMesh, PLAIN, shadeTone, smoothstep, wanderingPath, type PieceVariant, type Point, type Tone } from "./piece-mesh";

const CUT_CORE: Tone = [2.3, 1.55, 0.95];
const BARK_RIND: Tone = [0.62, 0.56, 0.5];
const FLAKED_UNDER: Tone = [0.6, 0.5, 0.44];
const PALE_TIP: Tone = [1.22, 1.2, 1.12];
const BINDING_FIBRE: Tone = [1.25, 0.95, 0.6];

function barkSurface(seed: number) {
  return (_t: number, angle: number, along: number) => {
    const cx = Math.cos(angle);
    const cz = Math.sin(angle);
    const ridges = 0.09 * Math.sin(angle * 5 + along * 90 + seed) + 0.05 * Math.sin(angle * 3 - along * 140 + seed * 2) + 0.05 * layered(cx * 3, along * 30, cz * 3, 1, seed + 5);
    const flakeField = layered(cx * 1.4, along * 62, cz * 1.4, 1, seed);
    const flake = smoothstep(-0.03, 0.14, flakeField);
    const swollen = 0.1 * noise3(along * 28 + seed, seed, 0) + 0.05 * noise3(along * 80, seed + 2, 0);
    const crossBreak = Math.exp(-((((along * 1000 + seed * 13) % 37) - 18) ** 2) / 8) * 0.05;
    const node = 0.16 * smoothstep(0.55, 0.9, noise3(along * 34 + seed * 3, seed + 9, 0)) * (0.7 + 0.3 * Math.cos(angle * 2 + seed));
    const radial = 1 + ridges + swollen + node - flake * 0.16 - crossBreak;
    const streak = smoothstep(0.1, 0.4, noise3(cx * 1.2 + seed, along * 25, cz * 1.2));
    let tone = mixTone(PLAIN, FLAKED_UNDER, flake);
    tone = shadeTone(tone, 1 - 0.32 * streak + 0.14 * noise3(along * 50, angle, seed));
    tone = shadeTone(tone, 1 - 0.3 * (1 - smoothstep(-0.11, -0.02, ridges)));
    return { radial: Math.max(0.3, radial), tone };
  };
}

function brokenEnd(seed: number, radius: number, showsCore: boolean) {
  return (radial: number, angle: number) => {
    const jag = 0.22 * radius * noise3(Math.cos(angle) * 2.2 * (radial + 0.4) + seed, Math.sin(angle) * 2.2 * (radial + 0.4), seed) + 0.14 * radius * noise3(Math.cos(angle) * 6 * radial, Math.sin(angle) * 6 * radial, seed + 3);
    const rind = smoothstep(0.62, 0.78, radial);
    const pith = 1 - smoothstep(0.08, 0.2, radial);
    const core = showsCore ? shadeTone(CUT_CORE, 0.9 + 0.25 * noise3(radial * 7, angle, seed)) : shadeTone(PLAIN, 1.1);
    const tone = mixTone(mixTone(core, shadeTone(core, 0.62), pith), BARK_RIND, rind);
    return { lift: jag, tone };
  };
}

function sidesFor(radius: number): number {
  return Math.max(10, Math.min(40, Math.ceil(Math.PI / Math.acos(1 - 0.00005 / Math.max(radius, 0.0012)))));
}

interface RootShape {
  readonly seed: number;
  readonly length: number;
  readonly radius: number;
  readonly taper: number;
  readonly wander: number;
  readonly kinks: number;
  readonly rootlets: number;
  readonly cutBoth: boolean;
  readonly crown?: number;
}

function tubeOf(mesh: PieceMesh, shape: RootShape, ringsPerMetre: number, sides: number, path: (t: number) => Point, showsCore: boolean): void {
  const { seed, length, radius, taper, cutBoth } = shape;
  const rings = Math.max(6, Math.round(length * ringsPerMetre));
  const radiusAt = (t: number) => {
    const tip = cutBoth ? 1 : Math.min(1, ((1 - t) * length) / (radius * 2.5) + 0.26) ** 0.6;
    return radius * (1 - taper * t) * tip;
  };
  addTube(mesh, {
    rings,
    sides,
    lengthMetres: length,
    pathAt: path,
    radiusAt,
    surfaceAt: barkSurface(seed),
    capStart: brokenEnd(seed, radius, showsCore),
    ...(cutBoth ? { capEnd: brokenEnd(seed + 7, radius * (1 - taper), showsCore) } : { capEnd: () => ({ lift: 0, tone: shadeTone(PLAIN, 0.8) }) }),
  });
}

function rootVariant(shape: RootShape, showsCore: boolean): PieceVariant {
  const random = seededRandom(shape.seed * 41 + 9);
  const path = wanderingPath(shape.seed, shape.length, shape.wander, shape.kinks);
  const fine = new PieceMesh();
  const sides = sidesFor(shape.radius);
  tubeOf(fine, shape, 900, sides, path, showsCore);
  const coarse = new PieceMesh();
  tubeOf(coarse, shape, 320, sides, path, showsCore);
  const centres: Point[] = [];
  const steps = Math.ceil(shape.length / (shape.radius * 1.5));
  for (let i = 0; i <= steps; i++) centres.push(path(i / steps));
  for (let r = 0; r < shape.rootlets; r++) {
    const from = path(0.15 + random() * 0.7);
    const heading = random() * Math.PI * 2;
    const span = 0.004 + random() * 0.006;
    const thin = 0.0005 + random() * 0.0003;
    const out = shape.radius * 0.75;
    const bend = random() * 0.004;
    const rootlet = (t: number): Point => [from[0] + span * t * 0.5, from[1] + Math.cos(heading) * (out + span * t) + bend * t * t, from[2] + Math.sin(heading) * (out + span * t)];
    addTube(fine, { rings: 10, sides: 7, lengthMetres: span, pathAt: rootlet, radiusAt: (t) => thin * (1 - t * 0.6), surfaceAt: () => ({ radial: 1, tone: shadeTone(PLAIN, 0.9) }) });
    centres.push(rootlet(1));
  }
  if (shape.crown) {
    const size = shape.crown;
    const at = path(0);
    const body = (dx: number, dy: number, dz: number) => {
      const reach = size * (1 + 0.14 * layered(dx, dy, dz, 3.1, shape.seed) + 0.09 * layered(dx, dy, dz, 9, shape.seed + 1));
      return { point: [at[0] + dx * reach - size * 0.4, at[1] + dy * reach, at[2] + dz * reach] as Point, tone: shadeTone(PLAIN, 0.82 + 0.45 * layered(dx, dy, dz, 12, shape.seed + 2)) };
    };
    addBody(fine, 14, body);
    addBody(coarse, 7, body);
    centres.push([at[0] - size * 0.4, at[1], at[2]]);
  }
  const geometry = fine.build();
  return { geometry, buried: coarse.build(), spheres: coverWithSpheres(geometry, centres) };
}

export function madderRoot(seed: number, length: number, radius: number, kinks: number): PieceVariant {
  return rootVariant({ seed, length, radius, taper: 0.45, wander: radius * 1.5, kinks, rootlets: 2, cutBoth: false }, true);
}

export function madderCutLength(seed: number, length: number, radius: number): PieceVariant {
  return rootVariant({ seed, length, radius, taper: 0.14, wander: radius * 0.7, kinks: 0, rootlets: 0, cutBoth: true }, true);
}

export function madderCrown(seed: number, size: number, length: number, radius: number): PieceVariant {
  return rootVariant({ seed, length, radius, taper: 0.5, wander: radius * 1.5, kinks: 1, rootlets: 1, cutBoth: false, crown: size }, true);
}

const STRAND_RADIUS = 0.001;
const CORE_REACH = 0.5;
const WAIST_PINCH = 0.78;
const GOLDEN_ANGLE = 2.39996;

export function chaySheaf(seed: number, sheafLength: number, sheafRadius: number, strands: number): PieceVariant {
  const random = seededRandom(seed * 89 + 3);
  const fine = new PieceMesh();
  const coarse = new PieceMesh();
  const core = (t: number): number => sheafRadius * CORE_REACH * (1 - t) ** 0.55;
  const coreTube = (mesh: PieceMesh, rings: number, sides: number) =>
    addTube(mesh, {
      rings,
      sides,
      lengthMetres: sheafLength * 0.7,
      pathAt: (t) => [-sheafLength / 2 + 0.02 + t * sheafLength * 0.56, 0, 0],
      radiusAt: (t) => Math.max(core(t), 0.0008),
      surfaceAt: (_t, angle, along) => ({ radial: 1, tone: shadeTone(PLAIN, 0.6 + 0.2 * noise3(along * 200, angle * 2, seed)) }),
      capStart: (radial, angle) => ({ lift: -0.004 * (1 - radial), tone: shadeTone(PLAIN, 0.5 + 0.25 * noise3(radial * 40, angle * 3, seed)) }),
      capEnd: (radial, angle) => ({ lift: -0.003 * (1 - radial), tone: shadeTone(PLAIN, 0.5 + 0.25 * noise3(radial * 40, angle * 3, seed + 1)) }),
      capRings: 1,
    });
  const waist = -sheafLength * 0.2;
  coreTube(fine, 16, 36);
  coreTube(coarse, 8, 16);
  for (let i = 0; i < strands; i++) {
    const share = (i + 0.5) / strands;
    const rank = CORE_REACH * 0.9 + (1 - CORE_REACH * 0.9) * Math.sqrt(share);
    const angle = i * GOLDEN_ANGLE;
    const y0 = Math.cos(angle) * sheafRadius * rank;
    const z0 = Math.sin(angle) * sheafRadius * rank;
    const stops = (1 - 0.68 * share ** 0.8) * (0.86 + random() * 0.14);
    const phase = random() * Math.PI * 2;
    const wave = 0.0012 + random() * 0.0012;
    const startsAt = random() * 0.008;
    const thin = STRAND_RADIUS * (0.8 + random() * 0.5);
    const path = (t: number): Point => {
      const along = t * stops;
      const x = -sheafLength / 2 + startsAt + along * sheafLength;
      const inward = (1 - 0.12 * along) * (1 - (1 - WAIST_PINCH) * Math.exp(-(((x - waist) / (sheafLength * 0.09)) ** 2)));
      return [x, y0 * inward + Math.sin(along * 38 + phase) * wave + Math.sin(along * 97 + phase * 2) * wave * 0.45, z0 * inward + Math.cos(along * 31 + phase) * wave + Math.sin(along * 83 - phase) * wave * 0.4];
    };
    const tone = (t: number): Tone => shadeTone(mixTone(PLAIN, PALE_TIP, smoothstep(0.55, 1, t)), 0.86 + 0.3 * noise3(i * 0.7, t * 6, seed));
    addTube(fine, {
      rings: 36,
      sides: 8,
      lengthMetres: sheafLength * stops,
      pathAt: path,
      radiusAt: (t) => thin * (1 - 0.55 * t) * (1 + 0.16 * noise3(t * 30, i, seed)),
      surfaceAt: (t) => ({ radial: 1, tone: tone(t) }),
      capStart: () => ({ lift: 0, tone: shadeTone(PLAIN, 0.75) }),
      capEnd: () => ({ lift: 0, tone: tone(1) }),
      capRings: 1,
    });
    if (i % 4 === 0) {
      addTube(coarse, {
        rings: 4,
        sides: 6,
        lengthMetres: sheafLength * stops,
        pathAt: path,
        radiusAt: (t) => thin * (1 - 0.55 * t),
        surfaceAt: (t) => ({ radial: 1, tone: tone(t) }),
      });
    }
  }
  const bindReach = sheafRadius * WAIST_PINCH * 1.02;
  for (let band = 0; band < 1; band++) {
    addTube(fine, {
      rings: 90,
      sides: 7,
      lengthMetres: 0.3,
      pathAt: (t) => {
        const turn = t * Math.PI * 2 * 3.0;
        const drift = (t - 0.5) * 0.012 + band * 0.006;
        const reach = bindReach + 0.0012 * Math.sin(turn * 1.5 + band);
        return [waist + drift + 0.0012 * Math.sin(turn * 3), Math.cos(turn + band) * reach, Math.sin(turn + band) * reach];
      },
      radiusAt: () => 0.0009,
      surfaceAt: (_t, angle, along) => ({ radial: 1 + 0.1 * Math.sin(angle * 3 + along * 300), tone: shadeTone(BINDING_FIBRE, 0.86 + 0.26 * noise3(along * 120, angle, seed)) }),
      capStart: () => ({ lift: 0, tone: BINDING_FIBRE }),
      capEnd: () => ({ lift: 0, tone: BINDING_FIBRE }),
      capRings: 1,
    });
  }
  const geometry = fine.build();
  const centres: Point[] = [];
  const count = 8;
  for (let i = 0; i <= count; i++) centres.push([-sheafLength / 2 + (i / count) * sheafLength, 0, 0]);
  return { geometry, buried: coarse.build(), spheres: coverWithSpheres(geometry, centres) };
}
