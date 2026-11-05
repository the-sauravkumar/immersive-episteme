import * as THREE from "three";
import type { SubstanceLook } from "@/features/process/domain/substance-look";
import { creasedNormals } from "./creased-normals";
import { noteSurface, type MaterialLibrary } from "./material-library";
import { projectedMaterial, solidMesh } from "./built-materials";
import { displayAlbedo, projectScan } from "./substance-materials";

const WIDTH = 0.58;
const WALL = 0.018;
const RIM_HEIGHT = 0.072;
const FLOOR_THICKNESS = 0.012;
const CORNER = 0.012;
const PAD_CLEARANCE_METRES = 0.0007;
const UNLOADED_HEX = "#9A8F78";
const PAD_COLUMNS = 128;
const PAD_ROWS = 96;
const HUMP_X = -0.11;
const HUMP_Z = 0.07;
const HUMP_REACH_X = 0.12;
const HUMP_REACH_Z = 0.075;
const LOOPED_LOOK = { tileMetres: 0.085, normalScale: 2.2, contrast: 0.5, roughness: 0.96, loadedLeastRough: 0.62, specular: 0.4 } as const;
const UNDER_LOOK = { tileMetres: 0.11, normalScale: 1.6, contrast: 0.6, roughness: 0.96, loadedLeastRough: 0.7, specular: 0.3 } as const;

const TRAY_WOOD = { key: "tray timber", scan: "table", hex: "#3A2A21", contrast: 0.9, leastRough: 0.5, normalScale: 1, specular: 0.55 } as const;

type HeightField = (x: number, z: number) => number;

const RUMPLE_WAVES: readonly (readonly [number, number, number])[] = [[13.1, 7.3, 0.34], [-9.7, 17.9, 0.26], [27.3, -13.7, 0.18], [-37.1, -29.3, 0.12], [61.7, 43.9, 0.06], [-83.3, 71.1, 0.04]];

const ripple = (x: number, z: number, scale: number, phase: number): number => RUMPLE_WAVES.reduce((sum, [kx, kz, weight], i) => sum + weight * Math.sin(((kx * x + kz * z) * scale) / 26 + phase * (i + 1.3)), 0);

const smooth = (low: number, high: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function roundedRect(path: THREE.Path, halfX: number, halfZ: number, radius: number): void {
  path.moveTo(-halfX + radius, -halfZ);
  path.lineTo(halfX - radius, -halfZ);
  path.absarc(halfX - radius, -halfZ + radius, radius, -Math.PI / 2, 0, false);
  path.lineTo(halfX, halfZ - radius);
  path.absarc(halfX - radius, halfZ - radius, radius, 0, Math.PI / 2, false);
  path.lineTo(-halfX + radius, halfZ);
  path.absarc(-halfX + radius, halfZ - radius, radius, Math.PI / 2, Math.PI, false);
  path.lineTo(-halfX, -halfZ + radius);
  path.absarc(-halfX + radius, -halfZ + radius, radius, Math.PI, Math.PI * 1.5, false);
}

function trayShell(depth: number): THREE.BufferGeometry {
  const outer = new THREE.Shape();
  roundedRect(outer, WIDTH / 2, depth / 2, CORNER);
  const inner = new THREE.Path();
  roundedRect(inner, WIDTH / 2 - WALL, depth / 2 - WALL, CORNER / 2);
  outer.holes.push(inner);
  const walls = new THREE.ExtrudeGeometry(outer, { depth: RIM_HEIGHT - 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelOffset: -0.0015, bevelSegments: 2, curveSegments: 8 });
  walls.rotateX(-Math.PI / 2);
  walls.translate(0, 0.0015, 0);
  return creasedNormals(walls, 0.7);
}

function trayFloor(depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  roundedRect(shape, WIDTH / 2 - WALL + 0.0004, depth / 2 - WALL + 0.0004, CORNER / 2);
  const floor = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_THICKNESS, bevelEnabled: false, curveSegments: 8 });
  floor.rotateX(-Math.PI / 2);
  return floor;
}

interface PadLayer {
  readonly halfX: number;
  readonly halfZ: number;
  readonly edgeWander: number;
  readonly thickness: number;
  readonly swell: number;
  readonly phase: number;
  readonly edgeTone: number;
  readonly soakedShare: number;
  readonly centreTone: number;
  readonly hump: number;
}

const wanderAt = (angle: number, phase: number): number => 0.5 + 0.28 * Math.sin(angle * 3 + phase) + 0.14 * Math.sin(angle * 7 - phase * 1.7) + 0.08 * Math.sin(angle * 17 + phase * 2.3);

function insideRoundedCorner(x: number, z: number, halfX: number, halfZ: number): [number, number] {
  const radius = CORNER / 2;
  const fromX = Math.abs(x) - (halfX - radius);
  const fromZ = Math.abs(z) - (halfZ - radius);
  if (fromX <= 0 || fromZ <= 0) return [x, z];
  const reach = Math.hypot(fromX, fromZ);
  if (reach <= radius) return [x, z];
  const pull = radius / reach;
  return [Math.sign(x) * (halfX - radius + fromX * pull), Math.sign(z) * (halfZ - radius + fromZ * pull)];
}

