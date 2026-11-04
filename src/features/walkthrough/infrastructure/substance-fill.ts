import * as THREE from "three";
import { liquidMarks, type SubstanceLook } from "@/features/process/domain/substance-look";
import { fittedSurface, flatLevel, levelInVessel, moundHeight, pasteHeight, type SurfaceGrid } from "../domain/fill-surface";
import { packingSteps, seededRandom, rotateYXZ, type PlacedPiece } from "../domain/pile-packing";
import type { FillAudit, CheckedSphere } from "../domain/scene-check";
import { measuringSteps, outsideDepth, wallRadius, widestWallRadius, type VesselProfile } from "../domain/vessel-profile";
import type { MaterialLibrary } from "./material-library";
import { isPileFill, pileRecipe, type PileFill, type PileRecipe } from "./fill-pieces";
import { softBox } from "./solid-builders";
import { bubbleMaterial, copperScumMaterial, crystalMaterial, liquidMaterial, substanceMaterial } from "./substance-materials";

const LIQUID_FRACTION = 0.76;
const PASTE_FRACTION = 0.66;
const POWDER_FRACTION = 0.5;
const POWDER_HEAP_FRACTION = 0.42;
const CLEAR_OF_LOW_RIM = 0.01;
const FOLDED_PILES = 3;
const FOLDED_GAP = 0.012;

const MOST_MS_BEFORE_YIELDING = 5;

async function runGradually<T>(steps: Generator<void, T>): Promise<T> {
  let started = performance.now();
  let step = steps.next();
  while (!step.done) {
    if (performance.now() - started > MOST_MS_BEFORE_YIELDING) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      started = performance.now();
    }
    step = steps.next();
  }
  return step.value;
}

export function measureObjectProfile(object: THREE.Object3D): Promise<VesselProfile> {
  object.updateWorldMatrix(true, true);
  const corners: number[] = [];
  const point = new THREE.Vector3();
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry as THREE.BufferGeometry;
    const position = geometry.attributes.position!;
    const count = geometry.index ? geometry.index.count : position.count;
    for (let i = 0; i < count; i++) {
      point.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i) : i).applyMatrix4(node.matrixWorld);
      corners.push(point.x, point.y, point.z);
    }
  });
  return runGradually(measuringSteps(Float32Array.from(corners)));
}

