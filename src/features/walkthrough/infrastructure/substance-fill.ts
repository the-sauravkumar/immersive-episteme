import * as THREE from "three";
import type { SubstanceLook } from "@/features/process/domain/substance-look";
import { foldedPile } from "../domain/cloth-surface";
import { fittedSurfaceSteps, flatLevel, heapHeight, levelInVessel, meanWallRadius, moundHeight, pasteHeight, surfaceShade, valueNoise, wallFilm, type HeapShape, type HeightAt, type SurfaceGrid, type SurfaceShading } from "../domain/fill-surface";
import { pileFormOf, type PileForm } from "../domain/pile-form";
import { packingSteps, piecesNearTop, rotateYXZ, seededRandom, worldSpheresOf, type PieceSphere, type PlacedPiece } from "../domain/pile-packing";
import { firstHit, makeVesselProbe, vertexOutsideVessel, VESSEL_TUCK_METRES, type VesselProbe } from "../domain/mesh-probe";
import type { FillAudit, CheckedSphere } from "../domain/scene-check";
import { measuringSteps, wallRadius, widestWallRadius, type VesselProfile } from "../domain/vessel-profile";
import type { MaterialLibrary } from "./material-library";
import { hasCakePieces, isLumpCrystal, PASTE_FORMS, pasteThicknessOf, POWDER_FORMS, powderGrainOf, type PowderGrain } from "../domain/substance-body";
import { scatterSteps, type ScatterKind } from "../domain/surface-scatter";
import { alumLump, crumb, crystalGrain, curledShaving, grainsInTurn, grit, indigoCake, woodFlake } from "./fill-grains";
import { blueprintsFrom, isPileFill, pileRecipe, type PileRecipe, type TonedPileRecipe } from "./fill-pieces";
import type { PieceShape, Tone } from "./piece-mesh";
import { cakeMaterial, crystalMaterial, displayAlbedo, filmMaterial, liquidMaterial, pileBedMaterial, pileMaterial, substanceMaterial } from "./substance-materials";

const LIQUID_FRACTION = 0.76;
const FILM_INSET_METRES = 0.0007;
const FILM_WALL_TRUST = 1.04;
const FILM_BELOW_LEVEL_METRES = 0.007;
const FILM_BELOW_RIM_METRES = 0.004;
const FILM_TOP_STEP_METRES = 0.001;
const FILM_SHADE = 0.8;
const HEAP_SHADING: SurfaceShading = { cavityMetres: 0.0032, cavity: 0.2, wall: 0.42 };
const PASTE_SHADING: SurfaceShading = { cavityMetres: 0.004, cavity: 0.16, wall: 0.3 };
const LUMP_BED_FRACTION = 0.22;
const LUMP_REST_METRES = 0.0016;
const LUMP_FILLS_TO = 0.62;
const LUMP_HEAP_REACH = 0.22;
const LUMP_CROWN = 0.12;
const CLEAR_OF_LOW_RIM = 0.01;
const PILE_BED_FRACTION = 0.34;
const PILE_BED_GRAIN = 0.012;
const AUDIT_WALL_BAND_METRES = 0.018;
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

function probeOf(measured: MeasuredVessel): VesselProbe {
  measured.probe ??= makeVesselProbe(measured.triangles, 0, 0, measured.profile.rimY, measured.profile.floorY);
  return measured.probe;
}

function outsideTest(measured: MeasuredVessel): FillAudit["vertexOutside"] {
  return (point) => vertexOutsideVessel(probeOf(measured), point, VESSEL_TUCK_METRES);
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
    const built = gridGeometry(await runGradually(fittedSurfaceSteps(profile, level, 32, 192, flatLevel(level))));
    liquidColumnDepths(built, profile, level);
    return built;
  });
  const surface = stillMesh(geometry, await liquidMaterial(library, look));
  surface.receiveShadow = false;
  parent.add(surface);
  return surfaceAudit(name, measured, geometry);
}

function plainWhite(geometry: THREE.BufferGeometry, shade = 1): THREE.BufferGeometry {
  const count = geometry.attributes.position!.count;
  geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(shade), 3));
  return geometry;
}

