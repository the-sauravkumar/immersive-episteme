import * as THREE from "three";
import type { SubstanceLook } from "@/features/process/domain/substance-look";
import { fittedSurface, flatLevel, levelInVessel, moundHeight, pasteHeight, type SurfaceGrid } from "../domain/fill-surface";
import { packingSteps, rotateYXZ, type PlacedPiece } from "../domain/pile-packing";
import { makeVesselProbe, vertexOutsideVessel, VESSEL_TUCK_METRES, type VesselProbe } from "../domain/mesh-probe";
import type { FillAudit, CheckedSphere } from "../domain/scene-check";
import { measuringSteps, wallRadius, widestWallRadius, type VesselProfile } from "../domain/vessel-profile";
import type { MaterialLibrary } from "./material-library";
import { isPileFill, pileRecipe, type PileFill, type PileRecipe } from "./fill-pieces";
import { softBox } from "./solid-builders";
import { crystalMaterial, liquidMaterial, pileBedMaterial, substanceMaterial } from "./substance-materials";

const LIQUID_FRACTION = 0.76;
const PASTE_FRACTION = 0.54;
const POWDER_FRACTION = 0.5;
const POWDER_HEAP_FRACTION = 0.42;
const CLEAR_OF_LOW_RIM = 0.01;
const PILE_BED_FRACTION = 0.34;
const PILE_BED_GRAIN = 0.012;
const PILE_BED_INSET_METRES = -0.006;
const REST_ABOVE_BED_METRES = 0.0015;
const FOLDED_PILES = 3;
const FOLDED_GAP = 0.012;
const FOLD_THICKNESS = 0.013;
const FOLD_PITCH = 0.0148;
const FOLD_RADIUS = 0.0055;
const COLUMN_SEARCH_STEPS = 14;

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

export function trianglesOf(objects: readonly THREE.Object3D[], origin: THREE.Vector3 = new THREE.Vector3()): Float32Array {
  const corners: number[] = [];
  const point = new THREE.Vector3();
  for (const object of objects) {
    object.updateWorldMatrix(true, true);
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const geometry = node.geometry as THREE.BufferGeometry;
      const position = geometry.attributes.position!;
      const count = geometry.index ? geometry.index.count : position.count;
      for (let i = 0; i < count; i++) {
        point.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i) : i).applyMatrix4(node.matrixWorld).sub(origin);
        corners.push(point.x, point.y, point.z);
      }
    });
  }
  return Float32Array.from(corners);
}

export interface MeasuredVessel {
  readonly profile: VesselProfile;
  readonly triangles: Float32Array;
  probe: VesselProbe | null;
}

export async function measureObject(object: THREE.Object3D): Promise<MeasuredVessel> {
  const triangles = trianglesOf([object]);
  return { profile: await runGradually(measuringSteps(triangles)), triangles, probe: null };
}

function outsideTest(measured: MeasuredVessel): FillAudit["vertexOutside"] {
  return (point) => {
    measured.probe ??= makeVesselProbe(measured.triangles, 0, 0, measured.profile.rimY, measured.profile.floorY);
    return vertexOutsideVessel(measured.probe, point, VESSEL_TUCK_METRES);
  };
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

const NO_PIECES = (): readonly (readonly CheckedSphere[])[] => [];

function surfaceAudit(name: string, measured: MeasuredVessel, geometry: THREE.BufferGeometry): FillAudit {
  return { name, points: () => geometry.attributes.position!.array as Float32Array, vertexOutside: outsideTest(measured), pieces: NO_PIECES };
}

function liquidColumnDepths(geometry: THREE.BufferGeometry, profile: VesselProfile, level: number): void {
  const position = geometry.attributes.position!;
  const depths = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const reach = Math.hypot(x, z);
    const theta = Math.atan2(z, x);
    let depth = 0;
    for (let step = 1; step <= COLUMN_SEARCH_STEPS; step++) {
      const y = level - ((level - profile.floorY) * step) / COLUMN_SEARCH_STEPS;
      if (wallRadius(profile, theta, y) < reach) break;
      depth = level - y;
    }
    depths[i] = depth;
  }
  geometry.setAttribute("liquidDepth", new THREE.BufferAttribute(depths, 1));
}

const kept = (library: MaterialLibrary, geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
  library.keep(geometry);
  return geometry;
};

