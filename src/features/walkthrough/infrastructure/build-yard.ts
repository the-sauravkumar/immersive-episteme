import * as THREE from "three";
import { catalogueModel } from "@/features/process/domain/asset-catalogue";
import { clothBodyBoxes, type ClothSurface } from "../domain/cloth-surface";
import { FAR_WALL_Z, GAP_WIDTH, CLOTH_LINE_X, NEXT_YARD_OFFSET, RAIL_HEIGHT, TIE_BOARD_THICKNESS, WALL_HEIGHT, WORK_FLOOR_Y, YARD_FRONT_Z, YARD_HALF_WIDTH, type PaintedWords, type YardPlan } from "../domain/yard-plan";
import type { SubstanceLook } from "@/features/process/domain/substance-look";
import { makeVesselProbe, vertexOutsideVessel, type VesselProbe } from "../domain/mesh-probe";
import type { CheckedSolid, ClothMesh, FillAudit, SolidField, SolidRole } from "../domain/scene-check";
import type { Box, Vec3 } from "../domain/geometry";
import { dipInBath, type MaterialLibrary } from "./material-library";
import { buildBrushAndKalam, buildCarvingChisels, buildWashingPaddle } from "./built-tools";
import { grainAlongHeight, paintCurved, paintWords, pole, softBox, softBoxGeometry } from "./solid-builders";
import { fillVessel, measureObject, trianglesOf } from "./substance-fill";
import { displayAlbedo, substanceMaterial } from "./substance-materials";
import { addTankLining, addWorkLiquid, BATH_BODY_DEPTH_METRES, copperMaterial, groundWithOpening, plasterMaterial, turnedRing } from "./work-structures";

export interface YardAudit {
  readonly solids: CheckedSolid[];
  readonly cloths: ClothMesh[];
  readonly fields: SolidField[];
  readonly fills: FillAudit[];
  readonly groundIsOpenAt: (x: number, z: number) => boolean;
  readonly unchecked: string[];
}

export interface BuiltYard {
  readonly group: THREE.Group;
  readonly audit: () => YardAudit;
  readonly colliders: readonly Box[];
}

export interface YardTextile {
  readonly file: string;
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly label: PaintedWords;
}

export interface YardFiles {
  readonly textiles?: readonly YardTextile[];
  readonly clothBefore: string | "raw-cotton";
  readonly clothAfter: string | "raw-cotton";
  readonly wetAfter: boolean;
}

interface Registered {
  readonly name: string;
  readonly role: SolidRole;
  readonly object: THREE.Object3D;
  readonly restsOn: readonly string[];
  readonly standsOnY?: number;
  readonly standsWithin?: Box;
}

export class YardKit {
  constructor(readonly library: MaterialLibrary) {}

  bambooMaterial(): Promise<THREE.MeshStandardMaterial> {
    return this.library.shared("work:bamboo", () => this.library.surface("bamboo", { normalScale: 1 }));
  }
}

function clothGeometry(surface: ClothSurface): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(surface.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(surface.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

async function clothMaterialFor(kit: YardKit, file: string, wet: boolean): Promise<THREE.MeshStandardMaterial> {
  return file === "raw-cotton" ? kit.library.rawCottonMaterial() : kit.library.clothMaterial(file, { wet });
}

const BENCH_CLEAR_WIDTH = 0.44;
const BENCH_WIDTH = 0.5;
const BENCH_TOP = 0.38;
const BENCH_ITEM_GAP = 0.05;
const BATH_TUCK_METRES = 0.005;
const TRAY_BENCH_CLEARANCE = 0.02;
const DOOR_PLANK_SHIFT = 0.37;

function dryClothShadowMaterial(): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float vClothY;").replace("#include <project_vertex>", "#include <project_vertex>\nvClothY = (modelMatrix * vec4(transformed, 1.0)).y;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vClothY;").replace("#include <map_fragment>", "if (vClothY < 0.05) discard;\n#include <map_fragment>");
  };
  return material;
}

export interface PlacedModel {
  readonly object: THREE.Object3D;
  readonly fills: readonly FillAudit[];
}