function shadedGeometry(grid: SurfaceGrid, rings: number, spokes: number, shading: SurfaceShading): THREE.BufferGeometry {
  const geometry = gridGeometry(grid);
  geometry.setAttribute("color", new THREE.BufferAttribute(surfaceShade(grid, rings, spokes, shading), 3));
  return geometry;
}

function wallFilmGeometry(measured: MeasuredVessel, level: number, height: number, seed: number): THREE.BufferGeometry {
  const profile = measured.profile;
  const probe = probeOf(measured);
  const wallAt = (theta: number, y: number): number => {
    const measuredRadius = wallRadius(profile, theta, y);
    const hit = firstHit(probe.grid, [0, y, 0], [Math.cos(theta), 0, Math.sin(theta)]);
    return hit && hit.distance < measuredRadius * FILM_WALL_TRUST ? hit.distance : measuredRadius;
  };
  const rise = (theta: number): number => height * (0.45 + 0.75 * valueNoise(Math.cos(theta) * 3.3 + 7, Math.sin(theta) * 3.3 + 3, seed));
  const enclosed = (theta: number, y: number): boolean => {
    const hit = firstHit(probe.grid, [0, y, 0], [Math.cos(theta), 0, Math.sin(theta)]);
    return hit !== null && hit.distance < wallRadius(profile, theta, y) * 1.25;
  };
  const topOf = (theta: number): number => {
    let y = Math.min(level + rise(theta), profile.rimY - FILM_BELOW_RIM_METRES);
    while (y > level && !(enclosed(theta, y + FILM_BELOW_RIM_METRES) && enclosed(theta, y))) y -= FILM_TOP_STEP_METRES;
    return y;
  };
  const grid = wallFilm(12, 320, () => level - FILM_BELOW_LEVEL_METRES, topOf, wallAt, FILM_INSET_METRES);
  const geometry = plainWhite(gridGeometry(grid), FILM_SHADE);
  geometry.setAttribute("filmShare", new THREE.BufferAttribute(grid.share, 1));
  return geometry;
}

interface PieceSet {
  readonly variants: readonly PieceShape[];
  readonly material: THREE.Material;
  readonly placed: readonly PlacedPiece[];
  readonly castsShadow: boolean;
  readonly toneSpread: number;
  readonly warmth: number;
}

const PIECE_HOLDER = new THREE.Object3D();
PIECE_HOLDER.rotation.order = "YXZ";

function placedMatrixFor(piece: PlacedPiece): THREE.Matrix4 {
  PIECE_HOLDER.position.set(piece.x, piece.y, piece.z);
  PIECE_HOLDER.rotation.set(piece.pitch, piece.yaw, piece.roll);
  PIECE_HOLDER.scale.setScalar(piece.scale);
  PIECE_HOLDER.updateMatrix();
  return PIECE_HOLDER.matrix;
}

