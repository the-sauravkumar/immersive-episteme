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
    seed: seed * 3.7,
  };
}

export function camelPellet(seed: number, length: number, ratio: number, seamed: boolean): PieceVariant {
  const shape = pelletShape(seed, length, ratio, seamed);
  const surface = (x: number, y: number, z: number) => pelletPoint(shape, x, y, z);
  const fine = new PieceMesh();
  addBody(fine, FINE_DETAIL, surface);
  for (let f = 0; f < 5; f++) fibreOnSkin(fine, surface, seed * 37 + f, 0.05 + f * 0.012, 0.00022 + f * 0.00004);
  const coarse = new PieceMesh();
  addBody(coarse, COARSE_DETAIL, surface);
  const geometry = fine.build();
  const thickness = (shape.halfLength / shape.ratio) * 2 * (1 - shape.taper * 0.5);
  return { geometry, buried: coarse.build(), spheres: surfaceCover(geometry, thickness * 0.75, thickness * 0.38) };
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

export function camelCluster(seed: number, spread: number, lobes: number): PieceVariant {
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
  const geometry = fine.build();
  return { geometry, buried: coarse.build(), spheres: surfaceCover(geometry, spread * 0.8, spread * 0.4) };
}

export function dungLump(seed: number, size: number): PieceVariant {
  const random = seededRandom(seed * 773 + 29);
  const bumps = Array.from({ length: 4 + Math.floor(random() * 3) }, () => {
    const theta = random() * Math.PI * 2;
    const rise = random() * 2 - 1;
    const flat = Math.sqrt(1 - rise * rise);
    return { x: Math.cos(theta) * flat, y: rise, z: Math.sin(theta) * flat, height: 0.14 + random() * 0.2, width: 0.32 + random() * 0.3 };
  });
  const cells = Array.from({ length: 16 }, () => {
    const theta = random() * Math.PI * 2;
    const rise = random() * 2 - 1;
    const flat = Math.sqrt(1 - rise * rise);
    return [Math.cos(theta) * flat, rise, Math.sin(theta) * flat] as const;
  });
  const stretch: Point = [size * (0.56 + random() * 0.14), size * (0.34 + random() * 0.1), size * (0.48 + random() * 0.12)];
  const surface = (dx: number, dy: number, dz: number): BodyPoint => {
    const warp = 0.13 * layered(dx, dy, dz, 3, seed);
    const wx = dx + warp;
    const wy = dy - warp;
    const wz = dz + warp * 0.6;
    let nearest = 9;
    let next = 9;
    for (const cell of cells) {
      const distance = Math.hypot(wx - cell[0], wy - cell[1], wz - cell[2]);
      if (distance < nearest) {
        next = nearest;
        nearest = distance;
      } else if (distance < next) next = distance;
    }
    const edge = next - nearest;
    const crack = 1 - smoothstep(0.012, 0.06, edge);
    let swell = 1;
    for (const bump of bumps) swell += bump.height * Math.exp(-(((dx - bump.x) ** 2 + (dy - bump.y) ** 2 + (dz - bump.z) ** 2) / (bump.width * bump.width)));
    const pitted = 0.035 * layered(dx, dy, dz, 5.5, seed + 1) + 0.016 * layered(dx, dy, dz, 15, seed + 2);
    const reach = swell + pitted - crack * 0.075;
    return { point: [dx * reach * stretch[0], dy * reach * stretch[1], dz * reach * stretch[2]], tone: shadeTone(PLAIN, 1 - 0.68 * crack * crack) };
  };
  const fine = new PieceMesh();
  addBody(fine, 26, surface);
  const coarse = new PieceMesh();
  addBody(coarse, 6, surface);
  const geometry = fine.build();
  return { geometry, buried: coarse.build(), spheres: surfaceCover(geometry, stretch[1] * 1.6, stretch[1] * 0.8) };
}

export function dungCake(seed: number, diameter: number, thickness: number): PieceVariant {
  const random = seededRandom(seed * 113 + 41);
  const radius = diameter / 2;
  const heading = random() * Math.PI;
  const ridges = 6 + Math.floor(random() * 5);
  const height = (x: number, z: number, edge: number): number => {
    const across = (x * Math.cos(heading) + z * Math.sin(heading)) / radius;
    const along = (-x * Math.sin(heading) + z * Math.cos(heading)) / radius;
    const bent = across + 0.1 * noise3(along * 2.5 + seed, across * 2.5, seed);
    const ridge = Math.sin(bent * ridges * Math.PI) * 0.12 + 0.05 * layered(x * 30, z * 30, 0, 1, seed);
    return thickness * ((1 - edge * edge) * 0.5 + 0.5) * (0.45 + ridge * (1 - edge));
  };
  const build = (rings: number, spokes: number, straws: number): PieceMesh => {
    const mesh = new PieceMesh();
    const outline = (angle: number) => radius * (0.92 + 0.07 * noise3(Math.cos(angle) * 2 + seed, Math.sin(angle) * 2, seed) + 0.03 * noise3(Math.cos(angle) * 9, Math.sin(angle) * 9 + seed, 0));
    const place = (ring: number, spoke: number, under: boolean): number => {
      const t = ring / rings;
      const angle = (spoke / spokes) * Math.PI * 2;
      const reach = outline(angle) * t;
      const x = Math.cos(angle) * reach;
      const z = Math.sin(angle) * reach;
      const y = height(x, z, t) * (under ? -0.7 : 1);
      return mesh.vertex([x, y, z], shadeTone(PLAIN, under ? 0.7 : 1 - 0.3 * smoothstep(0.92, 1, t)), x, z);
    };
    const topCentre = mesh.vertex([0, height(0, 0, 0), 0], PLAIN);
    const underCentre = mesh.vertex([0, -height(0, 0, 0) * 0.7, 0], shadeTone(PLAIN, 0.7));
    const top: number[] = [];
    const under: number[] = [];
    for (let ring = 1; ring <= rings; ring++) {
      for (let spoke = 0; spoke < spokes; spoke++) {
        top.push(place(ring, spoke, false));
        under.push(ring === rings ? top[top.length - 1]! : place(ring, spoke, true));
      }
    }
    const at = (list: number[], ring: number, spoke: number) => list[(ring - 1) * spokes + (spoke % spokes)]!;
    for (let spoke = 0; spoke < spokes; spoke++) {
      mesh.triangle(topCentre, at(top, 1, spoke + 1), at(top, 1, spoke));
      mesh.triangle(underCentre, at(under, 1, spoke), at(under, 1, spoke + 1));
      for (let ring = 1; ring < rings; ring++) {
        mesh.quad(at(top, ring, spoke), at(top, ring, spoke + 1), at(top, ring + 1, spoke + 1), at(top, ring + 1, spoke));
        mesh.quad(at(under, ring, spoke), at(under, ring + 1, spoke), at(under, ring + 1, spoke + 1), at(under, ring, spoke + 1));
      }
    }
    for (let s = 0; s < straws; s++) {
      const angle = random() * Math.PI * 2;
      const off = Math.sqrt(random()) * radius * 0.8;
      const turn = random() * Math.PI * 2;
      const span = 0.012 + random() * 0.02;
      const bx = Math.cos(angle) * off;
      const bz = Math.sin(angle) * off;
      addTube(mesh, {
        rings: 6,
        sides: 5,
        lengthMetres: span,
        pathAt: (t) => {
          const x = bx + Math.cos(turn) * span * (t - 0.5);
          const z = bz + Math.sin(turn) * span * (t - 0.5);
          return [x, height(x, z, Math.min(1, Math.hypot(x, z) / radius)) + 0.0006, z];
        },
        radiusAt: () => 0.0005,
        surfaceAt: () => ({ radial: 1, tone: STRAW }),
      });
    }
    return mesh;
  };
  const geometry = build(36, 120, 34).build();
  return { geometry, buried: build(8, 18, 0).build(), spheres: surfaceCover(geometry, thickness * 1.2, thickness * 0.6) };
}