export interface PlaceOptions {
  readonly look?: SubstanceLook | null;
  readonly tray?: SubstanceLook | null;
}

async function buildCarvedBlock(kit: YardKit): Promise<THREE.Object3D> {
  const timber = await kit.library.surface("table", { normalScale: 1 });
  const group = new THREE.Group();
  softBox(group, [0.3, 0.075, 0.3], timber, [0, 0.0375, 0], { radius: 0.006, tile: [0.55, 0.55] });
  softBox(group, [0.22, 0.035, 0.09], timber, [0, 0.092, 0], { radius: 0.008, tile: [0.55, 0.55] });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.042, 0.14, 40), timber);
  handle.position.y = 0.165;
  handle.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.047, 40, 24), timber);
  knob.scale.y = 0.6;
  knob.position.y = 0.24;
  knob.castShadow = true;
  group.add(handle, knob);
  return group;
}

async function buildTray(kit: YardKit, look: SubstanceLook | null): Promise<THREE.Object3D> {
  const timber = await kit.library.surface("table", { normalScale: 1 });
  const group = new THREE.Group();
  const width = 0.8;
  const depth = BENCH_WIDTH - TRAY_BENCH_CLEARANCE * 2;
  const wall = 0.03;
  softBox(group, [width, 0.014, depth], timber, [0, 0.007, 0], { radius: 0.004, tile: [0.55, 0.55] });
  for (const [x, z, sx, sz] of [
    [0, -depth / 2 + wall / 2, width, wall],
    [0, depth / 2 - wall / 2, width, wall],
    [-width / 2 + wall / 2, 0, wall, depth - wall * 2 - 0.002],
    [width / 2 - wall / 2, 0, wall, depth - wall * 2 - 0.002],
  ] as const) softBox(group, [sx, 0.075, sz], timber, [x, 0.0375, z], { radius: 0.006, tile: [0.55, 0.55] });
  const pad = await kit.library.surface("weave");
  softBox(group, [width - wall * 2 - 0.004, 0.034, depth - wall * 2 - 0.004], pad, [0, 0.0315, 0], { radius: 0.008, tile: [0.27, 0.27] });
  if (look) softBox(group, [width - wall * 2 - 0.05, 0.004, depth - wall * 2 - 0.05], await substanceMaterial(kit.library, look), [0, 0.0505, 0], { radius: 0.0018, segments: 18, tile: [0.27, 0.27] });
  return group;
}

const BUILT_MODELS: Readonly<Record<string, (kit: YardKit, options: PlaceOptions) => Promise<THREE.Object3D>>> = {
  "carved-block": (kit) => buildCarvedBlock(kit),
  "printing-tray": (kit, options) => buildTray(kit, options.tray ?? null),
  "washing-paddle": (kit) => buildWashingPaddle(kit.library),
  "carving-chisels": (kit) => buildCarvingChisels(kit.library),
  "brush-and-kalam": (kit) => buildBrushAndKalam(kit.library),
};

async function stoodScan(kit: YardKit, scanId: string, height: number): Promise<THREE.Object3D> {
  const object = await kit.library.model(scanId);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const lying = size.y > size.x * 1.5 && size.y > size.z * 1.5;
  if (lying) object.rotation.z = Math.PI / 2;
  const standing = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  object.scale.setScalar(lying ? height / Math.max(standing.x, standing.z) : height / standing.y);
  const fitted = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  if (fitted.x > BENCH_CLEAR_WIDTH && fitted.x > fitted.z) object.rotation.y += Math.PI / 2;
  const turned = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  if (turned.x > BENCH_CLEAR_WIDTH) object.scale.multiplyScalar(BENCH_CLEAR_WIDTH / turned.x);
  const scaled = new THREE.Box3().setFromObject(object);
  object.position.set(-(scaled.min.x + scaled.max.x) / 2, -scaled.min.y, -(scaled.min.z + scaled.max.z) / 2);
  return object;
}