function addPieceSet(parent: THREE.Object3D, set: PieceSet): void {
  const tint = new THREE.Color();
  set.variants.forEach((variant, index) => {
    const own = set.placed.filter((piece) => piece.variant === index);
    if (own.length === 0) return;
    const mesh = new THREE.InstancedMesh(variant.geometry, set.material, own.length);
    own.forEach((piece, i) => {
      mesh.setMatrixAt(i, placedMatrixFor(piece));
      const tone = 1 + set.toneSpread * (valueNoise(piece.x * 310, piece.z * 310, index) - 0.5) * 2;
      const warm = set.warmth * (valueNoise(piece.z * 170, piece.x * 170, index + 4) - 0.35);
      tint.setRGB(tone * (1 + warm), tone, tone * (1 - warm));
      mesh.setColorAt(i, tint);
    });
    mesh.castShadow = set.castsShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
}

function placedSpheres(set: PieceSet, piece: PlacedPiece): CheckedSphere[] {
  return set.variants[piece.variant]!.spheres.map((sphere) => {
    const [x, y, z] = rotateYXZ(sphere.x * piece.scale, sphere.y * piece.scale, sphere.z * piece.scale, piece.yaw, piece.pitch, piece.roll);
    return { x: x + piece.x, y: y + piece.y, z: z + piece.z, r: sphere.r * piece.scale };
  });
}

function fillAudit(name: string, measured: MeasuredVessel, geometries: readonly THREE.BufferGeometry[], sets: readonly PieceSet[]): FillAudit {
  return {
    name,
    vertexOutside: outsideTest(measured),
    points: () => {
      const points: number[] = [];
      for (const geometry of geometries) for (const value of geometry.attributes.position!.array as Float32Array) points.push(value);
      for (const set of sets) {
        for (const piece of set.placed) {
          for (const { x, y, z, r } of placedSpheres(set, piece)) points.push(x + r, y, z, x - r, y, z, x, y, z + r, x, y, z - r, x, y + r, z);
        }
      }
      return Float32Array.from(points);
    },
    pieces: () => sets.flatMap((set) => set.placed.map((piece) => placedSpheres(set, piece))),
  };
}

const keySeed = (key: string): number => [...key].reduce((sum, letter, i) => (sum * 31 + letter.charCodeAt(0) * (i + 1)) % 997, 7);

const PASTE_SMEAR = { stretch: 0.22, falloff: 2.6, cloudWeight: 1.9, grainWeight: 0.15, edge: 0.7 };
const POWDER_FEATHER = { stretch: 1, falloff: 1.6, cloudWeight: 1.1, grainWeight: 1.3, edge: 0.45 };

async function addPaste(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const thickness = pasteThicknessOf(look);
  const form = PASTE_FORMS[thickness];
  const level = levelInVessel(profile, form.level);
  const depth = profile.rimY - profile.floorY;
  const seed = keySeed(look.key);
  const body = { ...form, strokes: Math.max(1, form.strokes - (seed % 3)), furrowDepth: form.furrowDepth * (0.55 + (seed % 5) * 0.15), reach: meanWallRadius(profile, level), seed };
  const geometry = await library.shared(`surface:paste:${scanId}:${look.key}`, async () => shadedGeometry(await runGradually(fittedSurfaceSteps(profile, level, 72, 320, pasteHeight(level, depth, body))), 72, 320, PASTE_SHADING));
  const smear = await library.shared(`film:paste:${scanId}:${thickness}`, async () => wallFilmGeometry(measured, level + depth * form.meniscus * 0.3, depth * form.smearHeight, 5));
  const mass = stillMesh(geometry, await substanceMaterial(library, look));
  mass.castShadow = true;
  parent.add(mass);
  parent.add(stillMesh(smear, await filmMaterial(library, look, PASTE_SMEAR)));
  return fillAudit(name, measured, [geometry, smear], []);
}

interface GrainRecipe {
  readonly variants: readonly PieceShape[];
  readonly kinds: readonly ScatterKind[];
}

const range = (from: number, count: number): number[] => Array.from({ length: count }, (_, i) => from + i);

const CRUMB_VARIANTS = 5;
const CRUMB_RADIUS: Readonly<Record<PowderGrain, number>> = { fine: 0.0015, dust: 0.0015, coarse: 0.0013, granular: 0.0012, fibrous: 0.0013, crystalline: 0.0016 };

function grainRecipe(library: MaterialLibrary, grain: PowderGrain): Promise<GrainRecipe> {
  return library.shared(`grains:${grain}`, async () => {
    const form = POWDER_FORMS[grain];
    const crumbMakers = range(1, CRUMB_VARIANTS).map((seed) => () => (grain === "crystalline" ? crystalGrain(seed, CRUMB_RADIUS[grain]) : grit(seed, CRUMB_RADIUS[grain])));
    const clumpMakers = form.clumps > 0 ? range(11, 3).map((seed) => () => crumb(seed, 0.0042, 3)) : [];
    const fibreMakers = grain === "fibrous" ? [...range(21, 6).map((seed) => () => curledShaving(seed)), ...range(31, 5).map((seed) => () => woodFlake(seed))] : [];
    const variants = await grainsInTurn([...crumbMakers, ...clumpMakers, ...fibreMakers]);
    for (const variant of variants) kept(library, plainWhite(variant.geometry));
    const spheresOf = (variant: number) => variants[variant]!.spheres;
    const fibres: ScatterKind[] = grain === "fibrous"
      ? [
          { variants: range(CRUMB_VARIANTS, 6), spheresOf, count: 520, smallest: 0.55, largest: 1.25, towardWall: 0.1, sink: 0.3, tries: 24 },
          { variants: range(CRUMB_VARIANTS + 6, 5), spheresOf, count: 300, smallest: 0.45, largest: 1.05, towardWall: 0.1, sink: 0.2, tries: 24 },
        ]
      : [];
    const clumps: ScatterKind[] = form.clumps > 0 ? [{ variants: range(CRUMB_VARIANTS, 3), spheresOf, count: form.clumps, smallest: form.clumpSmallest, largest: form.clumpLargest, towardWall: 0.45, sink: 0.3, tries: 20 }] : [];
    return { variants, kinds: [...clumps, ...fibres, { variants: range(0, CRUMB_VARIANTS), spheresOf, count: form.crumbs, smallest: form.crumbSmallest, largest: form.crumbLargest, towardWall: 0.8, sink: 0.35 }] };
  });
}

function heapShapeOf(grain: PowderGrain, reach: number): HeapShape {
  const form = POWDER_FORMS[grain];
  return { reach, seed: 11 + grain.length, crownOffset: form.crownOffset, slumps: form.slumps, slumpDepth: form.slumpDepth, lineDepth: form.lineDepth, lumpDepth: form.lumpDepth, fineDepth: form.fineDepth, climb: form.climb };
}

async function cakeSet(library: MaterialLibrary, scanId: string, look: SubstanceLook, profile: VesselProfile, level: number, heightAt: HeightAt): Promise<PieceSet> {
  const variants = await library.shared("recipe:indigo-cake", async () => {
    const built = await grainsInTurn(range(1, 6).map((seed) => () => indigoCake(seed)));
    for (const variant of built) kept(library, variant.geometry);
    return built;
  });
  const kind: ScatterKind = { variants: range(0, 6), spheresOf: (variant) => variants[variant]!.spheres, count: 6, smallest: 0.82, largest: 1.18, towardWall: 0, sink: 0.12, tries: 90, lying: true };
  const placed = await library.shared(`scatter:cake:${scanId}`, async () => ({ pieces: await runGradually(scatterSteps([kind], { profile, heightAt, level, seed: 53, margin: 0.002 })) }));
  return { variants, material: await cakeMaterial(library, look), placed: placed.pieces, castsShadow: true, toneSpread: 0.1, warmth: 0.02 };
}

async function addPowder(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const grain = powderGrainOf(look);
  const form = POWDER_FORMS[grain];
  const level = levelInVessel(profile, form.level);
  const depth = profile.rimY - profile.floorY;
  const heightAt = heapHeight(level, depth * form.heap, heapShapeOf(grain, meanWallRadius(profile, level)));
  const geometry = await library.shared(`surface:powder:${scanId}:${grain}`, async () => shadedGeometry(await runGradually(fittedSurfaceSteps(profile, level, 96, 384, heightAt)), 96, 384, HEAP_SHADING));
  const dust = await library.shared(`film:powder:${scanId}:${grain}`, async () => wallFilmGeometry(measured, level, depth * form.filmHeight, 9));
  const material = await substanceMaterial(library, look);
  if (grain === "fibrous") material.side = THREE.DoubleSide;
  const mound = stillMesh(geometry, material);
  mound.castShadow = true;
  parent.add(mound);
  parent.add(stillMesh(dust, await filmMaterial(library, look, POWDER_FEATHER)));
  const recipe = await grainRecipe(library, grain);
  const cakes = hasCakePieces(look) ? await cakeSet(library, scanId, look, profile, level, heightAt) : null;
  const avoid = cakes ? cakes.placed.flatMap((piece) => placedSpheres(cakes, piece)) : [];
  const placed = await library.shared(`scatter:powder:${scanId}:${grain}:${cakes ? "cake" : "loose"}`, async () => ({ pieces: await runGradually(scatterSteps(recipe.kinds, { profile, heightAt, level, seed: 37, margin: 0.001, avoid })) }));
  const grains: PieceSet = { variants: recipe.variants, material: grain === "crystalline" ? await crystalMaterial(library, look) : material, placed: placed.pieces.filter((piece) => piece.variant < CRUMB_VARIANTS), castsShadow: false, toneSpread: 0.22, warmth: grain === "coarse" ? 0.32 : 0.1 };
  const larger: PieceSet = { variants: recipe.variants, material, placed: placed.pieces.filter((piece) => piece.variant >= CRUMB_VARIANTS), castsShadow: grain !== "fibrous", toneSpread: grain === "fibrous" ? 0.3 : 0.1, warmth: grain === "fibrous" ? 0.16 : 0.06 };
  const sets = cakes ? [grains, larger, cakes] : [grains, larger];
  for (const set of sets) addPieceSet(parent, set);
  return fillAudit(name, measured, [geometry, dust], sets);
}

const LARGE_LUMPS = 30;
const SMALL_LUMPS = 22;
const LARGE_LUMP_VARIANTS = 5;
const ALUM_CRUMBS = 60;

async function addCrystalLumps(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const profile = measured.profile;
  const level = levelInVessel(profile, LUMP_BED_FRACTION);
  const depth = profile.rimY - profile.floorY;
  const heightAt = heapHeight(level, 0, { ...heapShapeOf("fine", meanWallRadius(profile, level)), slumps: 0, lineDepth: 0, lumpDepth: 0.0014, fineDepth: 0.0003 });
  const bed = await library.shared(`surface:lump-bed:${scanId}`, async () => gridGeometry(await runGradually(fittedSurfaceSteps(profile, level, 64, 320, heightAt))));
  const dust = await library.shared(`film:lump-bed:${scanId}`, async () => wallFilmGeometry(measured, level, depth * POWDER_FORMS.fine.filmHeight, 13));
  const powder = await substanceMaterial(library, look);
  parent.add(stillMesh(bed, await pileBedMaterial(library, look)));
  parent.add(stillMesh(dust, await filmMaterial(library, look, POWDER_FEATHER)));
  const lumps = await library.shared("recipe:alum-lump", async () => {
    const built = await grainsInTurn(range(1, 9).map((seed) => () => alumLump(seed, seed <= LARGE_LUMP_VARIANTS ? 2 : 1)));
    for (const variant of built) kept(library, variant.geometry);
    return built;
  });
  const packed = await library.shared(`pile:${scanId}:alum`, async () => ({
    pieces: await runGradually(packingSteps({ ...profile, floorY: level + LUMP_REST_METRES }, [...blueprintsFrom(lumps.slice(0, LARGE_LUMP_VARIANTS), LARGE_LUMPS, 25, 0.9, 1.25), ...blueprintsFrom(lumps.slice(LARGE_LUMP_VARIANTS), SMALL_LUMPS, 26, 0.65, 0.9).map((blueprint) => ({ ...blueprint, variant: blueprint.variant + LARGE_LUMP_VARIANTS }))], { seed: 105, candidates: 16, maxTilt: 0.5, anyTumble: true, topY: Math.min(profile.rimY - CLEAR_OF_LOW_RIM, profile.floorY + depth * LUMP_FILLS_TO), margin: 0.003, fillRadius: widestWallRadius(profile, level + depth * LUMP_HEAP_REACH), leansOnOne: true, crown: depth * LUMP_CROWN })),
  }));
  const lumpSet: PieceSet = { variants: lumps, material: await crystalMaterial(library, look), placed: packed.pieces, castsShadow: true, toneSpread: 0.06, warmth: 0.06 };
  const recipe = await grainRecipe(library, "fine");
  const avoid = packed.pieces.flatMap((piece) => placedSpheres(lumpSet, piece));
  const crumbs = await library.shared(`scatter:lump-bed:${scanId}`, async () => ({
    pieces: await runGradually(scatterSteps([...recipe.kinds, { variants: range(0, CRUMB_VARIANTS), spheresOf: (variant: number) => recipe.variants[variant]!.spheres, count: ALUM_CRUMBS, smallest: 0.3, largest: 0.7, towardWall: 0.2, sink: 0.3 }], { profile, heightAt, level, seed: 71, margin: 0.001, avoid })),
  }));
  const crumbSet: PieceSet = { variants: recipe.variants, material: powder, placed: crumbs.pieces, castsShadow: false, toneSpread: 0.08, warmth: 0.02 };
  addPieceSet(parent, lumpSet);
  addPieceSet(parent, crumbSet);
  return fillAudit(name, measured, [bed, dust], [lumpSet, crumbSet]);
}

interface PackedPile {
  readonly recipe: TonedPileRecipe;
  readonly placed: readonly PlacedPiece[];
  readonly world: readonly (readonly PieceSphere[])[];
  readonly seen: readonly boolean[];
}

const bedHeightOf = (profile: VesselProfile, recipe: PileRecipe) => {
  const depth = profile.rimY - profile.floorY;
  return moundHeight(levelInVessel(profile, recipe.bedShare ?? PILE_BED_FRACTION), depth * (recipe.bedHeap ?? 0), depth * PILE_BED_GRAIN);
};

function packedPile(library: MaterialLibrary, scanId: string, form: PileForm, profile: VesselProfile): Promise<PackedPile> {
  return library.shared(`pile:${scanId}:${form}`, async () => {
    const recipe = await library.shared(`recipe:${form}`, async () => {
      const built = await pileRecipe(form);
      for (const variant of built.variants) {
        kept(library, variant.geometry);
        kept(library, variant.buried);
      }
      return built;
    });
    const placed = await runGradually(pileSteps(profile, recipe));
    const world = placed.map((piece) => worldSpheresOf(piece, recipe.variants[piece.variant]!.spheres));
    const seen = recipe.seenDepth === undefined ? placed.map(() => true) : piecesNearTop(world, recipe.seenDepth);
    return { recipe, placed, world, seen };
  });
}

export function pileSteps(profile: VesselProfile, recipe: PileRecipe): Generator<void, PlacedPiece[]> {
  const bedHeight = bedHeightOf(profile, recipe);
  const bedLevel = levelInVessel(profile, recipe.bedShare ?? PILE_BED_FRACTION);
  return packingSteps({ ...profile, floorY: bedLevel + REST_ABOVE_BED_METRES }, recipe.blueprints, {
      seed: recipe.seed,
      candidates: recipe.candidates,
      maxTilt: recipe.maxTilt,
      anyTumble: recipe.anyTumble,
      topY: Math.min(profile.rimY - CLEAR_OF_LOW_RIM, profile.floorY + (profile.rimY - profile.floorY) * recipe.fillsTo),
      margin: recipe.wallMargin ?? 0.0065,
      fillRadius: widestWallRadius(profile, profile.rimY),
      leansOnOne: recipe.leansOnOne ?? false,
      ...(recipe.spins ? { spins: true } : {}),
      ...(recipe.crown ? { crown: recipe.crown } : {}),
      restAt: (x, z) => bedHeight(x, z, Math.min(1, Math.hypot(x, z) / wallRadius(profile, Math.atan2(z, x), bedLevel))) + REST_ABOVE_BED_METRES,
    });
}

function againstWall(profile: VesselProfile, spheres: readonly PieceSphere[]): boolean {
  return spheres.some((sphere) => Math.hypot(sphere.x, sphere.z) + sphere.r + AUDIT_WALL_BAND_METRES > wallRadius(profile, Math.atan2(sphere.z, sphere.x), sphere.y));
}

const NO_TONE: Tone = [1, 1, 1];

function spreadTonesOf(look: SubstanceLook): readonly Tone[] {
  const base = displayAlbedo(look.renderHex);
  return [NO_TONE, ...look.spread.map(({ hex }) => {
    const shifted = displayAlbedo(hex);
    return [shifted.r / base.r, shifted.g / base.g, shifted.b / base.b] as const;
  })];
}

function spreadPicker(look: SubstanceLook, seed: number): (index: number) => number {
  return (index) => {
    let left = seededRandom(index * 7919 + seed)();
    for (let k = 0; k < look.spread.length; k++) {
      left -= look.spread[k]!.share;
      if (left < 0) return k + 1;
    }
    return 0;
  };
}

async function addPile(library: MaterialLibrary, parent: THREE.Object3D, scanId: string, form: PileForm, look: SubstanceLook, measured: MeasuredVessel, name: string): Promise<FillAudit> {
  const { recipe, placed, world, seen } = await packedPile(library, scanId, form, measured.profile);
  const material = await pileMaterial(library, look, recipe.meanTone);
  const profile = measured.profile;
  const bedGeometry = await library.shared(`surface:bed:${scanId}:${form}`, async () => gridGeometry(await runGradually(fittedSurfaceSteps(profile, levelInVessel(profile, recipe.bedShare ?? PILE_BED_FRACTION), 48, 192, bedHeightOf(profile, recipe), PILE_BED_INSET_METRES))));
  if (!recipe.bare) parent.add(stillMesh(bedGeometry, await pileBedMaterial(library, look)));
  const holder = new THREE.Object3D();
  holder.rotation.order = "YXZ";
  const placedMatrix = (piece: PlacedPiece): THREE.Matrix4 => {
    holder.position.set(piece.x, piece.y, piece.z);
    holder.rotation.set(piece.pitch, piece.yaw, piece.roll);
    holder.scale.setScalar(piece.scale);
    holder.updateMatrix();
    return holder.matrix;
  };
  const geometryOf = (index: number): THREE.BufferGeometry => (seen[index] ? recipe.variants[placed[index]!.variant]!.geometry : recipe.variants[placed[index]!.variant]!.buried);
  const tint = new THREE.Color();
  const tones = recipe.tones;
  const spreadTones = spreadTonesOf(look);
  const spreadPick = spreadPicker(look, keySeed(look.key));
  recipe.variants.forEach((variant, variantIndex) => {
    for (const showing of [true, false]) {
      const own = placed.map((_, index) => index).filter((index) => placed[index]!.variant === variantIndex && seen[index] === showing);
      if (own.length === 0) continue;
      const mesh = new THREE.InstancedMesh(showing ? variant.geometry : variant.buried, material, own.length);
      own.forEach((index, i) => {
        mesh.setMatrixAt(i, placedMatrix(placed[index]!));
        const tone = tones ? tones[(index * 7 + (index >> 3)) % tones.length]! : NO_TONE;
        const spread = spreadTones[spreadPick(index)]!;
        mesh.setColorAt(i, tint.setRGB(tone[0] * spread[0], tone[1] * spread[1], tone[2] * spread[2], THREE.LinearSRGBColorSpace));
      });
      mesh.castShadow = showing;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
  });
  return {
    name,
    vertexOutside: outsideTest(measured),
    points: () => {
      const points: number[] = recipe.bare ? [] : [...(bedGeometry.attributes.position!.array as Float32Array)];
      const vertex = new THREE.Vector3();
      placed.forEach((piece, index) => {
        if (!againstWall(profile, world[index]!)) return;
        const position = geometryOf(index).attributes.position!;
        const matrix = placedMatrix(piece);
        for (let k = 0; k < position.count; k++) {
          vertex.fromBufferAttribute(position, k).applyMatrix4(matrix);
          points.push(vertex.x, vertex.y, vertex.z);
        }
      });
      return Float32Array.from(points);
    },
    pieces: () => world,
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
  if (look.fill === "liquid" || (look.fill === "paste" && look.transparency === "clear")) return addLiquid(library, parent, scanId, look, measured, name);
  if (look.fill === "paste") return addPaste(library, parent, scanId, look, measured, name);
  if (isLumpCrystal(look)) return addCrystalLumps(library, parent, scanId, look, measured, name);
  if (look.fill === "powder" || look.fill === "crystals") return addPowder(library, parent, scanId, look, measured, name);
  if (look.fill === "cloth") return addFoldedCloth(library, parent, scanId, look, measured, name);
  if (isPileFill(look.fill)) return addPile(library, parent, scanId, pileFormOf(look)!, look, measured, name);
  throw new Error(`No fill for ${look.key}`);
}