function gridGeometry(grid: SurfaceGrid): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(grid.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(grid.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function rippleNormals(geometry: THREE.BufferGeometry, height: number): void {
  const position = geometry.attributes.position!;
  const normal = geometry.attributes.normal!;
  const n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const dx = height * (Math.cos(x * 11 + z * 4 + 1.2) * 11 + Math.cos(x * 27 - z * 19) * 13);
    const dz = height * (Math.cos(x * 11 + z * 4 + 1.2) * 4 - Math.cos(x * 27 - z * 19) * 9 + Math.cos(z * 37 + 2) * 12);
    n.set(-dx, 1, -dz).normalize();
    normal.setXYZ(i, n.x, n.y, n.z);
  }
}

function stillMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function surfaceAudit(name: string, profile: VesselProfile, geometry: THREE.BufferGeometry): FillAudit {
  return { name, points: geometry.attributes.position!.array as Float32Array, outsideDepth: ([x, y, z]) => outsideDepth(profile, x, y, z), pieces: [] };
}

const kept = (library: MaterialLibrary, geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  library.keep(geometry);
  return geometry;
};

export interface BubbleArea {
  readonly reach: (theta: number) => number;
  readonly count: number;
  readonly smallest: number;
  readonly largest: number;
}

export async function addBubbles(library: MaterialLibrary, parent: THREE.Object3D, level: number, area: BubbleArea): Promise<void> {
  const dome = await library.shared("bubble-dome", async () => new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const material = await bubbleMaterial(library);
  const random = seededRandom(area.count * 31 + 7);
  const placed: { x: number; z: number; r: number }[] = [];
  for (let tries = 0; tries < area.count * 8 && placed.length < area.count; tries++) {
    const theta = random() * Math.PI * 2;
    const reach = area.reach(theta) * Math.sqrt(random()) * 0.94;
    const r = area.smallest + (area.largest - area.smallest) * random() ** 3;
    const x = Math.cos(theta) * reach;
    const z = Math.sin(theta) * reach;
    if (Math.hypot(x, z) + r > area.reach(theta) * 0.97) continue;
    if (placed.some((other) => Math.hypot(other.x - x, other.z - z) < other.r + r)) continue;
    placed.push({ x, z, r });
  }
  const bubbles = new THREE.InstancedMesh(dome, material, placed.length);
  const holder = new THREE.Object3D();
  placed.forEach(({ x, z, r }, i) => {
    holder.position.set(x, level, z);
    holder.scale.setScalar(r);
    holder.updateMatrix();
    bubbles.setMatrixAt(i, holder.matrix);
  });
  parent.add(bubbles);
}

async function addLiquid(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, profile: VesselProfile, name: string): Promise<FillAudit> {
  const level = levelInVessel(profile, LIQUID_FRACTION);
  const geometry = await library.shared(`surface:liquid:${scanId}`, async () => {
    const built = gridGeometry(fittedSurface(profile, level, 32, 192, flatLevel(level)));
    rippleNormals(built, 0.00012);
    return built;
  });
  parent.add(stillMesh(geometry, await liquidMaterial(library, look)));
  const marks = liquidMarks(look);
  if (marks.bubbles) await addBubbles(library, parent, level, { reach: (theta) => wallRadius(profile, theta, level), count: 620, smallest: 0.001, largest: 0.0042 });
  return surfaceAudit(name, profile, geometry);
}

async function addPaste(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, profile: VesselProfile, name: string): Promise<FillAudit> {
  const level = levelInVessel(profile, PASTE_FRACTION);
  const depth = profile.rimY - profile.floorY;
  const geometry = await library.shared(`surface:paste:${scanId}`, async () => gridGeometry(fittedSurface(profile, level, 56, 224, pasteHeight(level, depth))));
  parent.add(stillMesh(geometry, await substanceMaterial(library, look)));
  return surfaceAudit(name, profile, geometry);
}

async function addPowder(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, profile: VesselProfile, name: string): Promise<FillAudit> {
  const level = levelInVessel(profile, POWDER_FRACTION);
  const depth = profile.rimY - profile.floorY;
  const heap = depth * POWDER_HEAP_FRACTION;
  const geometry = await library.shared(`surface:powder:${scanId}`, async () => gridGeometry(fittedSurface(profile, level, 72, 256, moundHeight(level, heap, depth * 0.012))));
  const mound = stillMesh(geometry, await substanceMaterial(library, look));
  mound.castShadow = true;
  parent.add(mound);
  return surfaceAudit(name, profile, geometry);
}

interface PackedPile {
  readonly recipe: PileRecipe;
  readonly placed: readonly PlacedPiece[];
}

function packedPile(library: MaterialLibrary, scanId: string, fill: PileFill, profile: VesselProfile): Promise<PackedPile> {
  return library.shared(`pile:${scanId}:${fill}`, async () => {
    const recipe = await library.shared(`recipe:${fill}`, async () => {
      const built = await pileRecipe(fill);
      for (const variant of built.variants) kept(library, variant.geometry);
      return built;
    });
    const placed = await runGradually(packingSteps(profile, recipe.blueprints, {
      seed: recipe.seed,
      candidates: recipe.candidates,
      maxTilt: recipe.maxTilt,
      anyTumble: recipe.anyTumble,
      topY: profile.rimY - CLEAR_OF_LOW_RIM,
      margin: 0.004,
      fillRadius: widestWallRadius(profile, profile.rimY),
    }));
    return { recipe, placed };
  });
}

async function addPile(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, fill: PileFill, look: SubstanceLook, profile: VesselProfile, name: string): Promise<FillAudit> {
  const { recipe, placed } = await packedPile(library, scanId, fill, profile);
  const material = fill === "crystals" ? await crystalMaterial(library, look) : await substanceMaterial(library, look);
  if (fill === "leaves") material.side = THREE.DoubleSide;
  const holder = new THREE.Object3D();
  holder.rotation.order = "YXZ";
  const points: number[] = [];
  const pieces: CheckedSphere[][] = [];
  const vertex = new THREE.Vector3();
  recipe.variants.forEach((variant, index) => {
    const own = placed.filter((piece) => piece.variant === index);
    if (own.length === 0) return;
    const mesh = new THREE.InstancedMesh(variant.geometry, material, own.length);
    const position = variant.geometry.attributes.position!;
    own.forEach((piece, i) => {
      holder.position.set(piece.x, piece.y, piece.z);
      holder.rotation.set(piece.pitch, piece.yaw, piece.roll);
      holder.scale.setScalar(piece.scale);
      holder.updateMatrix();
      mesh.setMatrixAt(i, holder.matrix);
      for (let k = 0; k < position.count; k += 3) {
        vertex.fromBufferAttribute(position, k).applyMatrix4(holder.matrix);
        points.push(vertex.x, vertex.y, vertex.z);
      }
      pieces.push(variant.spheres.map((sphere) => {
        const [x, y, z] = rotateYXZ(sphere.x * piece.scale, sphere.y * piece.scale, sphere.z * piece.scale, piece.yaw, piece.pitch, piece.roll);
        return { x: x + piece.x, y: y + piece.y, z: z + piece.z, r: sphere.r * piece.scale };
      }));
    });
    mesh.castShadow = fill !== "crystals" || look.transparency !== "clear";
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
  return { name, points: Float32Array.from(points), outsideDepth: ([x, y, z]) => outsideDepth(profile, x, y, z), pieces };
}

function foldSlab(geometry: THREE.BufferGeometry, seed: number): void {
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, position.getY(i) + 0.0022 * Math.sin(x * 23 + seed * 1.7) * Math.sin(z * 17 - seed) + 0.0009 * Math.sin(x * 71 + z * 13 + seed));
  }
  geometry.computeVertexNormals();
}

async function addFoldedCloth(library: MaterialLibrary, parent: THREE.Object3D, look: SubstanceLook, profile: VesselProfile, name: string): Promise<FillAudit> {
  const material = await substanceMaterial(library, look);
  const midHeight = profile.floorY + (profile.rimY - profile.floorY) * 0.6;
  const halfX = wallRadius(profile, 0, midHeight) - 0.012;
  const halfZ = wallRadius(profile, Math.PI / 2, midHeight) - 0.012;
  const reach = Math.min(wallRadius(profile, Math.atan2(halfZ, halfX), midHeight) - 0.006, Math.hypot(halfX, halfZ)) / Math.hypot(halfX, halfZ);
  const sizeX = halfX * reach * 2;
  const sizeZ = halfZ * reach * 2;
  const longOnX = sizeX > sizeZ;
  const piles = FOLDED_PILES;
  const pileLong = (Math.max(sizeX, sizeZ) - FOLDED_GAP * (piles - 1)) / piles;
  const pileShort = Math.min(sizeX, sizeZ);
  const points: number[] = [];
  for (let pile = 0; pile < piles; pile++) {
    const along = -Math.max(sizeX, sizeZ) / 2 + pileLong / 2 + pile * (pileLong + FOLDED_GAP);
    const layers = 5 + ((pile * 2) % 3);
    for (let layer = 0; layer < layers; layer++) {
      const trimLong = pileLong - 0.008 * ((layer + pile) % 3);
      const trimShort = pileShort - 0.01 * ((layer + 1) % 2) - 0.006 * (layer % 3);
      const y = profile.floorY + 0.016 + layer * 0.03;
      const x = longOnX ? along : 0;
      const z = longOnX ? 0 : along;
      const sx = longOnX ? trimLong : trimShort;
      const sz = longOnX ? trimShort : trimLong;
      const slab = softBox(parent, [sx, 0.027, sz], material, [x, y, z], { radius: 0.0125, segments: 28, tile: [1, 1] });
      foldSlab(slab.geometry, pile * 3 + layer);
      for (const a of [-1, 1]) for (const b of [-1, 1]) points.push(x + (a * sx) / 2, y, z + (b * sz) / 2);
    }
  }
  return { name, points: Float32Array.from(points), outsideDepth: ([x, y, z]) => outsideDepth(profile, x, y, z), pieces: [] };
}

export async function fillVessel(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, profile: VesselProfile, name: string): Promise<FillAudit> {
  if (look.fill === "liquid") return addLiquid(library, parent, scanId, look, profile, name);
  if (look.fill === "paste") return addPaste(library, parent, scanId, look, profile, name);
  if (look.fill === "powder") return addPowder(library, parent, scanId, look, profile, name);
  if (look.fill === "cloth") return addFoldedCloth(library, parent, look, profile, name);
  if (isPileFill(look.fill)) return addPile(library, parent, scanId, look.fill, look, profile, name);
  throw new Error(`No fill for ${look.key}`);
}

export async function addScum(library: MaterialLibrary, parent: THREE.Object3D, surface: THREE.BufferGeometry, level: number): Promise<void> {
  const scan = await library.scan("dryMud");
  const geometry = surface.clone();
  const position = geometry.attributes.position!;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / scan.tileMetres;
    uv[i * 2 + 1] = position.getZ(i) / scan.tileMetres;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const scum = new THREE.Mesh(geometry, await copperScumMaterial(library));
  scum.position.y = level + 0.0015;
  scum.receiveShadow = true;
  parent.add(scum);
}