export async function placeCatalogueModel(kit: YardKit, parent: THREE.Object3D, modelId: string, x: number, y: number, z: number, options: PlaceOptions = {}): Promise<PlacedModel> {
  const build = BUILT_MODELS[modelId];
  if (build) {
    const built = await build(kit, options);
    if (modelId === "carved-block") built.rotation.y = 0.35;
    if (modelId === "printing-tray") built.rotation.y = Math.PI / 2;
    const box = new THREE.Box3().setFromObject(built);
    built.position.set(x - (box.min.x + box.max.x) / 2, y - box.min.y + 0.001, z - (box.min.z + box.max.z) / 2);
    parent.add(built);
    return { object: built, fills: [] };
  }
  const model = catalogueModel(modelId);
  const scanId = model.scan ?? "wooden_crate_01";
  const holder = new THREE.Group();
  const object = await stoodScan(kit, scanId, model.heightMetres);
  holder.add(object);
  const fills: FillAudit[] = [];
  if (options.look) {
    const closures: THREE.Object3D[] = [];
    object.traverse((node) => {
      if (/lid|latch/.test(node.name)) closures.push(node);
    });
    for (const closure of closures) closure.removeFromParent();
    const measured = await kit.library.shared(`measured:${scanId}`, () => measureObject(holder));
    fills.push(await fillVessel(kit.library, holder, scanId, options.look, measured, `fill ${options.look.key}`));
  }
  holder.position.set(x, y, z);
  parent.add(holder);
  return { object: holder, fills };
}

