import * as THREE from "three";
import type { StageItem, StationKind } from "@/features/process/domain/stage-template";
import { checkScene } from "@/features/walkthrough/domain/scene-check";
import { buildYardPlan, type YardStage } from "@/features/walkthrough/domain/yard-plan";
import { buildYard, YardKit } from "@/features/walkthrough/infrastructure/build-yard";
import { MaterialLibrary } from "@/features/walkthrough/infrastructure/material-library";
import { addHorizon } from "@/features/walkthrough/infrastructure/horizon";
import { addSun, createRenderer, createRenderView } from "@/features/walkthrough/infrastructure/render-view";

const tool = (key: string, label: string, modelId: string, localName: string | null = null): StageItem => ({ key, role: "tool", label, localName, modelId });
const material = (key: string, label: string, modelId: string, localName: string | null = null): StageItem => ({ key, role: "material", label, localName, modelId });
const CAPTION = "One or two sentences from the sourced claims are painted here, in the same words as the course panel. Sample Text.";
const fixture = (kind: StationKind, index: number, items: StageItem[], before: string, after: string, name: string, local: string | null): YardStage & { before: string; after: string } => ({ number: index + 1, name, localName: local, caption: CAPTION, kind, items, next: { number: index + 2, name: "Next Stage Name" }, index, before, after });
const STATE = (n: string) => `/agent-state/state${n}.jpg`;
const STATIONS: Record<string, YardStage & { before: string; after: string }> = {
  vat: fixture("vat", 8, [tool("v", "Underground Indigo Vat", "dye-vat", "Kun"), material("i", "Indigo", "lump-basket"), material("w", "Water", "liquid-pot")], STATE("08"), STATE("09"), "Indigo Dyeing", "(Kun Me Burana)"),
  table: fixture("table", 3, [tool("t", "Printing Table", "printing-table"), tool("b", "Printing Blocks", "carved-block"), tool("y", "Tari", "printing-tray", "Printing Tray"), material("p", "Resist Paste", "paste-bowl")], "raw-cotton", STATE("04"), "Khariyanu", "(Lime-Gum Resist Outline Printing)"),
  wash: fixture("wash", 9, [tool("k", "Washing Tank", "wash-tank"), tool("m", "Wooden Mallet", "mallet"), material("a", "Water", "liquid-pot")], STATE("09"), STATE("10"), "Washing Out Resists", null),
  boil: fixture("boil", 10, [tool("c", "Copper Vessel", "boiling-vessel"), material("r", "Madder", "powder-bowl"), material("a", "Alum", "paste-bowl")], STATE("10"), STATE("11"), "Red Dyeing", "(Rang)"),
  soak: fixture("soak", 0, [tool("s", "Soaking Tub", "dye-vat"), material("n", "Neerani", "liquid-pot"), material("d", "Dung", "lump-basket")], "raw-cotton", STATE("02"), "Saaj", "(Scouring And Softening)"),
  dry: fixture("dry", 11, [material("g", "Cow Dung", "lump-basket")], STATE("11"), STATE("12"), "Tapano", "(Sun Bleaching)"),
  carve: fixture("carve", 2, [tool("t", "Printing Table", "printing-table"), tool("c", "Chisels", "spoon"), tool("h", "Hatha Handle", "mallet")], "raw-cotton", "raw-cotton", "Block Carving", null),
  finish: fixture("finish", 13, [tool("t", "Printing Table", "printing-table"), tool("c", "Bale", "cloth-bale")], STATE("13"), STATE("14"), "Finishing", null),
};

const query = new URLSearchParams(location.search);
const station = STATIONS[query.get("s") ?? "vat"]!;
const plan = buildYardPlan(station);
await Promise.all(["800 40px Eczar", "700 40px Eczar", "600 40px Eczar", "600 40px Mukta"].map((font) => document.fonts.load(font)));
const renderer = createRenderer(document.body, innerWidth, innerHeight);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdfe4e6, 60, 420);
const library = new MaterialLibrary(renderer);
const sky = await library.sky(scene, renderer);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 1200);
const sun = addSun(scene, new THREE.Vector3(1, 0, -2));
addHorizon(scene, (await library.scan("earth")).colour);
const kit = new YardKit(library);
const built = await buildYard(kit, plan, { clothBefore: station.before, clothAfter: station.after, wetAfter: station.kind === "vat" }, query.get("s") ?? "vat");
scene.add(built.group);
scene.updateMatrixWorld();
renderer.shadowMap.needsUpdate = true;
const VIEWS: Record<string, { from: readonly number[]; to: readonly number[] }> = { default: plan.standpoint, read: plan.readingSpot };
const s = plan.side;
const X = (x: number) => 3 + s * (x - 3);
const custom: Record<string, { from: number[]; to: number[] }> = {
  rim: { from: [X(2.2), 0.95, 7.3], to: [3, 0.2, 5.6] },
  far: { from: [X(3.7), 1.05, 1.7], to: [3, 0.3, 3.4] },
  ground: { from: [X(1.2), 0.8, 11.6], to: [3, 0, 9.4] },
  wall: { from: [X(3), 1.4, -20.1], to: [X(-3), 1.2, -21] },
  wall2: { from: [20, 1.4, 6], to: [27, 1.2, 6] },
  shed: { from: [plan.readingSpot.from[0], 1.5, -3.9], to: [plan.readingSpot.from[0], 1.5, -4.5] },
  bench: { from: [X(-0.6), 0.9, (plan.items[0]?.z ?? 6) + 1.1], to: [plan.items[0]?.x ?? 0, 0.4, plan.items[0]?.z ?? 6] },
  onward: { from: [X(-1), 1.6, -9.5], to: [X(3.2), 2.3, -22] },
  cloth: { from: [X(1.2), 1.5, 3.4], to: [3, 1.8, 2.2] },
  top: { from: [X(-14), 26, 30], to: [3, 0, -2] },
};
const view = VIEWS[query.get("v") ?? "default"] ?? custom[query.get("v") ?? ""]!;
camera.position.set(view.from[0]!, view.from[1]!, view.from[2]!);
camera.lookAt(view.to[0]!, view.to[1]!, view.to[2]!);
sky.position.copy(camera.position);
const output = createRenderView(renderer, scene, camera);
renderer.compile(scene, camera);
output.render();
output.render();
void sun;
const win = window as unknown as Record<string, unknown>;
win.QA = (plantFault = false) => {
  const audit = built.audit();
  const solids = plantFault ? [...audit.solids, { name: "planted fault", role: "textile" as const, box: { min: [25, 0, 0] as const, max: [40, 3, 0.1] as const }, restsOn: [], planted: false }] : audit.solids;
  const cloths = plantFault ? audit.cloths.map((cloth) => ({ ...cloth, positions: cloth.positions.map((value, i) => (i % 3 === 1 ? value - 0.06 : value)) })) : audit.cloths;
  return checkScene({ yard: plan.yard, solids, cloths, fields: audit.fields, groundIsOpenAt: audit.groundIsOpenAt });
};
win.INFO = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, textures: renderer.info.memory.textures };
win.READY = true;
