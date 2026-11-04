import * as THREE from "three";
import { catalogueModel } from "@/features/process/domain/asset-catalogue";
import type { ClothSurface } from "../domain/cloth-surface";
import { FAR_WALL_Z, GAP_WIDTH, CLOTH_LINE_X, NEXT_YARD_OFFSET, RAIL_HEIGHT, WALL_HEIGHT, YARD_FRONT_Z, YARD_HALF_WIDTH, type PaintedWords, type YardPlan } from "../domain/yard-plan";
import type { SubstanceLook } from "@/features/process/domain/substance-look";
import type { CheckedSolid, ClothMesh, FillAudit, SolidField, SolidRole } from "../domain/scene-check";
import type { Box, Vec3 } from "../domain/geometry";
import type { MaterialLibrary } from "./material-library";
import { buildBrushAndKalam, buildCarvingChisels, buildWashingPaddle } from "./built-tools";
import { paintCurved, paintWords, pole, softBox, softBoxGeometry } from "./solid-builders";
import { fillVessel, measureObjectProfile } from "./substance-fill";
import { substanceMaterial } from "./substance-materials";
import { addTankLining, addWorkLiquid, copperMaterial, groundWithOpening, plasterMaterial, turnedRing } from "./work-structures";

export interface BuiltYard {
  readonly group: THREE.Group;
  readonly audit: () => { solids: CheckedSolid[]; cloths: ClothMesh[]; fields: SolidField[]; fills: FillAudit[]; groundIsOpenAt: (x: number, z: number) => boolean };
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
  readonly planted: boolean;
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

function blockFace(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2048;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#2b1d12";
  context.fillRect(0, 0, 2048, 2048);
  context.strokeStyle = "#c8a074";
  context.lineWidth = 22;
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      const cx = 256 + column * 512;
      const cy = 256 + row * 512;
      for (const radius of [190, 90]) {
        context.beginPath();
        context.arc(cx, cy, radius, 0, 7);
        context.stroke();
      }
      for (let spoke = 0; spoke < 8; spoke++) {
        const angle = spoke * 0.785;
        context.beginPath();
        context.moveTo(cx + Math.cos(angle) * 104, cy + Math.sin(angle) * 104);
        context.lineTo(cx + Math.cos(angle) * 176, cy + Math.sin(angle) * 176);
        context.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  return texture;
}

const BENCH_CLEAR_WIDTH = 0.44;
const BENCH_TOP = 0.38;
const BENCH_ITEM_GAP = 0.05;

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
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.285, 0.285), new THREE.MeshStandardMaterial({ map: blockFace(), roughness: 0.8 }));
  face.rotation.x = Math.PI / 2;
  face.position.y = -0.0005;
  group.add(face);
  softBox(group, [0.22, 0.035, 0.09], timber, [0, 0.092, 0], { radius: 0.008, tile: [0.55, 0.55] });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.042, 0.14, 28), timber);
  handle.position.y = 0.165;
  handle.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.047, 28, 18), timber);
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
  const depth = 0.56;
  const wall = 0.03;
  softBox(group, [width, 0.014, depth], timber, [0, 0.007, 0], { radius: 0.004, tile: [0.55, 0.55] });
  for (const [x, z, sx, sz] of [
    [0, -depth / 2 + wall / 2, width, wall],
    [0, depth / 2 - wall / 2, width, wall],
    [-width / 2 + wall / 2, 0, wall, depth - wall * 2],
    [width / 2 - wall / 2, 0, wall, depth - wall * 2],
  ] as const) softBox(group, [sx, 0.075, sz], timber, [x, 0.0375, z], { radius: 0.006, tile: [0.55, 0.55] });
  const pad = look ? await substanceMaterial(kit.library, look) : new THREE.MeshStandardMaterial({ map: (await kit.library.scan("weave")).colour, roughness: 0.95 });
  softBox(group, [width - wall * 2 - 0.004, 0.034, depth - wall * 2 - 0.004], pad, [0, 0.031, 0], { radius: 0.008, segments: 4, tile: [0.27, 0.27] });
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
    const profile = await kit.library.shared(`profile:${scanId}`, () => measureObjectProfile(holder));
    fills.push(await fillVessel(kit.library, holder, scanId, options.look, profile, `fill ${options.look.key}`));
  }
  holder.position.set(x, y, z);
  parent.add(holder);
  return { object: holder, fills };
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function buildYard(kit: YardKit, plan: YardPlan, files: YardFiles, stationId: string): Promise<BuiltYard> {
  const group = new THREE.Group();
  group.name = stationId;
  const registered: Registered[] = [];
  const colliders: Box[] = [];
  const register = (name: string, role: SolidRole, object: THREE.Object3D, restsOn: readonly string[] = [], planted = false) => registered.push({ name, role, object, restsOn, planted });
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

  const wallSegment = (x0: number, x1: number, z0: number, z1: number, name: string, height = WALL_HEIGHT) => {
    const mesh = softBox(group, [Math.abs(x1 - x0), height, Math.abs(z1 - z0)], brick, [(x0 + x1) / 2, height / 2, (z0 + z1) / 2], { radius: 0.015, segments: 3, tile: [2, 2] });
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
    const pier = softBox(group, [0.42, 2.95, 0.42], brick, [x, 1.475, FAR_WALL_Z], { radius: 0.015, segments: 3, tile: [2, 2] });
    register(`gate pier ${x}`, "wall", pier);
    blockedBy(pier);
  }

  const shed = plan.shed;
  const shedWidth = shed.x1 - shed.x0;
  const shedCentre = (shed.x0 + shed.x1) / 2;
  const shedBody = softBox(group, [shedWidth, shed.height, 5.4], lime, [shedCentre, shed.height / 2, shed.z - 2.7], { radius: 0.02, segments: 3, tile: [1, 1] });
  register("shed", "structure", shedBody);
  blockedBy(shedBody);
  const parapet = softBox(group, [shedWidth + 0.16, 0.14, 5.6], lime, [shedCentre, shed.height + 0.07, shed.z - 2.7], { radius: 0.02, segments: 3, tile: [1, 1] });
  register("shed parapet", "structure", parapet, ["shed"]);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d140d, roughness: 0.9 });
  softBox(group, [1.42, 2.32, 0.1], dark, [shed.doorX, 1.16, shed.z + 0.02], { radius: 0.006, cast: false });
  for (let i = 0; i < 5; i++) softBox(group, [0.242, 2.2, 0.05], timber, [shed.doorX - 0.5 + i * 0.25, 1.1, shed.z + 0.09], { radius: 0.006, tile: [1.8, 1.8] });
  softBox(group, [1.66, 0.16, 0.2], timber, [shed.doorX, 2.42, shed.z + 0.08], { radius: 0.012, tile: [1.8, 1.8] });
  const leanStart = shed.doorX - 1.2;
  for (let i = 0; i < 25; i++) pole(group, [leanStart + i * 0.098, 3.18, shed.z + 0.03], [leanStart + i * 0.098, 2.48, shed.z + 2.3], 0.034, bamboo);
  for (const x of [leanStart, leanStart + 2.4]) pole(group, [x, 0, shed.z + 2.2], [x, 2.5, shed.z + 2.2], 0.055, bamboo);
  pole(group, [leanStart - 0.1, 2.47, shed.z + 2.2], [leanStart + 2.5, 2.47, shed.z + 2.2], 0.045, bamboo);

  for (const words of plan.words) {
    await nextTask();
    const painted = paintWords(group, words, words.maxWidth ?? null);
    if (words.maxWidth) painted.mesh.position.y = words.at[1] - painted.height / 2;
  }
  for (const words of plan.curvedWords) paintCurved(group, words);

  const work = plan.work;
  const fields: SolidField[] = [];
  const fills: FillAudit[] = [];
  let groundIsOpenAt: (x: number, z: number) => boolean = () => false;
  if (work.type === "ring") {
    const material = work.finish === "copper" ? await copperMaterial(kit.library) : await plasterMaterial(kit.library);
    const ring = turnedRing(work, material);
    ring.position.set(CLOTH_LINE_X, 0, work.z);
    group.add(ring);
    if (plan.workLiquid) {
      const held = new THREE.Group();
      held.position.set(CLOTH_LINE_X, 0, work.z);
      group.add(held);
      await addWorkLiquid(kit.library, held, work, plan.workLiquid);
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
      [CLOTH_LINE_X - work.halfX - work.rim / 2, work.z, work.rim, work.halfZ * 2],
      [CLOTH_LINE_X + work.halfX + work.rim / 2, work.z, work.rim, work.halfZ * 2],
    ];
    parts.forEach(([x, z, sx, sz], i) => {
      const mesh = softBox(group, [sx, work.curb, sz], plaster, [x, work.curb / 2, z], { radius: 0.02, segments: 3, tile: [1, 1] });
      register(`tank curb ${i}`, "structure", mesh, [0, 1, 2, 3].map((n) => `tank curb ${n}`));
      blockedBy(mesh);
    });
    const held = new THREE.Group();
    held.position.set(CLOTH_LINE_X, 0, work.z);
    group.add(held);
    addTankLining(held, work, plaster);
    if (plan.workLiquid) await addWorkLiquid(kit.library, held, work, plan.workLiquid);
    groundIsOpenAt = (x, z) => Math.abs(x - CLOTH_LINE_X) < work.halfX && Math.abs(z - work.z) < work.halfZ;
  }
  if (work.type === "table") {
    const padded = await kit.library.surface("table", { normalScale: 0.9 });
    const length2 = work.z1 - work.z0;
    const top = softBox(group, [work.width, 0.2, length2], padded, [CLOTH_LINE_X, work.top - 0.1, (work.z0 + work.z1) / 2], { radius: 0.018, segments: 3, tile: [0.55, 0.55] });
    register("printing table", "structure", top);
    blockedBy(top);
    let legIndex = 0;
    for (let z = work.z1 - 0.5; z > work.z0; z -= 2.5) {
      for (const a of [-1, 1]) {
        const leg = softBox(group, [0.1, work.top - 0.2, 0.1], timber, [CLOTH_LINE_X + a * (work.width / 2 - 0.1), (work.top - 0.2) / 2, z], { radius: 0.008, tile: [1.8, 1.8] });
        register(`table leg ${legIndex++}`, "frame", leg, ["printing table"]);
      }
    }
    const stackMaterial = await clothMaterialFor(kit, files.clothBefore, false);
    for (let i = 0; i < 6; i++) softBox(group, [1.52 + (i % 3) * 0.03, 0.05, 0.94 + (i % 2) * 0.03], stackMaterial, [CLOTH_LINE_X, 0.028 + i * 0.056, work.stackZ], { radius: 0.024, segments: 4, tile: [3.46, 1.5] });
  }

  const postRadius = 0.065;
  const frameObjects: THREE.Object3D[] = [];
  for (const z of [...plan.rails, FAR_WALL_Z - 9]) {
    if (z < FAR_WALL_Z - 1) continue;
    frameObjects.push(pole(group, [CLOTH_LINE_X - 1.15, RAIL_HEIGHT, z], [CLOTH_LINE_X + 1.15, RAIL_HEIGHT, z], 0.05, bamboo));
    for (const a of [-1, 1]) frameObjects.push(pole(group, [CLOTH_LINE_X + a * 1.15, 0, z], [CLOTH_LINE_X + a * 1.15, RAIL_HEIGHT + 0.3, z], postRadius, bamboo));
  }
  frameObjects.forEach((object, i) => register(`frame part ${i}`, "frame", object, ["cloth tie"]));
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
    const tie = softBox(group, [0.05, 0.22, plan.tie.z1 - plan.tie.z0], timber, [plan.tie.x, plan.tie.y, (plan.tie.z0 + plan.tie.z1) / 2], { radius: 0.008, tile: [1.8, 1.8] });
    register("cloth tie", "frame", tie);
  }

  const clay = await kit.library.surface("brick", { normalScale: 1.1, tint: [1, 0.92, 0.86] });
  const brickGeometry = softBoxGeometry(0.23, 0.085, 0.11, 0.012, 3, [0.5, 0.25]);
  if (plan.pins.length > 0) {
    const firedClay = await kit.library.surface("lime", { normalScale: 1.4, tint: [0.92, 0.42, 0.26] });
    const bricks = new THREE.InstancedMesh(brickGeometry, firedClay, plan.pins.length);
    const placement = new THREE.Object3D();
    plan.pins.forEach(([x, z], i) => {
      placement.position.set(x, 0.064, z);
      placement.rotation.y = ((i * 2.39) % 3) - 1.5;
      placement.updateMatrix();
      bricks.setMatrixAt(i, placement.matrix);
    });
    bricks.castShadow = bricks.receiveShadow = true;
    group.add(bricks);
  }

  for (const placed of plan.items) {
    await nextTask();
    const plank = softBox(group, [0.5, 0.1, placed.benchLength], timber, [placed.x, 0.33, placed.z], { radius: 0.012, tile: [1.8, 1.8] });
    const name = `bench ${placed.item.key}`;
    const looks: readonly (SubstanceLook | null)[] = placed.looks.length > 0 ? placed.looks : [null];
    const itemNames = looks.map((_, i) => `item ${placed.item.key} ${i}`);
    register(name, "structure", plank, [`${name} leg 0`, `${name} leg 1`, ...itemNames]);
    blockedBy(plank);
    [-placed.benchLength / 2 + 0.17, placed.benchLength / 2 - 0.17].forEach((a, i) => {
      const leg = softBox(group, [0.36, 0.28, 0.24], clay, [placed.x, 0.14, placed.z + a], { radius: 0.014, segments: 3, tile: [0.8, 0.8] });
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
      register(itemNames[i]!, "object", object, [name, `${name} leg 0`, `${name} leg 1`]);
      fills.push(...held);
    });
    if (placed.benchLabel) paintWords(group, placed.benchLabel);
  }

  for (const textile of files.textiles ?? []) {
    await nextTask();
    const photo = await kit.library.photo(textile.file);
    const hanging = new THREE.PlaneGeometry(textile.width, textile.height, 96, 48);
    const position = hanging.attributes.position!;
    for (let i = 0; i < position.count; i++) {
      const across = position.getX(i) / textile.width;
      const down = (textile.height / 2 - position.getY(i)) / textile.height;
      position.setZ(i, 0.03 * Math.min(1, 0.25 + down * 1.4) * (Math.sin(across * Math.PI * 6 + 1.1 + down * 0.9) + 0.45 * Math.sin(across * Math.PI * 12.6 + down * 2.3)));
    }
    hanging.computeVertexNormals();
    const sheet = new THREE.Mesh(hanging, new THREE.MeshStandardMaterial({ map: photo, side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.3 }));
    sheet.position.set(textile.x, 4.42 - textile.height / 2, textile.z);
    sheet.castShadow = sheet.receiveShadow = true;
    group.add(sheet);
    register(`textile ${textile.name} ${textile.x}`, "textile", sheet);
    const half = textile.width / 2 + 0.22;
    const rail = pole(group, [textile.x - half, 4.47, textile.z], [textile.x + half, 4.47, textile.z], 0.045, bamboo);
    const postA = pole(group, [textile.x - half, 0, textile.z], [textile.x - half, 4.72, textile.z], 0.06, bamboo);
    const postB = pole(group, [textile.x + half, 0, textile.z], [textile.x + half, 4.72, textile.z], 0.06, bamboo);
    const board = softBox(group, [half * 2 - 0.14, 0.26, 0.04], timber, [textile.x, 0.56, textile.z + 0.075], { radius: 0.008, tile: [1.8, 1.8] });
    for (const [i, part] of [rail, postA, postB, board].entries()) register(`frame ${textile.x} ${textile.z} ${i}`, "frame", part);
    blockedBy(board);
    paintWords(group, textile.label);
  }

  const before = await clothMaterialFor(kit, files.clothBefore, false);
  const after = await clothMaterialFor(kit, files.clothAfter, files.wetAfter);
  const clothMeshes: ClothMesh[] = [];
  for (const piece of plan.cloth) {
    await nextTask();
    const mesh = new THREE.Mesh(clothGeometry(piece.surface), piece.state === "before" ? before : after);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    clothMeshes.push({ name: piece.name, positions: piece.surface.positions, indices: piece.surface.indices });
  }

  const audit = () => ({
    solids: registered.map((entry): CheckedSolid => {
      entry.object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(entry.object);
      const min: Vec3 = [box.min.x, entry.role === "hollow" ? Math.max(0, box.min.y) : box.min.y, box.min.z];
      const max: Vec3 = [box.max.x, box.max.y, box.max.z];
      return { name: entry.name, role: entry.role, box: { min, max }, restsOn: entry.restsOn, planted: entry.planted };
    }),
    cloths: clothMeshes,
    fields,
    fills,
    groundIsOpenAt,
  });
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
