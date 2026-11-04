import * as THREE from "three";
import { ASSET_CATALOGUE } from "@/features/process/domain/asset-catalogue";
import ajrakh from "../../content/study/ajrakh.template.json";
import sanganeri from "../../content/study/sanganeri.template.json";
import kalamkari from "../../content/study/machilipatnam-kalamkari.template.json";
import { clothStatePath } from "@/features/process/domain/asset-catalogue";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { checkScene } from "@/features/walkthrough/domain/scene-check";
import { buildRoute, practiceStation } from "@/features/walkthrough/domain/route-plan";
import { buildYardPlan, CLOTH_LINE_X, type YardPlan } from "@/features/walkthrough/domain/yard-plan";
import { SUBSTANCE_LOOK_ROWS } from "@/features/process/domain/substance-look-rows";
import { looksOfItem, stageItemStillPath, trayPadLookOf, workLiquidOf, type SubstanceLook } from "@/features/process/domain/substance-look";
import { easeYaw, moveTowards, steerAlong, stepWalker, walkerAt, type WalkTarget, type Walker } from "@/features/walkthrough/domain/walk-state";
import { buildEntrance } from "@/features/walkthrough/infrastructure/build-entrance";
import { buildYard, YardKit, type BuiltYard, type YardTextile } from "@/features/walkthrough/infrastructure/build-yard";
import { buildStillSubject } from "@/features/walkthrough/infrastructure/build-still";
import { addHorizon } from "@/features/walkthrough/infrastructure/horizon";
import { MaterialLibrary } from "@/features/walkthrough/infrastructure/material-library";
import { addSun, createRenderer, createRenderView } from "@/features/walkthrough/infrastructure/render-view";

const TEMPLATES: Record<string, StageTemplate> = { ajrakh: ajrakh as StageTemplate, sanganeri: sanganeri as StageTemplate, kalamkari: kalamkari as unknown as StageTemplate };

const query = new URLSearchParams(location.search);
const sceneName = query.get("s") ?? "route";
await Promise.all(["800 40px Eczar", "700 40px Eczar", "600 40px Eczar", "600 40px Mukta"].map((font) => document.fonts.load(font)));
const renderer = createRenderer(document.body, innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfe4e6, 60, 420);
const library = new MaterialLibrary(renderer);
const kit = new YardKit(library);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 1200);
const win = window as unknown as Record<string, unknown>;
let audit: BuiltYard["audit"] | null = null;
let walkPlan: YardPlan | null = null;
let walkColliders: BuiltYard["colliders"] | null = null;
let planForCheck: YardPlan | null = null;
let view: { from: readonly number[]; to: readonly number[] };