function solidBox(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  object.traverse((node) => {
    if (node instanceof THREE.Mesh && !(node instanceof THREE.InstancedMesh)) box.expandByObject(node, true);
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(object) : box;
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function buildYard(kit: YardKit, plan: YardPlan, files: YardFiles, stationId: string): Promise<BuiltYard> {
  const group = new THREE.Group();
  group.name = stationId;
  const registered: Registered[] = [];
  const extraSolids: CheckedSolid[] = [];
  const colliders: Box[] = [];
  const register = (name: string, role: SolidRole, object: THREE.Object3D, restsOn: readonly string[] = [], standsOnY?: number, standsWithin?: Box) => {
    object.userData.auditName = name;
    registered.push({ name, role, object, restsOn, ...(standsOnY === undefined ? {} : { standsOnY }), ...(standsWithin ? { standsWithin } : {}) });
  };
  const blockedBy = (object: THREE.Object3D) => {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    colliders.push({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] });
  };

  const [earth, brick, lime, timber, bamboo] = await Promise.all([
    kit.library.surface("earth", { antiTile: true, normalScale: 1.1, tint: [2.5, 1.62, 1.22] }),
    kit.library.surface("brick", { antiTile: true, normalScale: 1.2, tint: [1.02, 0.96, 0.92] }),
    kit.library.surface("lime", { antiTile: true, normalScale: 0.5, tint: [1.62, 1.58, 1.42] }),
    kit.library.surface("timber", { normalScale: 1 }),
    kit.bambooMaterial(),
  ]);

  const length = NEXT_YARD_OFFSET;
  const wide = YARD_HALF_WIDTH * 2 + 120;
  const opening = plan.work;
  const ground = new THREE.Mesh(groundWithOpening(wide, length, CLOTH_LINE_X, YARD_FRONT_Z - length / 2, opening, 2, CLOTH_LINE_X, opening.type === "ring" || opening.type === "tank" ? opening.z : 0), earth);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(CLOTH_LINE_X, 0, YARD_FRONT_Z - length / 2);
  ground.receiveShadow = true;
  group.add(ground);
  register("ground", "surface", ground);

  const wallSegment = (x0: number, x1: number, z0: number, z1: number, name: string, height = WALL_HEIGHT) => {
    const mesh = softBox(group, [Math.abs(x1 - x0), height, Math.abs(z1 - z0)], brick, [(x0 + x1) / 2, height / 2, (z0 + z1) / 2], { radius: 0.015, tile: [2, 2] });
    register(name, "wall", mesh);
    blockedBy(mesh);
  };
  const halfGap = GAP_WIDTH / 2;
  const left = CLOTH_LINE_X - YARD_HALF_WIDTH;
  const right = CLOTH_LINE_X + YARD_HALF_WIDTH;
  wallSegment(left, CLOTH_LINE_X - halfGap, FAR_WALL_Z - 0.15, FAR_WALL_Z + 0.15, "far wall left");
  wallSegment(CLOTH_LINE_X + halfGap, right, FAR_WALL_Z - 0.15, FAR_WALL_Z + 0.15, "far wall right");
  const sideEnd = FAR_WALL_Z - 0.15 + NEXT_YARD_OFFSET + 0.15;
  wallSegment(left - 0.3, left, FAR_WALL_Z - 0.15, sideEnd, "side wall left");
  wallSegment(right, right + 0.3, FAR_WALL_Z - 0.15, sideEnd, "side wall right");
  for (const x of [CLOTH_LINE_X - halfGap, CLOTH_LINE_X + halfGap]) {
    const pier = softBox(group, [0.42, 2.95, 0.42], brick, [x, 1.475, FAR_WALL_Z], { radius: 0.015, tile: [2, 2] });
    register(`gate pier ${x}`, "wall", pier);
    blockedBy(pier);
  }

  const shed = plan.shed;
  const shedWidth = shed.x1 - shed.x0;
  const shedCentre = (shed.x0 + shed.x1) / 2;
  const shedBody = softBox(group, [shedWidth, shed.height, 5.4], lime, [shedCentre, shed.height / 2, shed.z - 2.7], { radius: 0.02, tile: [2, 2] });
  const shedParts = ["shed", "shed parapet", "shed door backing", "shed door lintel"];
  register("shed", "structure", shedBody, shedParts);
  blockedBy(shedBody);
  const parapet = softBox(group, [shedWidth + 0.16, 0.14, 5.6], lime, [shedCentre, shed.height + 0.07, shed.z - 2.7], { radius: 0.02, tile: [2, 2] });
  register("shed parapet", "structure", parapet, shedParts);
  const dark = await kit.library.surface("timber", { normalScale: 1, tint: 0x3a2e24 });
  register("shed door backing", "structure", softBox(group, [1.42, 2.32, 0.1], dark, [shed.doorX, 1.16, shed.z + 0.02], { radius: 0.006, tile: [1.8, 1.8], cast: false }), [...shedParts, "shed door planks"]);
  const planks = new THREE.Group();
  group.add(planks);
  const doorTimber = await kit.library.surface("table", { normalScale: 1 });
  for (let i = 0; i < 5; i++) grainAlongHeight(softBox(planks, [0.242, 2.2, 0.05], doorTimber, [shed.doorX - 0.5 + i * 0.25, 1.1, shed.z + 0.09], { radius: 0.006, tile: [0.55, 0.55] }).geometry, i * DOOR_PLANK_SHIFT);
  register("shed door planks", "frame", planks, [...shedParts, "lean-to"]);
  blockedBy(planks);
  register("shed door lintel", "structure", softBox(group, [1.66, 0.16, 0.2], timber, [shed.doorX, 2.42, shed.z + 0.08], { radius: 0.012, tile: [1.8, 1.8] }), [...shedParts, "shed door planks", "lean-to"]);
  const leanStart = shed.doorX - 1.2;
  const leanTo = new THREE.Group();
  group.add(leanTo);
  for (let i = 0; i < 25; i++) pole(leanTo, [leanStart + i * 0.098, 3.18, shed.z + 0.03], [leanStart + i * 0.098, 2.48, shed.z + 2.3], 0.034, bamboo);
  for (const x of [leanStart, leanStart + 2.4]) blockedBy(pole(leanTo, [x, 0, shed.z + 2.2], [x, 2.5, shed.z + 2.2], 0.055, bamboo));
  pole(leanTo, [leanStart - 0.1, 2.47, shed.z + 2.2], [leanStart + 2.5, 2.47, shed.z + 2.2], 0.045, bamboo);
  register("lean-to", "frame", leanTo, [...shedParts, "shed door planks"]);

  for (const [i, words] of plan.words.entries()) {
    await nextTask();
    const painted = paintWords(group, words, words.maxWidth ?? null);
    if (words.maxWidth) painted.mesh.position.y = words.at[1] - painted.height / 2;
    register(`paint ${i}`, "surface", painted.mesh);
  }
  plan.curvedWords.forEach((words, i) => register(`curved paint ${i}`, "surface", paintCurved(group, words)));

  const work = plan.work;
  const fields: SolidField[] = [];
  const fills: FillAudit[] = [];
  let groundIsOpenAt: (x: number, z: number) => boolean = () => false;
  const addBath = async (held: THREE.Object3D, walls: readonly THREE.Object3D[], rimY: number, look: SubstanceLook, liquidWork: Parameters<typeof addWorkLiquid>[2]) => {
    const points = await addWorkLiquid(kit.library, held, liquidWork, look);
    let probe: VesselProbe | null = null;
    fills.push({
      name: `bath ${look.key}`,
      points: () => points,
      vertexOutside: (p) => {
        probe ??= makeVesselProbe(trianglesOf(walls, held.position), 0, 0, rimY, WORK_FLOOR_Y);
        return vertexOutsideVessel(probe, p, BATH_TUCK_METRES);
      },
      pieces: () => [],
    });
  };
  if (work.type === "ring") {
    const material = work.finish === "copper" ? await copperMaterial(kit.library) : await plasterMaterial(kit.library);
    const ring = turnedRing(work, material);
    ring.position.set(CLOTH_LINE_X, 0, work.z);
    group.add(ring);
    if (plan.workLiquid) {
      const held = new THREE.Group();
      held.position.set(CLOTH_LINE_X, 0, work.z);
      group.add(held);
      await addBath(held, [ring], work.curb, plan.workLiquid, work);
      register("bath in ring", "surface", held);
    }
    const box: Box = { min: [CLOTH_LINE_X - work.rim, 0, work.z - work.rim], max: [CLOTH_LINE_X + work.rim, work.curb, work.z + work.rim] };
    colliders.push(box);
    fields.push({
      name: "vat wall",
      depthAt: (p) => {
        const r = Math.hypot(p[0] - CLOTH_LINE_X, p[2] - work.z);
        return r > work.radius && r < work.rim && p[1] < work.curb && p[1] > -0.5 ? Math.min(work.curb - p[1], r - work.radius, work.rim - r) : 0;
      },
    });
    groundIsOpenAt = (x, z) => Math.hypot(x - CLOTH_LINE_X, z - work.z) < work.radius;
    register("work ring", "hollow", ring);
  }
  if (work.type === "tank") {
    const outerX = work.halfX + work.rim;
    const plaster = await plasterMaterial(kit.library);
    const parts: [number, number, number, number][] = [
      [CLOTH_LINE_X, work.z + work.halfZ + work.rim / 2, outerX * 2, work.rim],
      [CLOTH_LINE_X, work.z - work.halfZ - work.rim / 2, outerX * 2, work.rim],
      [CLOTH_LINE_X - work.halfX - work.rim / 2, work.z, work.rim, work.halfZ * 2 - 0.002],
      [CLOTH_LINE_X + work.halfX + work.rim / 2, work.z, work.rim, work.halfZ * 2 - 0.002],
    ];
    const curbs: THREE.Object3D[] = [];
    parts.forEach(([x, z, sx, sz], i) => {
      const mesh = softBox(group, [sx, work.curb, sz], plaster, [x, work.curb / 2, z], { radius: 0.02, tile: [2, 2] });
      register(`tank curb ${i}`, "structure", mesh, [0, 1, 2, 3].map((n) => `tank curb ${n}`));
      blockedBy(mesh);
      curbs.push(mesh);
    });
    const held = new THREE.Group();
    held.position.set(CLOTH_LINE_X, 0, work.z);
    group.add(held);
    const lining = new THREE.Group();
    held.add(lining);
    addTankLining(lining, work, plaster);
    group.updateMatrixWorld(true);
    if (plan.workLiquid) await addBath(held, [...curbs, lining], work.curb, plan.workLiquid, work);
    register("tank lining and bath", "surface", held);
    groundIsOpenAt = (x, z) => Math.abs(x - CLOTH_LINE_X) < work.halfX && Math.abs(z - work.z) < work.halfZ;
  }
  if (work.type === "table") {
    const padded = await kit.library.surface("table", { normalScale: 0.9 });
    const length2 = work.z1 - work.z0;
    const top = softBox(group, [work.width, 0.2, length2], padded, [CLOTH_LINE_X, work.top - 0.1, (work.z0 + work.z1) / 2], { radius: 0.018, tile: [0.55, 0.55] });
    register("printing table", "structure", top);
    blockedBy(top);
    let legIndex = 0;
    for (let z = work.z1 - 0.5; z > work.z0; z -= 2.5) {
      for (const a of [-1, 1]) {
        const leg = softBox(group, [0.1, work.top - 0.2, 0.1], padded, [CLOTH_LINE_X + a * (work.width / 2 - 0.1), (work.top - 0.2) / 2, z], { radius: 0.008, tile: [0.55, 0.55] });
        register(`table leg ${legIndex++}`, "frame", leg, ["printing table"]);
        blockedBy(leg);
      }
    }
    const stackMaterial = await clothMaterialFor(kit, files.clothBefore, false);
    const stack = new THREE.Group();
    group.add(stack);
    for (let i = 0; i < 6; i++) softBox(stack, [1.52 + (i % 3) * 0.03, 0.05, 0.94 + (i % 2) * 0.03], stackMaterial, [CLOTH_LINE_X, 0.028 + i * 0.056, work.stackZ], { radius: 0.024, tile: [3.46, 1.5] });
    register("folded stack", "structure", stack);
    blockedBy(stack);
  }

  const postRadius = 0.065;
  let framePart = 0;
  const framePole = (from: readonly [number, number, number], to: readonly [number, number, number], radius: number, joins: readonly string[]) => {
    const part = pole(group, from, to, radius, bamboo);
    register(`frame part ${framePart++}`, "pole", part, joins);
    blockedBy(part);
  };
  for (const z of plan.rails) {
    const first = framePart;
    framePole([CLOTH_LINE_X - 1.15, RAIL_HEIGHT, z], [CLOTH_LINE_X + 1.15, RAIL_HEIGHT, z], 0.05, [`frame part ${first + 1}`, `frame part ${first + 2}`]);
    for (const a of [-1, 1]) framePole([CLOTH_LINE_X + a * 1.15, 0, z], [CLOTH_LINE_X + a * 1.15, RAIL_HEIGHT + 0.3, z], postRadius, [`frame part ${first}`]);
  }
  const railsForCheck = plan.rails;
  fields.push({
    name: "rail or post",
    depthAt: (p) => {
      let deepest = 0;
      for (const z of railsForCheck) {
        if (Math.abs(p[0] - CLOTH_LINE_X) <= 1.15) deepest = Math.max(deepest, 0.05 - Math.hypot(p[1] - RAIL_HEIGHT, p[2] - z));
        for (const a of [-1, 1]) if (p[1] < RAIL_HEIGHT + 0.3) deepest = Math.max(deepest, postRadius - Math.hypot(p[0] - (CLOTH_LINE_X + a * 1.15), p[2] - z));
      }
      return deepest;
    },
  });
  if (plan.tie) {
    const tieTimber = await kit.library.surface("table", { normalScale: 0.9 });
    const tie = softBox(group, [TIE_BOARD_THICKNESS, 0.22, plan.tie.z1 - plan.tie.z0], tieTimber, [plan.tie.x, plan.tie.y, (plan.tie.z0 + plan.tie.z1) / 2], { radius: 0.008, tile: [0.55, 0.55] });
    register("cloth tie", "frame", tie);
    blockedBy(tie);
  }

  const clay = await kit.library.surface("brick", { normalScale: 1.1, tint: [1, 0.92, 0.86] });
  const brickGeometry = softBoxGeometry(0.23, 0.085, 0.11, 0.012, 1, [0.5, 0.25]);
  if (plan.pins.length > 0) {
    const firedClay = await kit.library.surface("lime", { normalScale: 1.4, tint: [0.92, 0.42, 0.26] });
    const bricks = new THREE.InstancedMesh(brickGeometry, firedClay, plan.pins.length);
    const placement = new THREE.Object3D();
    plan.pins.forEach(([x, z], i) => {
      placement.position.set(x, 0.064, z);
      placement.rotation.y = ((i * 2.39) % 3) - 1.5;
      placement.updateMatrix();
      bricks.setMatrixAt(i, placement.matrix);
      const reach = 0.128;
      extraSolids.push({ name: `brick pin ${i}`, role: "object", box: { min: [x - reach, 0.0215, z - reach], max: [x + reach, 0.1065, z + reach] }, restsOn: [], planted: false });
    });
    bricks.castShadow = bricks.receiveShadow = true;
    group.add(bricks);
    register("brick pins", "surface", bricks);
  }

  for (const [itemIndex, placed] of plan.items.entries()) {
    await nextTask();
    const plank = softBox(group, [BENCH_WIDTH, 0.1, placed.benchLength], timber, [placed.x, 0.33, placed.z], { radius: 0.012, tile: [1.8, 1.8] });
    const name = `bench ${placed.item.key}`;
    const looks: readonly (SubstanceLook | null)[] = placed.looks.length > 0 ? placed.looks : [null];
    const itemNames = looks.map((_, i) => `item ${placed.item.key} ${i}`);
    register(name, "structure", plank, [`${name} leg 0`, `${name} leg 1`, ...itemNames]);
    blockedBy(plank);
    [-placed.benchLength / 2 + 0.17, placed.benchLength / 2 - 0.17].forEach((a, i) => {
      const leg = softBox(group, [0.36, 0.28, 0.24], clay, [placed.x, 0.14, placed.z + a], { radius: 0.014, tile: [2, 2] });
      register(`${name} leg ${i}`, "structure", leg, [name]);
    });
    const models: PlacedModel[] = [];
    for (const look of looks) models.push(await placeCatalogueModel(kit, group, look?.vesselModelId ?? placed.item.modelId, placed.x, BENCH_TOP, placed.z, { look, tray: plan.trayLook }));
    const depths = models.map(({ object }) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).z);
    const span = depths.reduce((sum, depth) => sum + depth, 0) + BENCH_ITEM_GAP * (models.length - 1);
    let cursor = placed.z - span / 2;
    models.forEach(({ object, fills: held }, i) => {
      if (models.length > 1) object.position.z += cursor + depths[i]! / 2 - placed.z;
      cursor += depths[i]! + BENCH_ITEM_GAP;
      register(itemNames[i]!, "object", object, [name, `${name} leg 0`, `${name} leg 1`], BENCH_TOP, { min: [placed.x - BENCH_WIDTH / 2, 0, placed.z - placed.benchLength / 2], max: [placed.x + BENCH_WIDTH / 2, 1, placed.z + placed.benchLength / 2] });
      blockedBy(object);
      fills.push(...held);
    });
    if (placed.benchLabel) register(`bench paint ${itemIndex}`, "surface", paintWords(group, placed.benchLabel).mesh);
  }

  for (const textile of files.textiles ?? []) {
    await nextTask();
    const hanging = new THREE.PlaneGeometry(textile.width, textile.height, 96, 48);
    const position = hanging.attributes.position!;
    for (let i = 0; i < position.count; i++) {
      const across = position.getX(i) / textile.width;
      const down = (textile.height / 2 - position.getY(i)) / textile.height;
      position.setZ(i, 0.03 * Math.min(1, 0.25 + down * 1.4) * (Math.sin(across * Math.PI * 6 + 1.1 + down * 0.9) + 0.45 * Math.sin(across * Math.PI * 12.6 + down * 2.3)));
    }
    hanging.computeVertexNormals();
    const sheet = new THREE.Mesh(hanging, await kit.library.textileMaterial(textile.file, textile.width, textile.height));
    sheet.position.set(textile.x, 4.42 - textile.height / 2, textile.z);
    sheet.castShadow = sheet.receiveShadow = true;
    group.add(sheet);
    register(`textile ${textile.name} ${textile.x}`, "textile", sheet);
    blockedBy(sheet);
    const half = textile.width / 2 + 0.22;
    const rail = pole(group, [textile.x - half, 4.47, textile.z], [textile.x + half, 4.47, textile.z], 0.045, bamboo);
    const postA = pole(group, [textile.x - half, 0, textile.z], [textile.x - half, 4.72, textile.z], 0.06, bamboo);
    const postB = pole(group, [textile.x + half, 0, textile.z], [textile.x + half, 4.72, textile.z], 0.06, bamboo);
    const board = softBox(group, [half * 2 - 0.14, 0.26, 0.04], timber, [textile.x, 0.56, textile.z + 0.075], { radius: 0.008, tile: [1.8, 1.8] });
    const frameName = (part: number) => `frame ${textile.x} ${textile.z} ${part}`;
    register(frameName(0), "pole", rail, [frameName(1), frameName(2)]);
    register(frameName(1), "pole", postA, [frameName(0)]);
    register(frameName(2), "pole", postB, [frameName(0)]);
    register(frameName(3), "frame", board);
    for (const part of [postA, postB, board]) blockedBy(part);
    register(`textile paint ${textile.name} ${textile.x}`, "surface", paintWords(group, textile.label).mesh);
  }

  const before = await clothMaterialFor(kit, files.clothBefore, false);
  const after = await clothMaterialFor(kit, files.clothAfter, files.wetAfter);
  if ((work.type === "ring" || work.type === "tank") && plan.workLiquid) {
    const seesThrough = plan.workLiquid.transparency === "clear";
    const bath = { level: work.level, bodyDepth: seesThrough ? 0 : BATH_BODY_DEPTH_METRES, body: displayAlbedo(plan.workLiquid.renderHex) };
    const earlierRepeat: readonly [number, number] = [before.map!.repeat.x, before.map!.repeat.y];
    const joinAlong = plan.cloth[0]!.surface.endAlong;
    dipInBath(before, { ...bath, earlier: null, earlierRepeat, joinAlong: null });
    dipInBath(after, { ...bath, earlier: before.map, earlierRepeat, joinAlong });
  }
  const clothMeshes: ClothMesh[] = [];
  for (const piece of plan.cloth) {
    await nextTask();
    const mesh = new THREE.Mesh(clothGeometry(piece.surface), piece.state === "before" ? before : after);
    mesh.customDepthMaterial = await kit.library.shared("cloth-shadow", async () => dryClothShadowMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    register(piece.name, "surface", mesh);
    clothMeshes.push({ name: piece.name, positions: piece.surface.positions, indices: piece.surface.indices });
    colliders.push(...clothBodyBoxes(piece.surface));
  }

  const audit = (): YardAudit => {
    group.updateWorldMatrix(true, true);
    const covered = new Set<THREE.Object3D>();
    for (const entry of registered) entry.object.traverse((node) => covered.add(node));
    const unchecked: string[] = [];
    group.traverse((node) => {
      if (node instanceof THREE.Mesh && !covered.has(node)) unchecked.push(((node.material as THREE.Material).userData.surface as { label?: string } | undefined)?.label ?? node.type);
    });
    return {
      solids: [
        ...registered.map((entry): CheckedSolid => {
          const box = solidBox(entry.object);
          const min: Vec3 = [box.min.x, entry.role === "hollow" ? Math.max(0, box.min.y) : box.min.y, box.min.z];
          const max: Vec3 = [box.max.x, box.max.y, box.max.z];
          return { name: entry.name, role: entry.role, box: { min, max }, restsOn: entry.restsOn, planted: false, ...(entry.standsOnY === undefined ? {} : { standsOnY: entry.standsOnY }), ...(entry.standsWithin ? { standsWithin: entry.standsWithin } : {}) };
        }),
        ...extraSolids,
      ],
      cloths: clothMeshes,
      fields,
      fills,
      groundIsOpenAt,
      unchecked,
    };
  };
  return { group, audit, colliders };
}

export function releaseYard(kit: YardKit, group: THREE.Object3D): void {
  const { library } = kit;
  group.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node instanceof THREE.InstancedMesh) node.dispose();
    if (!library.keeps(node.geometry)) node.geometry.dispose();
    const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (library.keeps(material)) continue;
      for (const value of Object.values(material)) if (value instanceof THREE.Texture && !library.keeps(value)) value.dispose();
      material.dispose();
    }
  });
}
