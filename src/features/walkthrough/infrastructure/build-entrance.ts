import * as THREE from "three";
import { clothBodyBoxes, settleCloth } from "../domain/cloth-surface";
import { smoothstep } from "../domain/geometry";
import type { Box, Vec3 } from "../domain/geometry";
import type { CheckedSolid, ClothMesh } from "../domain/scene-check";
import type { SolidRole } from "../domain/scene-check";
import { type YardKit } from "./build-yard";
import { noteSurface } from "./material-library";
import { paintWords, pole, softBox } from "./solid-builders";
import { displayAlbedo, projectScan } from "./substance-materials";

export type AssignedDoor = "none" | "door-1" | "door-2";

export interface EntranceOptions {
  readonly open: AssignedDoor;
  readonly openness: number;
  readonly door1View: string;
  readonly door2View: string;
}

const WALL_Z = -4.5;
const WALL_WIDTH = 30;
const WALL_HEIGHT = 5.4;
const INDIGO_PLANK_HEX = "#1c3278";
const PLANK_CONTRAST = 0.42;
const PLANK_GAIN = [0.62, 0.62, 0.62] as const;

interface Registered {
  readonly name: string;
  readonly role: SolidRole;
  readonly object: THREE.Object3D;
  readonly restsOn: readonly string[];
}

export interface BuiltEntrance {
  readonly group: THREE.Group;
  readonly solids: () => CheckedSolid[];
  readonly unchecked: () => string[];
  readonly cloths: ClothMesh[];
  readonly colliders: readonly Box[];
}

async function indigoPlanks(kit: YardKit): Promise<THREE.MeshStandardMaterial> {
  const scan = await kit.library.scan("table");
  const material = new THREE.MeshStandardMaterial({ map: scan.colour, normalMap: scan.normal, roughnessMap: scan.roughness, roughness: 0.9, color: displayAlbedo(INDIGO_PLANK_HEX, PLANK_GAIN), envMapIntensity: 0.4 });
  return noteSurface(projectScan(material, 1 / scan.tileMetres, PLANK_CONTRAST, 0.5), { label: "indigo door planks", kind: "model", perMetre: 1 / scan.tileMetres });
}