if (sceneName === "still") {
  const modelId = query.get("m") ?? ASSET_CATALOGUE[0]!.id;
  const looksOfStill = (): readonly SubstanceLook[] => {
    const stageKey = query.get("stage");
    const label = query.get("item");
    if (!stageKey || !label) return [];
    return looksOfItem(stageKey, { label, role: "material" });
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
  sun.position.set(-3, 4.2, 3.4);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -subject.radius * 2;
  sun.shadow.camera.right = sun.shadow.camera.top = subject.radius * 2;
  sun.shadow.camera.far = 30;
  sun.shadow.camera.updateProjectionMatrix();
  camera.fov = 24;
  camera.updateProjectionMatrix();
  const distance = subject.radius / Math.tan((12 * Math.PI) / 180) * 1.02;
  view = { from: [distance * 0.62, subject.centreY + distance * 0.52, distance * 0.72], to: [0, subject.centreY, 0] };
} else {
  const sky = await library.sky(scene, renderer);
  addHorizon(scene, (await library.scan("earth")).colour);
  addSun(scene, new THREE.Vector3(1, 0, -2));
  if (sceneName === "entrance") {
    const open = (query.get("open") ?? "none") as "none" | "door-1" | "door-2";
    const entrance = await buildEntrance(kit, { open, openness: Number(query.get("t") ?? 1), door1View: "/walkthrough/stills/door1-first-panel.jpg", door2View: "/walkthrough/stills/practice-view.jpg" });
    scene.add(entrance.group);
    view = query.get("v") === "near" ? { from: [0.9, 1.6, 3.8], to: [3.3, 1.55, -4.5] } : { from: [-6.4, 1.6, 8.6], to: [1.6, 2.3, -4.5] };
    audit = () => ({ solids: entrance.solids(), cloths: entrance.cloths, fields: [], fills: [], groundIsOpenAt: () => false });
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
  if (!audit || !planForCheck) return { solidsChecked: 0, clothPointsChecked: 0, fillPointsChecked: 0, fillPiecesChecked: 0, problems: [] };
  const parts = audit();
  const solids = plantFault ? [...parts.solids, { name: "planted fault", role: "textile" as const, box: { min: [25, 0, 0] as const, max: [40, 3, 0.1] as const }, restsOn: [], planted: false }] : parts.solids;
  const cloths = plantFault ? parts.cloths.map((cloth) => ({ ...cloth, positions: cloth.positions.map((value, i) => (i % 3 === 1 ? value - 0.06 : value)) })) : parts.cloths;
  const fills = plantFillFault ? parts.fills.map((fill) => ({ ...fill, points: fill.points.map((value, i) => (i % 3 === 0 ? value + 0.2 : value)), pieces: fill.pieces.length > 1 ? [...fill.pieces, fill.pieces[0]!] : fill.pieces })) : parts.fills;
  return checkScene({ yard: planForCheck.yard, solids, cloths, fields: parts.fields, fills, groundIsOpenAt: parts.groundIsOpenAt });
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
win.colourAt = (centre: readonly number[], target: readonly number[], fov: number, windowFraction = 0.2) => {
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(centre[0]!, centre[1]!, centre[2]!);
  camera.lookAt(target[0]!, target[1]!, target[2]!);
  output.render();
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;
  const span = Math.floor(Math.min(width, height) * windowFraction);
  const data = new Uint8Array(span * span * 4);
  gl.readPixels((width - span) >> 1, (height - span) >> 1, span, span, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const toned: number[] = [];
  for (let i = 0; i < data.length; i += 4) toned.push(data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722);
  const middle = [...toned].sort((a, b) => a - b)[toned.length >> 1]!;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < toned.length; i++) {
    if (Math.abs(toned[i]! - middle) > 22) continue;
    r += data[i * 4]!;
    g += data[i * 4 + 1]!;
    b += data[i * 4 + 2]!;
    n++;
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
};
win.moveCamera = (from: readonly number[], to: readonly number[], fov = 55) => {
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(from[0]!, from[1]!, from[2]!);
  camera.lookAt(to[0]!, to[1]!, to[2]!);
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
    vessels: walkPlan.items.flatMap((placed) => placed.looks.map((look, i) => ({ look, ...centreOf(`item ${placed.item.key} ${i}`) }))),
    tools: walkPlan.items.filter((placed) => placed.looks.length === 0).map((placed) => ({ modelId: placed.item.modelId, ...centreOf(`item ${placed.item.key} 0`) })),
    liquid: walkPlan.workLiquid && (work.type === "ring" || work.type === "tank") ? { look: walkPlan.workLiquid, x: CLOTH_LINE_X, y: work.level, z: work.z, reach: work.type === "ring" ? work.radius : work.halfX } : null,
  };
};
win.lookRows = SUBSTANCE_LOOK_ROWS;
win.stillJobs = () => Object.values(TEMPLATES).flatMap((template) =>
  template.stages.flatMap((stage) =>
    stage.items
      .map((item) => ({ item, path: stageItemStillPath(stage.key, stage.items, item) }))
      .filter(({ path }) => path.includes("/materials/") || path.includes("/tools/"))
      .map(({ item, path }) => ({ file: path.replace("/walkthrough/stills/", ""), query: path.includes("/tools/") ? `s=still&m=${item.modelId}&stage=${encodeURIComponent(stage.key)}` : `s=still&stage=${encodeURIComponent(stage.key)}&item=${encodeURIComponent(item.label)}` })),
  ),
);
win.renderInfo = () => ({ textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, tris: renderer.info.render.triangles, calls: renderer.info.render.calls });
win.INFO = { tris: renderer.info.render.triangles, textures: renderer.info.memory.textures };
win.READY = true;
