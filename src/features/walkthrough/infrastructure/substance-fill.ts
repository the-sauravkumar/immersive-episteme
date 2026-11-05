import * as THREE from "three";
import type { SubstanceLook } from "@/features/process/domain/substance-look";
import { foldedPile } from "../domain/cloth-surface";
import { fittedSurface, flatLevel, levelInVessel, moundHeight, pasteHeight, type SurfaceGrid } from "../domain/fill-surface";
import { packingSteps, rotateYXZ, type PlacedPiece } from "../domain/pile-packing";
import { makeVesselProbe, vertexOutsideVessel, VESSEL_TUCK_METRES, type VesselProbe } from "../domain/mesh-probe";
import type { FillAudit, CheckedSphere } from "../domain/scene-check";
import { measuringSteps, wallRadius, widestWallRadius, type VesselProfile } from "../domain/vessel-profile";
import type { MaterialLibrary } from "./material-library";
import { isPileFill, pileRecipe, type PileFill, type PileRecipe } from "./fill-pieces";
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
  const walls = new Float32Array(position.count * 2);
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
    const gap = Math.max(wallRadius(profile, theta, level) - reach, 0);
    walls[i * 2] = Math.cos(theta) * gap;
    walls[i * 2 + 1] = Math.sin(theta) * gap;
  }
  geometry.setAttribute("liquidDepth", new THREE.BufferAttribute(depths, 1));
  geometry.setAttribute("liquidWall", new THREE.BufferAttribute(walls, 2));
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

async function addFoldedCloth(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const material = await substanceMaterial(library, look);
  const geometry = await library.shared(`surface:folded:${scanId}`, async () => {
    const midHeight = profile.floorY + (profile.rimY - profile.floorY) * 0.6;
    const halfX = wallRadius(profile, 0, midHeight) - 0.012;
    const halfZ = wallRadius(profile, Math.PI / 2, midHeight) - 0.012;
    const reach = Math.min(wallRadius(profile, Math.atan2(halfZ, halfX), midHeight) - 0.006, Math.hypot(halfX, halfZ)) / Math.hypot(halfX, halfZ);
    const sizeX = halfX * reach * 2;
    const sizeZ = halfZ * reach * 2;
    const longOnX = sizeX > sizeZ;
    const pileLong = (Math.max(sizeX, sizeZ) - FOLDED_GAP * (FOLDED_PILES - 1)) / FOLDED_PILES;
    const pileShort = Math.min(sizeX, sizeZ);
    const piles = Array.from({ length: FOLDED_PILES }, (_, pile) =>
      foldedPile({ sizeLong: pileLong, sizeShort: pileShort, layers: 10 + ((pile * 2) % 3) * 2, pitch: FOLD_PITCH, thickness: FOLD_THICKNESS, floorY: profile.floorY + 0.002, longOnX, centre: -Math.max(sizeX, sizeZ) / 2 + pileLong / 2 + pile * (pileLong + FOLDED_GAP), seed: pile + 1 }),
    );
    const vertices = piles.reduce((sum, pile) => sum + pile.positions.length / 3, 0);
    const positions = new Float32Array(vertices * 3);
    const colours = new Float32Array(vertices * 3);
    const indices = new Uint32Array(piles.reduce((sum, pile) => sum + pile.indices.length, 0));
    let vertexAt = 0;
    let indexAt = 0;
    for (const pile of piles) {
      positions.set(pile.positions, vertexAt * 3);
      for (let k = 0; k < pile.shade.length; k++) colours.fill(pile.shade[k]!, (vertexAt + k) * 3, (vertexAt + k + 1) * 3);
      for (let k = 0; k < pile.indices.length; k++) indices[indexAt + k] = pile.indices[k]! + vertexAt;
      vertexAt += pile.positions.length / 3;
      indexAt += pile.indices.length;
    }
    const built = new THREE.BufferGeometry();
    built.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    built.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    built.setIndex(new THREE.BufferAttribute(indices, 1));
    built.computeVertexNormals();
    return built;
  });
  const stack = stillMesh(geometry, material);
  stack.castShadow = true;
  parent.add(stack);
  return surfaceAudit(name, measured, geometry);
}

export async function fillVessel(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  if (look.fill === "liquid") return addLiquid(library, parent, scanId, look, measured, name);
  if (look.fill === "paste") return addPaste(library, parent, scanId, look, measured, name);
  if (look.fill === "powder") return addPowder(library, parent, scanId, look, measured, name);
  if (look.fill === "cloth") return addFoldedCloth(library, parent, scanId, look, measured, name);
  if (isPileFill(look.fill)) return addPile(library, parent, scanId, look.fill, look, measured, name);
  throw new Error(`No fill for ${look.key}`);
}