async function addLiquid(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const level = levelInVessel(profile, LIQUID_FRACTION);
  const geometry = await library.shared(`surface:liquid:${scanId}`, async () => {
    const built = gridGeometry(fittedSurface(profile, level, 32, 192, flatLevel(level)));
    rippleNormals(built, 0.00012);
    liquidColumnDepths(built, profile, level);
    return built;
  });
  const surface = stillMesh(geometry, await liquidMaterial(library, look));
  surface.receiveShadow = false;
  parent.add(surface);
  return surfaceAudit(name, measured, geometry);
}

async function addPaste(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const level = levelInVessel(profile, PASTE_FRACTION);
  const depth = profile.rimY - profile.floorY;
  const geometry = await library.shared(`surface:paste:${scanId}`, async () => gridGeometry(fittedSurface(profile, level, 56, 224, pasteHeight(level, depth))));
  parent.add(stillMesh(geometry, await substanceMaterial(library, look)));
  return surfaceAudit(name, measured, geometry);
}

async function addPowder(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const level = levelInVessel(profile, POWDER_FRACTION);
  const depth = profile.rimY - profile.floorY;
  const heap = depth * POWDER_HEAP_FRACTION;
  const geometry = await library.shared(`surface:powder:${scanId}`, async () => gridGeometry(fittedSurface(profile, level, 72, 256, moundHeight(level, heap, depth * 0.012))));
  const mound = stillMesh(geometry, await substanceMaterial(library, look));
  mound.castShadow = true;
  parent.add(mound);
  return surfaceAudit(name, measured, geometry);
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
    const placed = await runGradually(packingSteps({ ...profile, floorY: levelInVessel(profile, PILE_BED_FRACTION) + REST_ABOVE_BED_METRES }, recipe.blueprints, {
      seed: recipe.seed,
      candidates: recipe.candidates,
      maxTilt: recipe.maxTilt,
      anyTumble: recipe.anyTumble,
      topY: Math.min(profile.rimY - CLEAR_OF_LOW_RIM, profile.floorY + (profile.rimY - profile.floorY) * recipe.fillsTo),
      margin: recipe.wallMargin ?? 0.0065,
      fillRadius: widestWallRadius(profile, profile.rimY),
      leansOnOne: recipe.leansOnOne ?? false,
    }));
    return { recipe, placed };
  });
}

async function addPile(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, fill: PileFill, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const { recipe, placed } = await packedPile(library, scanId, fill, measured.profile);
  const material = fill === "crystals" ? await crystalMaterial(library, look) : await substanceMaterial(library, look);
  if (fill === "leaves") material.side = THREE.DoubleSide;
  const profile = measured.profile;
  const bedLevel = levelInVessel(profile, PILE_BED_FRACTION);
  const depth = profile.rimY - profile.floorY;
  const bedGeometry = await library.shared(`surface:bed:${scanId}`, async () => gridGeometry(fittedSurface(profile, bedLevel, 32, 128, moundHeight(bedLevel, 0, depth * PILE_BED_GRAIN), PILE_BED_INSET_METRES)));
  parent.add(stillMesh(bedGeometry, await pileBedMaterial(library, look)));
  const holder = new THREE.Object3D();
  holder.rotation.order = "YXZ";
  const placedMatrix = (piece: PlacedPiece): THREE.Matrix4 => {
    holder.position.set(piece.x, piece.y, piece.z);
    holder.rotation.set(piece.pitch, piece.yaw, piece.roll);
    holder.scale.setScalar(piece.scale);
    holder.updateMatrix();
    return holder.matrix;
  };
  recipe.variants.forEach((variant, index) => {
    const own = placed.filter((piece) => piece.variant === index);
    if (own.length === 0) return;
    const mesh = new THREE.InstancedMesh(variant.geometry, material, own.length);
    own.forEach((piece, i) => mesh.setMatrixAt(i, placedMatrix(piece)));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
  return {
    name,
    vertexOutside: outsideTest(measured),
    points: () => {
      const points: number[] = [...(bedGeometry.attributes.position!.array as Float32Array)];
      const vertex = new THREE.Vector3();
      for (const piece of placed) {
        const position = recipe.variants[piece.variant]!.geometry.attributes.position!;
        const matrix = placedMatrix(piece);
        for (let k = 0; k < position.count; k++) {
          vertex.fromBufferAttribute(position, k).applyMatrix4(matrix);
          points.push(vertex.x, vertex.y, vertex.z);
        }
      }
      return Float32Array.from(points);
    },
    pieces: () =>
      placed.map((piece) =>
        recipe.variants[piece.variant]!.spheres.map((sphere) => {
          const [x, y, z] = rotateYXZ(sphere.x * piece.scale, sphere.y * piece.scale, sphere.z * piece.scale, piece.yaw, piece.pitch, piece.roll);
          return { x: x + piece.x, y: y + piece.y, z: z + piece.z, r: sphere.r * piece.scale };
        }),
      ),
  };
}

function foldSlab(geometry: THREE.BufferGeometry, seed: number): void {
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, position.getY(i) + 0.0007 * Math.sin(x * 23 + seed * 1.7) * Math.sin(z * 17 - seed) + 0.0003 * Math.sin(x * 71 + z * 13 + seed));
  }
  geometry.computeVertexNormals();
}