function padGeometry(layer: PadLayer, below: HeightField): { geometry: THREE.BufferGeometry; top: HeightField } {
  const edgeOf = (x: number, z: number) => {
    const angle = Math.atan2(z / layer.halfZ, x / layer.halfX);
    const inset = layer.edgeWander * wanderAt(angle, layer.phase);
    return Math.max(Math.abs(x) / (layer.halfX - inset), Math.abs(z) / (layer.halfZ - inset));
  };
  const top: HeightField = (x, z) => {
    const q = edgeOf(x, z);
    const fall = 1 - smooth(0.93, 1, q);
    const heap = 1 + layer.swell * (0.5 + 0.5 * ripple(x, z, 26, layer.phase)) + layer.hump * Math.exp(-(((x - HUMP_X) / HUMP_REACH_X) ** 2) - ((z - HUMP_Z) / HUMP_REACH_Z) ** 2);
    return below(x, z) + 0.0007 + layer.thickness * heap * fall;
  };
  const count = (PAD_COLUMNS + 1) * (PAD_ROWS + 1);
  const positions = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  for (let row = 0; row <= PAD_ROWS; row++) {
    for (let column = 0; column <= PAD_COLUMNS; column++) {
      const s = (column / PAD_COLUMNS) * 2 - 1;
      const t = (row / PAD_ROWS) * 2 - 1;
      const angle = Math.atan2(t, s);
      const inset = layer.edgeWander * wanderAt(angle, layer.phase);
      const [x, z] = insideRoundedCorner(s * (layer.halfX - inset * Math.max(Math.abs(s), Math.abs(t)) ** 3), t * (layer.halfZ - inset * Math.max(Math.abs(s), Math.abs(t)) ** 3), layer.halfX, layer.halfZ);
      const k = row * (PAD_COLUMNS + 1) + column;
      positions.set([x, top(x, z), z], k * 3);
      const q = edgeOf(x, z);
      const reach = q + 0.05 * ripple(x, z, 19, layer.phase + 0.6);
      const soaked = smooth(1 - layer.soakedShare, 1 - layer.soakedShare * 0.45, reach);
      const tone = (layer.centreTone + 0.07 * ripple(x, z, 43, layer.phase)) * (1 - soaked) + layer.edgeTone * soaked;
      colours.set([tone, tone, tone], k * 3);
    }
  }
  const indices = new Uint32Array(PAD_COLUMNS * PAD_ROWS * 6);
  let cursor = 0;
  for (let row = 0; row < PAD_ROWS; row++) {
    for (let column = 0; column < PAD_COLUMNS; column++) {
      const a = row * (PAD_COLUMNS + 1) + column;
      const b = a + 1;
      const c = a + PAD_COLUMNS + 1;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return { geometry, top };
}

function padMaterial(library: MaterialLibrary, look: SubstanceLook | null, scanName: "flour" | "weave", surface: typeof LOOPED_LOOK | typeof UNDER_LOOK): Promise<THREE.MeshStandardMaterial> {
  return library.shared(`tray-pad:${scanName}:${look?.key ?? "unloaded"}`, async () => {
    const scan = await library.scan(scanName);
    const material = new THREE.MeshStandardMaterial({
      map: scan.colour,
      normalMap: scan.normal,
      roughnessMap: scan.roughness,
      roughness: surface.roughness,
      metalness: 0,
      color: displayAlbedo(look?.renderHex ?? UNLOADED_HEX),
      normalScale: new THREE.Vector2(surface.normalScale, surface.normalScale),
      envMapIntensity: 0.35,
      vertexColors: true,
    });
    const perMetre = 1 / surface.tileMetres;
    projectScan(material, perMetre, surface.contrast, look ? surface.loadedLeastRough : 0.82, { specular: look ? surface.specular : 0.25 });
    return noteSurface(material, { label: look ? `substance ${look.key}` : "tray pad", kind: "model", perMetre });
  });
}

export async function buildPrintingTray(library: MaterialLibrary, look: SubstanceLook | null, depth: number): Promise<THREE.Object3D> {
  const [wood, under, looped] = await Promise.all([projectedMaterial(library, TRAY_WOOD), padMaterial(library, look, "weave", UNDER_LOOK), padMaterial(library, look, "flour", LOOPED_LOOK)]);
  const { pacer } = library;
  const group = new THREE.Group();
  await pacer.yieldSlice();
  group.add(solidMesh(trayShell(depth), wood));
  await pacer.yieldSlice();
  group.add(solidMesh(trayFloor(depth), wood));
  const clearX = WIDTH / 2 - WALL - PAD_CLEARANCE_METRES;
  const clearZ = depth / 2 - WALL - PAD_CLEARANCE_METRES;
  await pacer.yieldSlice();
  const lower = padGeometry({ halfX: clearX, halfZ: clearZ, edgeWander: 0.0012, thickness: 0.0075, swell: 0.2, phase: 0.9, edgeTone: 0.34, soakedShare: 0.1, centreTone: 0.42, hump: 0.4 }, () => FLOOR_THICKNESS);
  await pacer.yieldSlice();
  const middle = padGeometry({ halfX: clearX - 0.004, halfZ: clearZ - 0.004, edgeWander: 0.009, thickness: 0.0085, swell: 0.3, phase: 2.2, edgeTone: 0.42, soakedShare: 0.12, centreTone: 0.62, hump: 0.8 }, lower.top);
  await pacer.yieldSlice();
  const upper = padGeometry({ halfX: clearX - 0.01, halfZ: clearZ - 0.012, edgeWander: 0.024, thickness: 0.006, swell: 0.75, phase: 4.1, edgeTone: 0.44, soakedShare: 0.34, centreTone: 1, hump: 1.6 }, middle.top);
  group.add(solidMesh(lower.geometry, under), solidMesh(middle.geometry, under), solidMesh(upper.geometry, looped));
  return group;
}
