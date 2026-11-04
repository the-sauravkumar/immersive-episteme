import * as THREE from "three";
import type { ProductImage, StageItem, StationKind } from "@/features/process/domain/stage-template";
import { ASSET_CATALOGUE } from "@/features/process/domain/asset-catalogue";
import { checkScene } from "@/features/walkthrough/domain/scene-check";
import { buildHallPlan, layoutTextiles, practiceStation } from "@/features/walkthrough/domain/route-plan";
import { buildYardPlan, CLOTH_LINE_X, type YardPlan, type YardStage } from "@/features/walkthrough/domain/yard-plan";
import { buildEntrance } from "@/features/walkthrough/infrastructure/build-entrance";
import { buildYard, YardKit, type BuiltYard, type YardTextile } from "@/features/walkthrough/infrastructure/build-yard";
import { buildStillSubject } from "@/features/walkthrough/infrastructure/build-still";
import { addHorizon } from "@/features/walkthrough/infrastructure/horizon";
import { MaterialLibrary } from "@/features/walkthrough/infrastructure/material-library";
import { addSun, createRenderer, createRenderView } from "@/features/walkthrough/infrastructure/render-view";

const tool = (key: string, label: string, modelId: string, localName: string | null = null): StageItem => ({ key, role: "tool", label, localName, modelId });
const material = (key: string, label: string, modelId: string, localName: string | null = null): StageItem => ({ key, role: "material", label, localName, modelId });
const CAPTION = "One or two sentences from the sourced claims are painted here, in the same words as the course panel. Sample Text.";
const STATE = (n: string) => `/agent-state/state${n}.jpg`;
type Station = YardStage & { before: string; after: string };
const fixture = (kind: StationKind, index: number, items: StageItem[], before: string, after: string, name: string, local: string | null): Station => ({ number: index + 1, name, localName: local, caption: CAPTION, kind, items, next: { number: index + 2, name: "Next Stage Name" }, index, before, after });
const STATIONS: Record<string, Station> = {
  vat: fixture("vat", 8, [tool("v", "Underground Indigo Vat", "dye-vat", "Kun"), material("i", "Indigo", "lump-basket"), material("w", "Water", "liquid-pot")], STATE("08"), STATE("09"), "Indigo Dyeing", "(Kun Me Burana)"),
  table: fixture("table", 3, [tool("t", "Printing Table", "printing-table"), tool("b", "Printing Blocks", "carved-block"), tool("y", "Tari", "printing-tray", "Printing Tray"), material("p", "Resist Paste", "paste-bowl")], "raw-cotton", STATE("04"), "Khariyanu", "(Lime-Gum Resist Outline Printing)"),
  wash: fixture("wash", 9, [tool("k", "Washing Tank", "wash-tank"), tool("m", "Wooden Mallet", "mallet"), material("a", "Water", "liquid-pot")], STATE("09"), STATE("10"), "Washing Out Resists", null),
  boil: fixture("boil", 10, [tool("c", "Copper Vessel", "boiling-vessel"), material("r", "Madder", "powder-bowl"), material("a", "Alum", "paste-bowl")], STATE("10"), STATE("11"), "Red Dyeing", "(Rang)"),
  soak: fixture("soak", 0, [tool("s", "Soaking Tub", "dye-vat"), material("n", "Neerani", "liquid-pot"), material("d", "Dung", "lump-basket")], "raw-cotton", STATE("02"), "Saaj", "(Scouring And Softening)"),
  dry: fixture("dry", 11, [material("g", "Cow Dung", "lump-basket")], STATE("11"), STATE("12"), "Tapano", "(Sun Bleaching)"),
  carve: fixture("carve", 2, [tool("t", "Printing Table", "printing-table"), tool("c", "Chisels", "spoon"), tool("h", "Hatha Handle", "mallet")], "raw-cotton", "raw-cotton", "Block Carving", null),
  finish: fixture("finish", 13, [tool("t", "Printing Table", "printing-table"), tool("c", "Bale", "cloth-bale")], STATE("13"), STATE("14"), "Finishing", null),
};
const HALL_PRODUCTS: ProductImage[] = [
  ["a", "/agent-state/p-fig9.jpg", "Ajrakh", "Mingei Museum"],
  ["b", "/agent-state/p-fig3.jpg", "Ajrakh", "Mingei Museum"],
  ["c", "/agent-state/p-469296.jpg", "Ajrakh", "V&A Museum"],
  ["d", "/agent-state/p-470770.jpg", "Ajrakh", "V&A Museum"],
  ["e", "/agent-state/p-mykutch.jpg", "Ajrakh", "MyKutch"],
  ["f", "/agent-state/p-ajrak.jpg", "Ajrak", "Wikimedia Commons"],
].map(([id, file, name, holder]) => ({ id: id!, file: file!, name: name!, holder: holder! }));