async function addFoldedCloth(library: MaterialLibrary, parent: THREE.Object3D, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const material = await substanceMaterial(library, look);
  const midHeight = profile.floorY + (profile.rimY - profile.floorY) * 0.6;
  const halfX = wallRadius(profile, 0, midHeight) - 0.012;
  const halfZ = wallRadius(profile, Math.PI / 2, midHeight) - 0.012;
  const reach = Math.min(wallRadius(profile, Math.atan2(halfZ, halfX), midHeight) - 0.006, Math.hypot(halfX, halfZ)) / Math.hypot(halfX, halfZ);
  const sizeX = halfX * reach * 2;
  const sizeZ = halfZ * reach * 2;
  const longOnX = sizeX > sizeZ;
  const pileLong = (Math.max(sizeX, sizeZ) - FOLDED_GAP * (FOLDED_PILES - 1)) / FOLDED_PILES;
  const pileShort = Math.min(sizeX, sizeZ);
  const slabs: { readonly mesh: THREE.Mesh; readonly x: number; readonly y: number; readonly z: number }[] = [];
  for (let pile = 0; pile < FOLDED_PILES; pile++) {
    const along = -Math.max(sizeX, sizeZ) / 2 + pileLong / 2 + pile * (pileLong + FOLDED_GAP);
    const layers = 10 + ((pile * 2) % 3) * 2;
    for (let layer = 0; layer < layers; layer++) {
      const trimLong = pileLong - 0.008 * ((layer + pile) % 3);
      const trimShort = pileShort - 0.01 * ((layer + 1) % 2) - 0.006 * (layer % 3);
      const y = profile.floorY + FOLD_PITCH / 2 + 0.002 + layer * FOLD_PITCH;
      const x = longOnX ? along : 0;
      const z = longOnX ? 0 : along;
      const sx = longOnX ? trimLong : trimShort;
      const sz = longOnX ? trimShort : trimLong;
      const slab = softBox(parent, [sx, FOLD_THICKNESS, sz], material, [x, y, z], { radius: FOLD_RADIUS, segments: 22, tile: [1, 1] });
      foldSlab(slab.geometry, pile * 3 + layer);
      slabs.push({ mesh: slab, x, y, z });
    }
  }
  return {
    name,
    vertexOutside: outsideTest(measured),
    pieces: NO_PIECES,
    points: () => {
      const points: number[] = [];
      for (const { mesh, x, y, z } of slabs) {
        const position = mesh.geometry.attributes.position!;
        for (let k = 0; k < position.count; k++) points.push(x + position.getX(k), y + position.getY(k), z + position.getZ(k));
      }
      return Float32Array.from(points);
    },
  };
}

export async function fillVessel(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  if (look.fill === "liquid") return addLiquid(library, parent, scanId, look, measured, name);
  if (look.fill === "paste") return addPaste(library, parent, scanId, look, measured, name);
  if (look.fill === "powder") return addPowder(library, parent, scanId, look, measured, name);
  if (look.fill === "cloth") return addFoldedCloth(library, parent, look, measured, name);
  if (isPileFill(look.fill)) return addPile(library, parent, scanId, look.fill, look, measured, name);
  throw new Error(`No fill for ${look.key}`);
}
