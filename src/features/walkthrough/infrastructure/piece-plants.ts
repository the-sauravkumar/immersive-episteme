import { seededRandom } from "../domain/pile-packing";
import { addTube, coverWithSpheres, layered, mixTone, noise3, PieceMesh, PLAIN, shadeTone, smoothstep, surfaceCover, type PieceVariant, type Point, type Tone } from "./piece-mesh";

const PAPERY_STRAW: Tone = [1.32, 1.28, 1.05];
const RUST_FOLD: Tone = [0.72, 0.58, 0.5];
const PALE_MIDRIB: Tone = [1.42, 1.3, 1.02];
const DARK_BLOTCH: Tone = [0.52, 0.44, 0.38];

export function driedFlake(seed: number, length: number): PieceVariant {
  const random = seededRandom(seed * 313 + 11);
  const width = length * (0.2 + random() * 0.16);
  const curl = width * (0.18 + random() * 0.26);
  const camber = length * (0.04 + random() * 0.1);
  const twist = (random() - 0.5) * 0.9;
  const build = (along: number, across: number): PieceMesh => {
    const mesh = new PieceMesh();
    const grid: number[] = [];
    for (let u = 0; u <= along; u++) {
      const t = u / along;
      const half = (width / 2) * Math.sin(Math.PI * t ** 0.86) ** 0.72;
      for (let v = 0; v <= across; v++) {
        const s = (v / across) * 2 - 1;
        const x = (t - 0.5) * length;
        const raw = s * half;
        const turn = twist * (t - 0.5);
        const y = camber * Math.sin(Math.PI * t) + curl * s * s - raw * Math.sin(turn);
        const z = raw * Math.cos(turn);
        const tone = shadeTone(mixTone(PLAIN, RUST_FOLD, Math.exp(-((s / 0.26) ** 2)) * 0.3), 0.9 + 0.22 * noise3(t * 7 + seed, s * 2, seed));
        grid.push(mesh.vertex([x, y, z], tone, raw, t * length));
      }
    }
    for (let u = 0; u < along; u++) {
      for (let v = 0; v < across; v++) {
        const a = grid[u * (across + 1) + v]!;
        const b = grid[(u + 1) * (across + 1) + v]!;
        mesh.quad(a, a + 1, b + 1, b);
      }
    }
    return mesh;
  };
  const geometry = build(10, 4).build();
  const centres: Point[] = [];
  const count = Math.max(3, Math.round(length / (width * 0.8)));
  for (let i = 0; i < count; i++) centres.push([((i + 0.5) / count - 0.5) * length, camber * Math.sin(Math.PI * ((i + 0.5) / count)) + curl * 0.3, 0]);
  return { geometry, buried: build(6, 3).build(), spheres: coverWithSpheres(geometry, centres) };
}

export function driedCalyx(seed: number, length: number): PieceVariant {
  const random = seededRandom(seed * 677 + 13);
  const bodyRadius = length * (0.1 + random() * 0.05);
  const stalk = length * (0.14 + random() * 0.14);
  const bow = length * (0.03 + random() * 0.09);
  const teeth = 5 + Math.floor(random() * 2);
  const phase = random() * Math.PI * 2;
  const path = (t: number): Point => [(t - 0.5) * length, bow * Math.sin(Math.PI * t), 0.3 * bow * Math.sin(Math.PI * t * 1.4 + phase)];
  const radiusAt = (t: number): number => {
    const neck = stalk / length;
    if (t < neck) return bodyRadius * 0.24;
    const grown = (t - neck) / (1 - neck);
    return bodyRadius * (0.3 + 0.7 * Math.min(1, grown * 2.6) ** 0.7) * (1 + 0.16 * smoothstep(0.75, 1, grown));
  };
  const surfaceAt = (t: number, angle: number) => {
    const neck = stalk / length;
    const grown = Math.max(0, (t - neck) / (1 - neck));
    const ridge = Math.cos(angle * teeth + phase);
    const torn = grown > 0.8 ? 1 - 0.34 * smoothstep(0.8, 1, grown) * (0.5 - 0.5 * Math.cos(angle * teeth * 2 + phase)) : 1;
    const tone = mixTone(shadeTone(PLAIN, 0.84 + 0.12 * ridge), PAPERY_STRAW, smoothstep(0.34, 0.66, noise3(Math.cos(angle) * 1.6 + seed, t * 3.5, Math.sin(angle) * 1.6)) * 0.85 + smoothstep(0.74, 1, grown) * 0.5);
    return { radial: (1 + 0.1 * ridge) * torn, tone };
  };
  const build = (rings: number, sides: number): PieceMesh => {
    const mesh = new PieceMesh();
    addTube(mesh, { rings, sides, lengthMetres: length, pathAt: path, radiusAt, surfaceAt, capStart: () => ({ lift: 0, tone: shadeTone(PLAIN, 0.8) }), capEnd: () => ({ lift: -length * 0.14, tone: shadeTone(RUST_FOLD, 0.6) }), capRings: 1 });
    return mesh;
  };
  const geometry = build(10, 7).build();
  const centres: Point[] = [path(0.12), path(0.32), path(0.5), path(0.68), path(0.86)];
  return { geometry, buried: build(6, 7).build(), spheres: coverWithSpheres(geometry, centres) };
}

