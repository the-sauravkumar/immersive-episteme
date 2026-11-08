import * as THREE from "three";
import { ASSET_CATALOGUE, clothStatePath, stillPath } from "@/features/process/domain/asset-catalogue";
import { PRACTICE_MODEL } from "@/features/course/domain/panel-model";
import ajrakh from "../../content/study/ajrakh.template.json";
import sanganeri from "../../content/study/sanganeri.template.json";
import kalamkari from "../../content/study/machilipatnam-kalamkari.template.json";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { checkScene } from "@/features/walkthrough/domain/scene-check";
import { topRenderScale } from "@/features/walkthrough/domain/render-scale";
import { buildRoute, practiceStation } from "@/features/walkthrough/domain/route-plan";
import { buildYardPlan, CLOTH_LINE_X, NEXT_YARD_OFFSET, YARD_FRONT_Z, YARD_HALF_WIDTH, type YardPlan } from "@/features/walkthrough/domain/yard-plan";
import type { Box } from "@/features/walkthrough/domain/geometry";
import { reachField, type ReachField } from "@/features/walkthrough/domain/reach";
import { rankWorstFirst, tearingFailures } from "@/features/walkthrough/domain/surface-density";
import { measureTearing, objectParts, reachOfParts, surfaceRows } from "./surface-audit";
import { looksOfItem, stageItemStillPath, trayPadLookOf, workLiquidOf, type SubstanceLook } from "@/features/process/domain/substance-look";
import { easeYaw, moveTowards, steerAlong, stepWalker, walkerAt, type WalkTarget, type Walker } from "@/features/walkthrough/domain/walk-state";
import { buildEntrance } from "@/features/walkthrough/infrastructure/build-entrance";
import { buildYard, YardKit, type BuiltYard, type YardTextile } from "@/features/walkthrough/infrastructure/build-yard";
import { buildStillSubject } from "@/features/walkthrough/infrastructure/build-still";
import { addHorizon } from "@/features/walkthrough/infrastructure/horizon";
import { MaterialLibrary } from "@/features/walkthrough/infrastructure/material-library";
import { paintWordsInTurn } from "@/features/walkthrough/infrastructure/solid-builders";
import { setLiquidTime } from "@/features/walkthrough/infrastructure/substance-materials";
import { addSun, CAMERA_NEAR_METRES, createRenderer, createRenderView } from "@/features/walkthrough/infrastructure/render-view";

const TEMPLATES: Record<string, StageTemplate> = { ajrakh: ajrakh as StageTemplate, sanganeri: sanganeri as StageTemplate, kalamkari: kalamkari as unknown as StageTemplate };

const query = new URLSearchParams(location.search);
const sceneName = query.get("s") ?? "route";
await Promise.all(["800 40px Eczar", "700 40px Eczar", "600 40px Eczar", "600 40px Mukta"].map((font) => document.fonts.load(font)));
const renderer = createRenderer(document.body, innerWidth, innerHeight, topRenderScale(devicePixelRatio));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfe4e6, 60, 420);
const library = new MaterialLibrary(renderer);
const kit = new YardKit(library);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, CAMERA_NEAR_METRES, 1200);
const win = window as unknown as Record<string, unknown>;
let audit: BuiltYard["audit"] | null = null;
let walkPlan: YardPlan | null = null;
let walkColliders: BuiltYard["colliders"] | null = null;
let planForCheck: YardPlan | null = null;
let view: { from: readonly number[]; to: readonly number[] };
let auditRoot: THREE.Object3D | null = null;
let auditColliders: readonly Box[] = [];
let auditSeed: readonly [number, number] = [0, 0];
let auditArea = { minX: CLOTH_LINE_X - YARD_HALF_WIDTH - 1, maxX: CLOTH_LINE_X + YARD_HALF_WIDTH + 1, minZ: YARD_FRONT_Z - NEXT_YARD_OFFSET, maxZ: YARD_FRONT_Z + 2 };

const PLANTED_POKE_METRES = 0.06;
const STILL_FOV_DEGREES = 24;
const STILL_FILLS_FRAME = 0.8;
const STILL_POINTS_PER_MESH = 3000;
const STILL_CAMERA_DIRECTION = new THREE.Vector3(0.6, 0.72, 0.7).normalize();

function visiblePoints(subject: THREE.Object3D): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  subject.updateWorldMatrix(true, true);
  subject.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node instanceof THREE.InstancedMesh) {
      const box = new THREE.Box3().setFromObject(node);
      for (let bit = 0; bit < 8; bit++) points.push(new THREE.Vector3(bit & 1 ? box.max.x : box.min.x, Math.max(0, bit & 2 ? box.max.y : box.min.y), bit & 4 ? box.max.z : box.min.z));
      return;
    }
    const position = (node.geometry as THREE.BufferGeometry).attributes.position!;
    const stride = Math.max(1, Math.floor(position.count / STILL_POINTS_PER_MESH));
    for (let i = 0; i < position.count; i += stride) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld);
      if (point.y >= 0) points.push(point);
    }
  });
  return points;
}