export async function buildEntrance(kit: YardKit, options: EntranceOptions): Promise<BuiltEntrance> {
  const group = new THREE.Group();
  const registered: Registered[] = [];
  const colliders: Box[] = [];
  const register = (name: string, role: SolidRole, object: THREE.Object3D, restsOn: readonly string[] = []) => {
    object.userData.auditName = name;
    registered.push({ name, role, object, restsOn });
    if (role !== "surface") {
      object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(object);
      colliders.push({ min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] });
    }
    return object;
  };
  const [earth, lime, timber, bamboo, cotton, planks] = await Promise.all([
    kit.library.surface("earth", { antiTile: true, normalScale: 1.1, tint: [2.5, 1.62, 1.22] }),
    kit.library.surface("lime", { antiTile: true, normalScale: 0.5, tint: [1.62, 1.58, 1.42] }),
    kit.library.surface("timber"),
    kit.bambooMaterial(),
    kit.library.rawCottonMaterial(),
    indigoPlanks(kit),
  ]);
  const groundGeometry = new THREE.PlaneGeometry(120, 90);
  const uv = groundGeometry.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 60, uv.getY(i) * 45);
  const ground = new THREE.Mesh(groundGeometry, earth);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 10;
  ground.receiveShadow = true;
  group.add(ground);
  register("ground", "surface", ground);
  register("entrance wall", "structure", softBox(group, [WALL_WIDTH, WALL_HEIGHT, 6], lime, [0, WALL_HEIGHT / 2, WALL_Z - 3], { radius: 0.02, tile: [2, 2] }), ["entrance parapet"]);
  register("entrance parapet", "structure", softBox(group, [WALL_WIDTH + 0.16, 0.14, 6.2], lime, [0, WALL_HEIGHT + 0.07, WALL_Z - 3], { radius: 0.02, tile: [2, 2] }), ["entrance wall"]);
  const face = WALL_Z + 0.004;
  const lettering = { facing: 0, align: "center" as const, colour: "ink" as const, family: "Eczar" as const, lineHeight: 1.14 };
  register("title paint", "surface", paintWords(group, { ...lettering, lines: ["Immersive Episteme"], at: [0, 4.5, face], height: 0.76, weight: 800, pixelsPerMetre: 560, wear: 0.3 }).mesh);
  register("subtitle paint", "surface", paintWords(group, { ...lettering, lines: ["Walking The Process"], at: [0, 3.86, face], height: 0.33, weight: 700, pixelsPerMetre: 800, wear: 0.2 }).mesh);
  const doorWidth = 1.76;
  const doorHeight = 2.5;
  for (const [x, door, label, view] of [
    [-3.3, "door-1", "Door 1", options.door1View],
    [3.3, "door-2", "Door 2", options.door2View],
  ] as const) {
    register(`${door} paint`, "surface", paintWords(group, { ...lettering, lines: [label], at: [x, 2.94, face], height: 0.24, weight: 700, pixelsPerMetre: 1000, wear: 0.3 }).mesh);
    const frameParts = [`${door} frame`, `${door} step`, `${door} view`, `${door} leaf -1`, `${door} leaf 1`, "entrance wall"];
    register(`${door} frame`, "structure", softBox(group, [doorWidth + 0.24, doorHeight + 0.14, 0.14], timber, [x, (doorHeight + 0.14) / 2, WALL_Z + 0.04], { radius: 0.012, tile: [1.8, 1.8], cast: false }), frameParts);
    const texture = await kit.library.photo(view);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.repeat.set(0.42, 1);
    texture.offset.set(door === "door-1" ? 0.03 : 0.5, 0);
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(doorWidth, doorHeight), noteSurface(new THREE.MeshBasicMaterial({ map: texture, fog: false }), { label: `view through ${door}`, kind: "distant" }));
    beyond.position.set(x, doorHeight / 2, WALL_Z + 0.115);
    beyond.visible = options.open === door;
    group.add(beyond);
    register(`${door} view`, "surface", beyond);
    const swing = options.open === door ? options.openness * 1.75 : 0;
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(x + side * (doorWidth / 2), 0, WALL_Z + 0.13);
      hinge.rotation.y = side * swing;
      group.add(hinge);
      const plankWidth = doorWidth / 4 - 0.005;
      for (const across of [0.5, 1.5]) softBox(hinge, [plankWidth, doorHeight, 0.04], planks, [(-side * doorWidth * across) / 4, doorHeight / 2, 0.007], { radius: 0.005 });
      for (const y of [0.42, 2.08]) softBox(hinge, [doorWidth / 2 - 0.05, 0.11, 0.022], timber, [(-side * doorWidth) / 4, y, 0.038], { radius: 0.005, tile: [1.8, 1.8] });
      register(`${door} leaf ${side}`, "structure", hinge, [...frameParts, `${door} leaf ${-side}`]);
    }
    register(`${door} step`, "structure", softBox(group, [doorWidth + 0.5, 0.1, 0.5], lime, [x, 0.05, WALL_Z + 0.3], { radius: 0.015, tile: [2, 2] }), frameParts);
  }
  const railZ = WALL_Z + 0.2;
  const rail = new THREE.Group();
  group.add(rail);
  pole(rail, [-1.05, 3.42, railZ], [1.05, 3.42, railZ], 0.045, bamboo);
  for (const a of [-0.98, 0.98]) softBox(rail, [0.05, 0.05, 0.2], timber, [a, 3.42, WALL_Z + 0.1], { radius: 0.006, tile: [1.8, 1.8] });
  register("cloth rail", "frame", rail, ["entrance wall"]);
  const points: Vec3[] = [
    [0, 3.32, WALL_Z + 0.09],
    [0, 3.49, railZ - 0.02],
    [0, 3.34, railZ + 0.08],
    [0, 2, railZ + 0.12],
    [0, 0.55, railZ + 0.22],
    [0, 0.1, WALL_Z + 0.85],
    [0, 0.012, WALL_Z + 1.5],
    [0, 0.012, WALL_Z + 5],
    [0.35, 0.012, WALL_Z + 9.5],
    [0.5, 0.012, WALL_Z + 14],
    [0.5, 0.012, WALL_Z + 19.5],
  ];
  const surface = settleCloth({
    points,
    width: 1.5,
    metresPerRepeat: 3.46,
    fold: 0.022,
    foldFrequency: 2.4,
    step: 0.05,
    columns: 44,
    foldAmount: (p) => smoothstep(0.4, 1.2, p[1]) * (1 - smoothstep(2.6, 3.3, p[1])),
    field: (x, z, y) => (Math.abs(x) < 1 && Math.abs(z - railZ) < 0.06 && y > 3 ? 3.476 : 0.012),
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(surface.positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(surface.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(surface.indices, 1));
  geometry.computeVertexNormals();
  const cloth = new THREE.Mesh(geometry, cotton);
  cloth.castShadow = cloth.receiveShadow = true;
  group.add(cloth);
  register("entrance cloth", "surface", cloth);
  colliders.push(...clothBodyBoxes(surface));
  for (const [index, [x, z]] of ([
    [6.4, 2.6],
    [8.7, 1.4],
    [11, 0.2],
  ] as const).entries()) {
    const hanging = new THREE.PlaneGeometry(1.8, 3.5, 144, 48);
    const position = hanging.attributes.position!;
    const hanginguv = hanging.attributes.uv!;
    for (let i = 0; i < position.count; i++) {
      const across = position.getX(i) / 1.8;
      const down = (1.75 - position.getY(i)) / 3.5;
      position.setZ(i, 0.06 * Math.min(1, 0.25 + down * 1.4) * (Math.sin(across * Math.PI * 6 + 1.1 + down * 0.9) + 0.45 * Math.sin(across * Math.PI * 12.6 + down * 2.3)));
      hanginguv.setXY(i, (hanginguv.getX(i) * 3.5) / 3.46, hanginguv.getY(i) * 1.2);
    }
    hanging.computeVertexNormals();
    const sheet = new THREE.Mesh(hanging, cotton);
    sheet.position.set(x, 4.36 - 1.75, z);
    sheet.rotation.y = -0.3;
    sheet.castShadow = sheet.receiveShadow = true;
    group.add(sheet);
    register(`drying sheet ${index}`, "textile", sheet);
    const frame = new THREE.Group();
    group.add(frame);
    pole(frame, [x - 1.2, 4.42, z - 0.36], [x + 1.2, 4.42, z + 0.36], 0.045, bamboo);
    pole(frame, [x - 1.2, 0, z - 0.36], [x - 1.2, 4.64, z - 0.36], 0.06, bamboo);
    pole(frame, [x + 1.2, 0, z + 0.36], [x + 1.2, 4.64, z + 0.36], 0.06, bamboo);
    register(`drying frame ${index}`, "frame", frame, [`drying sheet ${index}`]);
  }
  const solids = (): CheckedSolid[] =>
    registered.map((entry) => {
      entry.object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(entry.object, true);
      return { name: entry.name, role: entry.role, box: { min: [box.min.x, box.min.y, box.min.z], max: [box.max.x, box.max.y, box.max.z] }, restsOn: entry.restsOn, planted: false };
    });
  const unchecked = (): string[] => {
    const covered = new Set<THREE.Object3D>();
    for (const entry of registered) entry.object.traverse((node) => covered.add(node));
    const missing: string[] = [];
    group.traverse((node) => {
      if (node instanceof THREE.Mesh && !covered.has(node)) missing.push(((node.material as THREE.Material).userData.surface as { label?: string } | undefined)?.label ?? node.type);
    });
    return missing;
  };
  return { group, solids, unchecked, cloths: [{ name: "entrance cloth", positions: surface.positions, indices: surface.indices }], colliders };
}