export function dryLeaf(seed: number, length: number, breadth: number): PieceVariant {
  const random = seededRandom(seed * 313 + 11);
  const stalkShare = 0.07 + random() * 0.04;
  const tipShare = 0.84 + random() * 0.05;
  const fold = 0.002 + random() * 0.007;
  const camber = 0.004 + random() * 0.012;
  const wave = 0.0012 + random() * 0.0028;
  const phase = random() * Math.PI * 2;
  const blotchAt = random() < 0.4 ? { t: 0.3 + random() * 0.4, s: (random() - 0.5) * 1.2 } : null;
  const halfAt = (t: number): number => {
    if (t <= stalkShare) return 0.0009;
    const blade = (t - stalkShare) / (1 - stalkShare);
    const body = blade < tipShare ? Math.sin((Math.PI * Math.min(blade, tipShare)) / (tipShare * 1.06)) ** 0.72 : 0;
    const taper = blade >= tipShare ? 0.26 * (1 - (blade - tipShare) / (1 - tipShare)) ** 1.1 : Math.max(0, 0);
    return Math.max(0.0007, (breadth / 2) * Math.max(body, taper));
  };
  const build = (along: number, across: number): PieceMesh => {
    const mesh = new PieceMesh();
    const grid: number[] = [];
    for (let u = 0; u <= along; u++) {
      const t = u / along;
      const half = halfAt(t);
      for (let v = 0; v <= across; v++) {
        const s = (v / across) * 2 - 1;
        const x = (t - 0.5) * length;
        const z = s * half;
        const side = Math.abs(s);
        const y = camber * Math.sin(Math.PI * t) + fold * side * (half / (breadth / 2)) + wave * side * Math.sin(t * 19 + phase + (s > 0 ? 0 : 1.7));
        const midrib = Math.exp(-((z / 0.0012) ** 2));
        const veinPhase = t * 34 - side * 3.2;
        const vein = Math.exp(-((((veinPhase % 1) - 0.5) / 0.1) ** 2)) * (1 - side * 0.5);
        let tone = mixTone(PLAIN, PALE_MIDRIB, midrib * 0.85 + vein * 0.07);
        tone = shadeTone(tone, 0.9 + 0.2 * layered(t * 3, s, seed, 2.2, seed));
        if (blotchAt) tone = mixTone(tone, DARK_BLOTCH, smoothstep(0.32, 0.14, Math.hypot(t - blotchAt.t, (s - blotchAt.s) * 0.3)));
        grid.push(mesh.vertex([x, y, z], tone, z, t * length));
      }
    }
    for (let u = 0; u < along; u++) {
      for (let v = 0; v < across; v++) {
        const a = grid[u * (across + 1) + v]!;
        const b = grid[(u + 1) * (across + 1) + v]!;
        mesh.quad(a, a + 1, b + 1, b);
      }
    }
    return mesh;
  };
  const geometry = build(52, 18).build();
  return { geometry, buried: build(24, 8).build(), spheres: surfaceCover(geometry, 0.0055, 0) };
}