function fitStillView(subject: THREE.Object3D, bounds: THREE.Box3, lens: THREE.PerspectiveCamera, direction: THREE.Vector3): { from: readonly number[]; to: readonly number[] } {
  const points = visiblePoints(subject);
  const target = bounds.getCenter(new THREE.Vector3());
  let distance = bounds.getSize(new THREE.Vector3()).length() * 4;
  for (let round = 0; round < 12; round++) {
    lens.position.copy(target).addScaledVector(direction, distance);
    lens.lookAt(target);
    lens.updateMatrixWorld();
    const projected = points.map((point) => point.clone().project(lens));
    const spanOf = (axis: "x" | "y") => projected.reduce(([low, high], p) => [Math.min(low, p[axis]), Math.max(high, p[axis])] as const, [Infinity, -Infinity] as const);
    const [minX, maxX] = spanOf("x");
    const [minY, maxY] = spanOf("y");
    const right = new THREE.Vector3().setFromMatrixColumn(lens.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(lens.matrixWorld, 1);
    const halfHeight = Math.tan((lens.fov * Math.PI) / 360) * distance;
    target.addScaledVector(right, ((minX + maxX) / 2) * halfHeight * lens.aspect).addScaledVector(up, ((minY + maxY) / 2) * halfHeight);
    distance *= Math.max((maxX - minX) / 2, (maxY - minY) / 2) / STILL_FILLS_FRAME;
  }
  lens.position.copy(target).addScaledVector(direction, distance);
  return { from: lens.position.toArray(), to: target.toArray() };
}

if (sceneName === "still") {
  const modelId = query.get("m") ?? ASSET_CATALOGUE[0]!.id;
  const looksOfStill = (): readonly SubstanceLook[] => {
    const stageKey = query.get("stage");
    const label = query.get("item");
    if (!stageKey || !label) return [];
    const trialFill = query.get("fill") as SubstanceLook["fill"] | null;
    const trialSurface = query.get("surface");
    return looksOfItem(stageKey, { label, role: "material" }).map((look) => ({ ...look, ...(trialFill ? { fill: trialFill } : {}), ...(trialSurface ? { surface: trialSurface } : {}) }));
  };
  const liquidOfStill = (): SubstanceLook | null => {
    const stageKey = query.get("stage");
    if (!stageKey) return null;
    const template = Object.values(TEMPLATES).find((candidate) => candidate.stages.some((stage) => stage.key === stageKey));
    const stage = template?.stages.find((candidate) => candidate.key === stageKey);
    return stage ? workLiquidOf(stageKey, stage.items) : null;
  };
  scene.fog = null;
  await library.sky(scene, renderer);
  scene.background = null;
  const stillStage = query.get("stage");
  const subject = await buildStillSubject(kit, { modelId, looks: looksOfStill(), liquid: liquidOfStill(), tray: stillStage ? trayPadLookOf(stillStage) : null });
  scene.add(subject.group);
  const sun = addSun(scene, new THREE.Vector3(0, 0, 0));
  sun.shadow.camera.left = sun.shadow.camera.bottom = -subject.radius * 2.5;
  sun.shadow.camera.right = sun.shadow.camera.top = subject.radius * 2.5;
  sun.shadow.camera.near = 30;
  sun.shadow.camera.far = 62;
  sun.shadow.camera.updateProjectionMatrix();
  camera.fov = STILL_FOV_DEGREES;
  camera.updateProjectionMatrix();
  view = fitStillView(subject.group.children[0]!, subject.bounds, camera, STILL_CAMERA_DIRECTION);
} else {
  const sky = await library.sky(scene, renderer);
  addHorizon(scene, (await library.scan("earth")).colour, await library.horizonScrub());
  addSun(scene, new THREE.Vector3(1, 0, -2));
  if (sceneName === "entrance") {
    const open = (query.get("open") ?? "none") as "none" | "door-1" | "door-2";
    const entrance = await buildEntrance(kit, { open, openness: Number(query.get("t") ?? 1), door1View: "/walkthrough/stills/door1-first-panel.jpg", door2View: "/walkthrough/stills/practice-view.jpg" });
    scene.add(entrance.group);
    view = query.get("v") === "near" ? { from: [0.9, 1.6, 3.8], to: [3.3, 1.55, -4.5] } : { from: [-6.4, 1.6, 8.6], to: [1.6, 2.3, -4.5] };
    audit = () => ({ solids: entrance.solids(), cloths: entrance.cloths, fields: [...entrance.fields], fills: [], groundIsOpenAt: () => false, unchecked: entrance.unchecked() });
    auditRoot = entrance.group;
    auditColliders = entrance.colliders;
    auditSeed = [view.from[0]!, view.from[2]!];
    auditArea = { minX: -30, maxX: 30, minZ: -4, maxZ: 30 };
    planForCheck = buildYardPlan({ number: 0, name: "", localName: null, caption: "", kind: "dry", items: [], next: null, index: 0 });
  } else {
    let plan: YardPlan;
    let textiles: YardTextile[] = [];
    let before = "raw-cotton";
    let after = "raw-cotton";
    let wet = false;
    const routed = query.get("t");
    if (routed) {
      const route = buildRoute(TEMPLATES[routed]!, clothStatePath);
      const station = route[Number(query.get("n") ?? 0)]!;
      plan = station.plan;
      before = station.clothBefore;
      after = station.clothAfter;
      wet = station.wetAfter;
      textiles = station.textiles.map((placed) => ({ file: placed.product.file, name: placed.product.id, x: placed.x, z: placed.z, width: placed.width, height: placed.height, label: placed.label }));
    } else {
      plan = practiceStation().plan;
    }
    planForCheck = plan;
    const built = await buildYard(kit, plan, { clothBefore: before, clothAfter: after, wetAfter: wet, textiles }, sceneName);
    scene.add(built.group);
    audit = built.audit;
    walkPlan = plan;
    walkColliders = built.colliders;
    auditRoot = built.group;
    auditColliders = built.colliders;
    auditSeed = plan.walkLine[0]!;
    const s = plan.side;
    const X = (x: number) => CLOTH_LINE_X + s * (x - CLOTH_LINE_X);
    const custom: Record<string, { from: readonly number[]; to: readonly number[] }> = {
      default: plan.standpoint,
      read: plan.readingSpot,
      rim: { from: [X(2.2), 0.95, 7.3], to: [3, 0.2, 5.6] },
      far: { from: [X(3.7), 1.05, 1.7], to: [3, 0.3, 3.4] },
      ground: { from: [X(1.2), 0.8, 11.6], to: [3, 0, 9.4] },
      wall: { from: [X(-2), 1.4, -20.1], to: [X(-3), 1.2, -21] },
      wall2: { from: [26, 1.4, 6], to: [27, 1.2, 6] },
      shed: { from: [plan.readingSpot.from[0], 1.5, -3.9], to: [plan.readingSpot.from[0], 1.5, -4.5] },
      bench: { from: [X(-0.6), 0.9, (plan.items[0]?.z ?? 6) + 1.1], to: [plan.items[0]?.x ?? 0, 0.4, plan.items[0]?.z ?? 6] },
      onward: { from: [X(-1), 1.6, -9.5], to: [X(3.2), 2.3, -22] },
      cloth: { from: [X(1.2), 1.5, 3.4], to: [3, 1.8, 2.2] },
      hem: { from: [X(1.4), 1.4, -1.2], to: [3, 1.2, -2.9] },
      top: { from: [X(-14), 26, 30], to: [3, 0, -2] },
      side: { from: [7, 1.55, 7.2], to: [13, 1.9, 0.2] },
    };
    view = custom[query.get("v") ?? "default"]!;
    sky.position.set(view.from[0]!, view.from[1]!, view.from[2]!);
  }
}
scene.updateMatrixWorld();
renderer.shadowMap.needsUpdate = true;
camera.position.set(view.from[0]!, view.from[1]!, view.from[2]!);
camera.lookAt(view.to[0]!, view.to[1]!, view.to[2]!);
const output = createRenderView(renderer, scene, camera);
renderer.compile(scene, camera);
output.render();
output.render();
win.QA = (plantFault = false, plantFillFault = false) => {
  if (!audit || !planForCheck) return { solidsChecked: 0, clothPointsChecked: 0, fillPointsChecked: 0, fillPiecesChecked: 0, fillsChecked: 0, problems: [] };
  const parts = audit();
  const plantedSolids = [
    { name: "planted textile past the wall", role: "textile" as const, box: { min: [25, 0, 0] as const, max: [40, 3, 0.1] as const }, restsOn: [], planted: false },
    { name: "planted vessel through its bench", role: "object" as const, box: { min: [-40, 0.3, -40] as const, max: [-39.5, 0.6, -39.5] as const }, restsOn: [], planted: false, standsOnY: 0.38 },
    { name: "planted neighbour A", role: "object" as const, box: { min: [0, 0.4, 16] as const, max: [0.3, 0.7, 16.3] as const }, restsOn: [], planted: false },
    { name: "planted neighbour B", role: "object" as const, box: { min: [0.1, 0.4, 16.1] as const, max: [0.4, 0.7, 16.4] as const }, restsOn: [], planted: false },
  ];
  const solids = plantFault ? [...parts.solids, ...plantedSolids] : parts.solids;
  const cloths = plantFault ? parts.cloths.map((cloth) => ({ ...cloth, positions: cloth.positions.map((value, i) => (i % 3 === 1 ? value - 0.06 : value)) })) : parts.cloths;
  const unchecked = plantFault ? [...parts.unchecked, "planted unregistered mesh"] : parts.unchecked;
  const pokedThroughWall = (points: Float32Array) => {
    let far = 0;
    let at = 0;
    for (let k = 0; k < points.length; k += 3) {
      const reach = Math.hypot(points[k]!, points[k + 2]!);
      if (reach > far) {
        far = reach;
        at = k;
      }
    }
    const outward = (far + PLANTED_POKE_METRES) / far;
    return Float32Array.from([points[at]! * outward, points[at + 1]!, points[at + 2]! * outward]);
  };
  const fills = plantFault
    ? []
    : plantFillFault
      ? parts.fills.map((fill) => {
          const pieces = fill.pieces();
          return { ...fill, points: () => pokedThroughWall(fill.points()), pieces: () => (pieces.length > 1 ? [...pieces.slice(0, 3), pieces[0]!] : pieces) };
        })
      : parts.fills;
  const expectedFills = !plantFault && walkPlan ? walkPlan.items.reduce((sum, placed) => sum + placed.looks.length, 0) + (walkPlan.workLiquid ? 1 : 0) : undefined;
  return checkScene({ yard: planForCheck.yard, solids, cloths, fields: parts.fields, fills, groundIsOpenAt: parts.groundIsOpenAt, unchecked, ...(expectedFills === undefined ? {} : { expectedFills }) });
};
const gl = renderer.getContext();
win.flicker = async (frames = 60, threshold = 10, mode = "pan") => {
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const count = width * height;
  const pixels = new Uint8Array(count * 4);
  let previous = new Float32Array(count);
  let currentFrame = new Float32Array(count);
  const direction = new Int8Array(count);
  const reversals = new Uint16Array(count);
  const from = new THREE.Vector3(view.from[0]!, view.from[1]!, view.from[2]!);
  const to = new THREE.Vector3(view.to[0]!, view.to[1]!, view.to[2]!);
  const forward = to.clone().sub(from).setY(0).normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const pixelAngle = ((camera.fov * Math.PI) / 180) / height;
  const place = (i: number) => {
    if (mode === "pan") {
      camera.position.copy(from);
      camera.lookAt(to.clone().addScaledVector(right, Math.tan(pixelAngle * 0.25 * i) * from.distanceTo(to)));
    } else {
      camera.position.copy(from).addScaledVector(forward, i * 0.02);
      camera.lookAt(to.clone().addScaledVector(forward, i * 0.02));
    }
    output.render();
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let p = 0, q = 0; p < count; p++, q += 4) currentFrame[p] = pixels[q]! * 0.3 + pixels[q + 1]! * 0.59 + pixels[q + 2]! * 0.11;
  };
  place(0);
  [previous, currentFrame] = [currentFrame, previous];
  let events = 0;
  for (let i = 1; i < frames; i++) {
    place(i);
    for (let p = 0; p < count; p++) {
      const change = currentFrame[p]! - previous[p]!;
      const sign = change > threshold ? 1 : change < -threshold ? -1 : 0;
      if (sign !== 0) {
        if (direction[p] === -sign) {
          reversals[p]!++;
          events++;
        }
        direction[p] = sign;
      }
    }
    [previous, currentFrame] = [currentFrame, previous];
    await new Promise(requestAnimationFrame);
  }
  let four = 0;
  let any = 0;
  const heat = document.createElement("canvas");
  heat.width = width;
  heat.height = height;
  const context = heat.getContext("2d")!;
  const image = context.createImageData(width, height);
  for (let j = 0; j < height; j++) {
    for (let k = 0; k < width; k++) {
      const value = reversals[(height - 1 - j) * width + k]!;
      if (value) any++;
      if (value >= 4) four++;
      const o = (j * width + k) * 4;
      image.data[o] = Math.min(255, value * 80);
      image.data[o + 1] = Math.min(255, value * 30);
      image.data[o + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return { mode, anyPct: +((any / count) * 100).toFixed(3), fourPlusPct: +((four / count) * 100).toFixed(3), events, heat: heat.toDataURL("image/png") };
};
win.shimmerByObject = async (frames = 60, threshold = 10) => {
  const panShimmer = async () => ((await (win.flicker as (f: number, t: number, m: string) => Promise<{ fourPlusPct: number }>)(frames, threshold, "pan")).fourPlusPct);
  const whole = await panShimmer();
  const groups = [
    ...(auditRoot ? objectParts(auditRoot).map((part) => ({ label: `${part.auditName} / ${part.label}`, meshes: part.meshes as THREE.Object3D[] })) : []),
    ...environmentOf().map((mesh) => ({ label: `environment / ${mesh.name || (mesh as THREE.Mesh).geometry.type}`, meshes: [mesh] })),
  ];
  const rows: { label: string; share: number }[] = [];
  for (const group of groups) {
    const shown = group.meshes.map((mesh) => mesh.visible);
    for (const mesh of group.meshes) mesh.visible = false;
    const without = await panShimmer();
    group.meshes.forEach((mesh, index) => (mesh.visible = shown[index]!));
    rows.push({ label: group.label, share: +(whole - without).toFixed(3) });
  }
  return { whole, rows: rows.sort((a, b) => b.share - a.share) };
};
win.walkCheck = () => {
  if (!walkPlan || !walkColliders) return null;
  let walker: Walker = walkerAt(walkPlan.standpoint.from, walkPlan.standpoint.to, 0);
  let target: WalkTarget | null = { station: 0, waypoint: 1 };
  let time = 0;
  let stuck = 0;
  while (target && time < 120) {
    const steered = steerAlong(walker, walkPlan.walkLine, target, 1);
    target = steered.target;
    if (steered.heading === null) break;
    const before: Walker = walker;
    const move = moveTowards(steered.heading, before.yaw);
    walker = stepWalker(before, { ...move, lookX: 0, lookY: 0 }, 1 / 30, walkColliders, 3);
    walker = { ...walker, yaw: easeYaw(walker.yaw, steered.heading, 1 / 30) };
    if (Math.hypot(walker.x - before.x, walker.z - before.z) < 0.001) stuck++;
    if (stuck > 60) break;
    time += 1 / 30;
  }
  return { reachedEnd: target === null, seconds: +time.toFixed(1), metres: +walker.walked.toFixed(1), stuckAt: target ? [+walker.x.toFixed(2), +walker.z.toFixed(2)] : null };
};
const SEEN_THROUGH_LOOK = /^(liquid|liquid body) /;
const displayToLinear = (value: number) => (value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
const linearToDisplay = (value: number) => Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
const pixelsWithin = (frame: Uint8Array, mask: Uint8Array, width: number, beneath: Uint8Array | null, tint: readonly number[]) => {
  const rows: number[][] = [];
  const inside = (i: number) => (mask[i] ?? 0) >= 128;
  for (let i = 0; i < mask.length; i += 4) {
    if (!inside(i) || !inside(i - 4) || !inside(i + 4) || !inside(i - width * 4) || !inside(i + width * 4)) continue;
    const [r, g, b] = [frame[i]!, frame[i + 1]!, frame[i + 2]!];
    const through = beneath ? [0, 1, 2].map((channel) => linearToDisplay(displayToLinear(beneath[i + channel]!) * tint[channel]!)) : [r, g, b];
    rows.push([r, g, b, r * 0.2126 + g * 0.7152 + b * 0.0722, ...through]);
  }
  return rows.sort((p, q) => p[3]! - q[3]!);
};
const frameNow = (width: number, height: number) => {
  output.render();
  const frame = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, frame);
  return frame;
};
const frameWithout = (key: string, width: number, height: number) => {
  const hidden: THREE.Mesh[] = [];
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    const label = ((node.material as THREE.Material).userData.surface as { label?: string } | undefined)?.label ?? "";
    if (SEEN_THROUGH_LOOK.test(label) && label.endsWith(` ${key}`)) hidden.push(node);
  });
  for (const mesh of hidden) mesh.visible = false;
  const frame = frameNow(width, height);
  for (const mesh of hidden) mesh.visible = true;
  return frame;
};
win.colourOfLook = (key: string, centre: readonly number[], target: readonly number[], fov: number, tintHex: string | null = null) => {
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(centre[0]!, centre[1]!, centre[2]!);
  camera.lookAt(target[0]!, target[1]!, target[2]!);
  camera.updateMatrixWorld();
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const frame = frameNow(width, height);
  const beneath = tintHex ? frameWithout(key, width, height) : null;
  const tint = tintHex ? [1, 3, 5].map((at) => displayToLinear(parseInt(tintHex.slice(at, at + 2), 16))) : [1, 1, 1];
  const flat = new Map<string, THREE.MeshBasicMaterial>();
  const flatOf = (colour: number, side: THREE.Side) => {
    const name = `${colour}:${side}`;
    if (!flat.has(name)) flat.set(name, new THREE.MeshBasicMaterial({ color: colour, side, fog: false }));
    return flat.get(name)!;
  };
  const originals = new Map<THREE.Mesh, THREE.Material>();
  const looksLike = new RegExp(`^(substance|liquid|crystals) ${key}$`);
  const smearedOnWall = (material: THREE.Material, label: string) => label.startsWith("substance ") && material.transparent && !material.depthWrite;
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const material = node.material as THREE.Material;
    originals.set(node, material);
    const label = (material.userData.surface as { label?: string } | undefined)?.label ?? "";
    node.material = flatOf(looksLike.test(label) && !smearedOnWall(material, label) ? 0xffffff : 0x000000, material.side ?? THREE.FrontSide);
  });
  const target2 = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const background = scene.background;
  scene.background = null;
  renderer.setRenderTarget(target2);
  renderer.clear();
  renderer.render(scene, camera);
  const mask = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target2, 0, 0, width, height, mask);
  renderer.setRenderTarget(null);
  scene.background = background;
  for (const [mesh, material] of originals) mesh.material = material;
  target2.dispose();
  for (const material of flat.values()) material.dispose();
  const rows = pixelsWithin(frame, mask, width, beneath, tint);
  if (rows.length === 0) return { pixels: 0, shaded: null, middle: null, lit: null, through: null };
  const at = (share: number, first: number) => {
    const from = Math.floor(rows.length * Math.max(0, share - 0.05));
    const to = Math.max(from + 1, Math.floor(rows.length * Math.min(1, share + 0.05)));
    const picked = rows.slice(from, to);
    return [0, 1, 2].map((channel) => Math.round(picked.reduce((sum, row) => sum + row[first + channel]!, 0) / picked.length));
  };
  const through = beneath ? { shaded: at(0.2, 4), middle: at(0.5, 4), lit: at(0.8, 4) } : null;
  return { pixels: rows.length, shaded: at(0.2, 0), middle: at(0.5, 0), lit: at(0.8, 0), through };
};
win.colourOfStill = (key: string, tintHex: string | null = null) => (win.colourOfLook as (key: string, centre: readonly number[], target: readonly number[], fov: number, tintHex: string | null) => unknown)(key, view.from, view.to, STILL_FOV_DEGREES, tintHex);
win.moveCamera = (from: readonly number[], to: readonly number[], fov = 55) => {
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(from[0]!, from[1]!, from[2]!);
  camera.lookAt(to[0]!, to[1]!, to[2]!);
  output.render();
};
win.setLiquidTime = (seconds: number) => {
  setLiquidTime(seconds);
  output.render();
};
win.stageContents = () => {
  if (!walkPlan || !audit) return null;
  const solids = audit().solids;
  const centreOf = (name: string) => {
    const box = solids.find((solid) => solid.name === name)!.box;
    return { centre: [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2], top: box.max[1] };
  };
  const work = walkPlan.work;
  return {
    side: walkPlan.side,
    standpoint: walkPlan.standpoint,
    vessels: walkPlan.items.flatMap((placed) => placed.looks.map((look, i) => ({ look, ...centreOf(`item ${placed.item.key} ${i}`) }))),
    tools: walkPlan.items.filter((placed) => placed.looks.length === 0).map((placed) => ({ modelId: placed.item.modelId, ...centreOf(`item ${placed.item.key} 0`) })),
    liquid: walkPlan.workLiquid && (work.type === "ring" || work.type === "tank") ? { look: walkPlan.workLiquid, x: CLOTH_LINE_X, y: work.level, z: work.z, reach: work.type === "ring" ? work.radius : work.halfX } : null,
  };
};
let field: ReachField | null = null;
const fieldHere = () => (field ??= reachField(auditArea, auditColliders, auditSeed));
const environmentOf = () => {
  const out: THREE.Object3D[] = [];
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh && auditRoot && !isUnder(node, auditRoot)) out.push(node);
  });
  return out;
};
const isUnder = (node: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
  let at: THREE.Object3D | null = node;
  while (at) {
    if (at === ancestor) return true;
    at = at.parent;
  }
  return false;
};
const plantOnWalkLine = (mesh: THREE.Mesh, name: string, height = 1.4) => {
  const here = walkPlan ? walkPlan.walkLine[1]! : ([auditSeed[0] + 2, auditSeed[1] - 2] as const);
  mesh.position.set(here[0], height, here[1] - 1);
  mesh.userData.auditName = name;
  auditRoot!.add(mesh);
  mesh.updateWorldMatrix(true, true);
  return mesh;
};
win.surfaceAudit = () => {
  if (!auditRoot) return null;
  const rows = surfaceRows(reachOfParts(objectParts(auditRoot), fieldHere()), fieldHere());
  return rankWorstFirst(rows);
};
win.nearestViews = (pattern: string) => {
  if (!auditRoot) return [];
  const wanted = new RegExp(pattern);
  return reachOfParts(objectParts(auditRoot), fieldHere())
    .map((reach) => ({ label: `${reach.part.auditName} / ${reach.part.label}`, distance: +reach.distance.toFixed(2), eye: reach.eye, target: reach.target }))
    .filter((view) => wanted.test(view.label) && Number.isFinite(view.distance));
};
const PAINT_OWNER = /^(paint|bench paint|curved paint) (\d+)/;
const paintKindOf = (owner: string, index: number): string => {
  if (owner === "bench paint") return "bench label";
  if (owner === "curved paint") return "curved label";
  const words = walkPlan?.words[index];
  if (!words) return "painted words";
  if (words.family === "Mukta") return "caption";
  if (words.height >= 1) return "number";
  if (words.colour === "lime") return "lime label";
  return words.height >= 0.3 ? "heading" : "local name";
};
const paintMeshes = () => {
  const found: { name: string; kind: string; mesh: THREE.Mesh }[] = [];
  auditRoot?.traverse((node) => {
    const name = node.userData.auditName as string | undefined;
    const owner = name ? PAINT_OWNER.exec(name) : null;
    if (owner && node instanceof THREE.Mesh) found.push({ name: name!, kind: paintKindOf(owner[1]!, Number(owner[2])), mesh: node });
  });
  return found;
};
win.paintViews = () => {
  if (!auditRoot) return [];
  auditRoot.updateWorldMatrix(true, true);
  const reaches = new Map(reachOfParts(objectParts(auditRoot), fieldHere()).map((reach) => [reach.part.auditName, reach]));
  return paintMeshes().map(({ name, kind, mesh }) => {
    const centre = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    const outward = mesh.geometry instanceof THREE.PlaneGeometry ? new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld) : centre.clone().sub(mesh.getWorldPosition(new THREE.Vector3()));
    outward.setY(0).normalize();
    const along = (distance: number) => ({ eye: [centre.x + outward.x * distance, 1.6, centre.z + outward.z * distance], target: centre.toArray() });
    const reach = reaches.get(name);
    return {
      name,
      kind,
      views: {
        arrival: { eye: [...view.from], target: [...view.to] },
        "6m": along(6),
        "3.6m": along(3.6),
        nearest: reach && Number.isFinite(reach.distance) ? { eye: [...reach.eye], target: [...reach.target], distance: +reach.distance.toFixed(2) } : along(0.6),
      },
    };
  });
};
win.shimmerByPaintKind = async (frames = 60, threshold = 10) => {
  const panShimmer = async () => (await (win.flicker as (f: number, t: number, m: string) => Promise<{ fourPlusPct: number }>)(frames, threshold, "pan")).fourPlusPct;
  const whole = await panShimmer();
  const paints = paintMeshes();
  const rows: { kind: string; share: number }[] = [];
  for (const kind of ["all painted words", ...new Set(paints.map((paint) => paint.kind))]) {
    const hidden = paints.filter((paint) => kind === "all painted words" || paint.kind === kind).map((paint) => paint.mesh);
    for (const mesh of hidden) mesh.visible = false;
    const without = await panShimmer();
    for (const mesh of hidden) mesh.visible = true;
    rows.push({ kind, share: +(whole - without).toFixed(3) });
  }
  return { whole, rows };
};
win.paintBox = (name: string) => {
  const found = paintMeshes().find((row) => row.name === name);
  if (!found) return null;
  camera.updateMatrixWorld();
  const box = new THREE.Box3().setFromObject(found.mesh);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let bit = 0; bit < 8; bit++) {
    const corner = new THREE.Vector3(bit & 1 ? box.max.x : box.min.x, bit & 2 ? box.max.y : box.min.y, bit & 4 ? box.max.z : box.min.z);
    if (corner.clone().applyMatrix4(camera.matrixWorldInverse).z > -CAMERA_NEAR_METRES) return null;
    corner.project(camera);
    minX = Math.min(minX, ((corner.x + 1) / 2) * innerWidth);
    maxX = Math.max(maxX, ((corner.x + 1) / 2) * innerWidth);
    minY = Math.min(minY, ((1 - corner.y) / 2) * innerHeight);
    maxY = Math.max(maxY, ((1 - corner.y) / 2) * innerHeight);
  }
  const x = Math.max(0, Math.floor(minX));
  const y = Math.max(0, Math.floor(minY));
  const width = Math.min(innerWidth, Math.ceil(maxX)) - x;
  const height = Math.min(innerHeight, Math.ceil(maxY)) - y;
  return width > 3 && height > 3 ? { x, y, width, height } : null;
};
win.surfacePlanted = () => {
  if (!auditRoot) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const painted = () => new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas) });
  const coarse = plantOnWalkLine(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), painted()), "planted coarse texture");
  const faceted = plantOnWalkLine(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), painted()), "planted faceted cylinder");
  const sixSided = plantOnWalkLine(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 6), painted()), "planted six-sided cylinder");
  const flatLump = plantOnWalkLine(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 2), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), flatShading: true })), "planted flat-shaded lump");
  faceted.position.x += 1.5;
  sixSided.position.x += 3;
  flatLump.position.x += 4.5;
  const planted = [coarse, faceted, sixSided, flatLump];
  for (const mesh of planted) mesh.updateWorldMatrix(true, true);
  const rows = surfaceRows(planted.flatMap((mesh) => reachOfParts(objectParts(mesh), fieldHere())), fieldHere());
  for (const mesh of planted) mesh.removeFromParent();
  return rows.map((row) => ({ label: row.label, failures: row.failures }));
};
const tearingOf = (reaches: ReturnType<typeof reachOfParts>) => measureTearing({ renderer, scene, camera, renderColour: output.render }, reaches, environmentOf(), fieldHere());
win.tearingAudit = () => {
  if (!auditRoot) return null;
  const parts = objectParts(auditRoot);
  const reaches = reachOfParts(parts, fieldHere());
  return tearingOf(reaches).map((figures) => ({ ...figures, failures: tearingFailures(figures) }));
};
win.tearingPlanted = () => {
  if (!auditRoot) return null;
  const material = new THREE.MeshBasicMaterial({ color: 0x808080 });
  const fightA = plantOnWalkLine(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2, 9, 7), material), "planted fight");
  const fightB = plantOnWalkLine(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5, 3, 11), new THREE.MeshBasicMaterial({ color: 0x202020 })), "planted fight partner");
  fightB.rotation.z = 0.7;
  fightB.updateWorldMatrix(true, true);
  const crack = new THREE.Group();
  const leftSlab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.05), material);
  const rightSlab = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.05), material);
  leftSlab.position.x = -0.302;
  rightSlab.position.x = 0.302;
  crack.add(leftSlab, rightSlab);
  crack.position.set(fightA.position.x - 2.2, 1.4, fightA.position.z);
  crack.userData.auditName = "planted crack";
  auditRoot.add(crack);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const index = box.index!;
  const open = new THREE.BufferGeometry();
  open.setAttribute("position", box.attributes.position!);
  open.setIndex(Array.from(index.array).filter((_, i) => i < 24 || i >= 30));
  const missing = plantOnWalkLine(new THREE.Mesh(open, material), "planted missing face");
  missing.position.x -= 4.4;
  missing.rotation.y = 0.3;
  missing.updateWorldMatrix(true, true);
  crack.updateWorldMatrix(true, true);
  const checker = new Uint8Array(512 * 512 * 4);
  for (let i = 0; i < 512 * 512; i++) {
    const tone = (i + (i >> 9)) % 2 === 0 ? 255 : 0;
    checker.set([tone, tone, tone, 255], i * 4);
  }
  const shimmerMap = new THREE.DataTexture(checker, 512, 512);
  shimmerMap.magFilter = shimmerMap.minFilter = THREE.NearestFilter;
  shimmerMap.needsUpdate = true;
  const shimmer = plantOnWalkLine(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: shimmerMap })), "planted flicker");
  shimmer.position.x += 2.2;
  shimmer.updateWorldMatrix(true, true);
  const planted = [fightA, crack, missing, shimmer];
  const reaches = planted.flatMap((object) => reachOfParts(objectParts(object), fieldHere()).map((reach) => ({ ...reach, distance: 1.4, eye: [object.position.x, 1.6, object.position.z + 1.4] as const, target: [object.position.x, object.position.y, object.position.z] as const })));
  const results = tearingOf(reaches).map((figures) => ({ ...figures, failures: tearingFailures(figures) }));
  for (const object of [fightA, fightB, crack, missing, shimmer]) object.removeFromParent();
  return results;
};
const paintOff = () => {
  if (!auditRoot) return [];
  auditRoot.updateWorldMatrix(true, true);
  const solids: THREE.Object3D[] = [];
  const paints: THREE.Mesh[] = [];
  auditRoot.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) return;
    const kind = ((node.material as THREE.Material).userData.surface as { kind?: string } | undefined)?.kind;
    if (kind === "painted") paints.push(node);
    else if (kind !== "smooth" && kind !== "distant") solids.push(node);
  });
  const ray = new THREE.Raycaster();
  const off: { name: string; corner: number; lines: string }[] = [];
  for (const paint of paints) {
    const geometry = paint.geometry;
    if (!(geometry instanceof THREE.PlaneGeometry)) continue;
    const { width, height } = geometry.parameters;
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(paint.matrixWorld);
    [[0.46, 0.3], [-0.46, 0.3], [0.46, -0.3], [-0.46, -0.3], [0, 0]].forEach(([u, v], corner) => {
      const from = new THREE.Vector3(u! * width, v! * height, 0).applyMatrix4(paint.matrixWorld).addScaledVector(normal, 0.03);
      ray.set(from, normal.clone().negate());
      ray.far = 0.08;
      if (ray.intersectObjects(solids, false).length === 0) off.push({ name: paint.userData.auditName as string, corner, lines: `${width.toFixed(2)} wide` });
    });
  }
  return off;
};
win.paintOffSurface = paintOff;
win.paintOffPlanted = async () => {
  if (!auditRoot) return [];
  const floating = (await paintWordsInTurn(library, auditRoot, { lines: ["Planted"], at: [CLOTH_LINE_X, 8, YARD_FRONT_Z - 2], facing: 0, height: 0.2, align: "center", colour: "ink", weight: 700, family: "Eczar", pixelsPerMetre: 800, wear: 0, lineHeight: 1.1 })).mesh;
  floating.userData.auditName = "planted paint";
  const off = paintOff();
  floating.removeFromParent();
  return off;
};
win.stillJobs = () => [
  { name: `practice ${PRACTICE_MODEL}`, form: "tool", file: stillPath(PRACTICE_MODEL), query: `s=still&m=${PRACTICE_MODEL}` },
  ...Object.values(TEMPLATES).flatMap((template) =>
    template.stages.flatMap((stage) =>
      stage.items.map((item) => {
        const looks = looksOfItem(stage.key, item);
        const stageQuery = `stage=${encodeURIComponent(stage.key)}`;
        return looks.length > 0
          ? { name: `${stage.key} / ${item.label} / ${looks.map((look) => look.key).join("+")}`, form: looks.map((look) => `${look.fill} ${look.renderHex} ${look.transparency}`).join(" + "), file: stageItemStillPath(stage.key, stage.items, item), query: `s=still&${stageQuery}&item=${encodeURIComponent(item.label)}` }
          : { name: `${stage.key} / ${item.label} / ${item.modelId}`, form: "tool", file: stageItemStillPath(stage.key, stage.items, item), query: `s=still&m=${item.modelId}&${stageQuery}` };
      }),
    ),
  ),
];
win.INFO = { tris: renderer.info.render.triangles, textures: renderer.info.memory.textures };
win.READY = true;