const query = new URLSearchParams(location.search);
const sceneName = query.get("s") ?? "vat";
await Promise.all(["800 40px Eczar", "700 40px Eczar", "600 40px Eczar", "600 40px Mukta"].map((font) => document.fonts.load(font)));
const renderer = createRenderer(document.body, innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfe4e6, 60, 420);
const library = new MaterialLibrary(renderer);
const kit = new YardKit(library);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 1200);
const win = window as unknown as Record<string, unknown>;
let audit: BuiltYard["audit"] | null = null;
let planForCheck: YardPlan | null = null;
let view: { from: readonly number[]; to: readonly number[] };

if (sceneName === "still") {
  const modelId = query.get("m") ?? ASSET_CATALOGUE[0]!.id;
  scene.fog = null;
  await library.sky(scene, renderer);
  scene.background = null;
  const subject = await buildStillSubject(kit, modelId);
  scene.add(subject.group);
  const sun = addSun(scene, new THREE.Vector3(0, 0, 0));
  sun.position.set(-3, 4.2, 3.4);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -subject.radius * 2;
  sun.shadow.camera.right = sun.shadow.camera.top = subject.radius * 2;
  sun.shadow.camera.far = 30;
  sun.shadow.camera.updateProjectionMatrix();
  camera.fov = 24;
  camera.updateProjectionMatrix();
  const distance = subject.radius / Math.tan((12 * Math.PI) / 180) * 1.25;
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
    audit = () => ({ solids: entrance.solids(), cloths: entrance.cloths, fields: [], groundIsOpenAt: () => false });
    planForCheck = buildYardPlan({ number: 0, name: "", localName: null, caption: "", kind: "dry", items: [], next: null, index: 0 });
  } else {
    let plan: YardPlan;
    let textiles: YardTextile[] = [];
    let before = "raw-cotton";
    let after = "raw-cotton";
    let wet = false;
    if (sceneName === "hall") {
      plan = buildHallPlan(3.75);
      const aspects = new Map<string, number>();
      await Promise.all(HALL_PRODUCTS.map(async (product) => {
        const image = new Image();
        image.src = product.file;
        await image.decode();
        aspects.set(product.id, image.width / image.height);
      }));
      textiles = layoutTextiles(HALL_PRODUCTS, (product) => aspects.get(product.id) ?? 1).map((placed) => ({ file: placed.product.file, name: placed.product.id, x: placed.x, z: placed.z, width: placed.width, height: placed.height, label: placed.label }));
      after = STATE("14");
      before = after;
    } else if (sceneName === "practice") {
      plan = practiceStation().plan;
    } else {
      const station = STATIONS[sceneName]!;
      plan = buildYardPlan(station);
      before = station.before;
      after = station.after;
      wet = station.kind === "vat" || station.kind === "boil" || station.kind === "wash";
    }
    planForCheck = plan;
    const built = await buildYard(kit, plan, { clothBefore: before, clothAfter: after, wetAfter: wet, textiles }, sceneName);
    scene.add(built.group);
    audit = built.audit;
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
win.QA = (plantFault = false) => {
  if (!audit || !planForCheck) return { solidsChecked: 0, clothPointsChecked: 0, problems: [] };
  const parts = audit();
  const solids = plantFault ? [...parts.solids, { name: "planted fault", role: "textile" as const, box: { min: [25, 0, 0] as const, max: [40, 3, 0.1] as const }, restsOn: [], planted: false }] : parts.solids;
  const cloths = plantFault ? parts.cloths.map((cloth) => ({ ...cloth, positions: cloth.positions.map((value, i) => (i % 3 === 1 ? value - 0.06 : value)) })) : parts.cloths;
  return checkScene({ yard: planForCheck.yard, solids, cloths, fields: parts.fields, groundIsOpenAt: parts.groundIsOpenAt });
};
win.INFO = { tris: renderer.info.render.triangles, textures: renderer.info.memory.textures };
win.READY = true;
