import * as THREE from "three";
import { liquidMarks, type SubstanceLook } from "@/features/process/domain/substance-look";
import { WORK_FLOOR_Y, type WorkStructure } from "../domain/yard-plan";
import { noteSurface, type MaterialLibrary } from "./material-library";
import { softBox } from "./solid-builders";
import { addBubbles, addScum, rippleNormals } from "./substance-fill";
import { liquidMaterial, projectScan } from "./substance-materials";

export type RingWork = Extract<WorkStructure, { type: "ring" }>;
export type TankWork = Extract<WorkStructure, { type: "tank" }>;

const LIME_TILE_METRES = 2;
const COPPER_TILE_METRES = 1;
const COPPER_REFLECTANCE = [0.955, 0.638, 0.538] as const;
const COPPER_SCAN_TILE_METRES = 0.8;
const COPPER_SCAN_CONTRAST = 0.55;
const COPPER_LEAST_ROUGH = 0.28;
const HOLE_TUCK_METRES = 0.015;

export function copperMaterial(library: MaterialLibrary): Promise<THREE.MeshStandardMaterial> {
  return library.shared("work:copper", async () => {
    const material = await library.surface("copper", { normalScale: 0.8 });
    material.color.setRGB(COPPER_REFLECTANCE[0] ** 2, COPPER_REFLECTANCE[1] ** 2, COPPER_REFLECTANCE[2] ** 2);
    material.metalness = 0.92;
    material.envMapIntensity = 1.15;
    material.side = THREE.DoubleSide;
    return noteSurface(projectScan(material, 1 / COPPER_SCAN_TILE_METRES, COPPER_SCAN_CONTRAST, COPPER_LEAST_ROUGH), { label: "copper", kind: "model", perMetre: 1 / COPPER_SCAN_TILE_METRES });
  });
}

export function plasterMaterial(library: MaterialLibrary): Promise<THREE.MeshStandardMaterial> {
  return library.shared("work:plaster", async () => {
    const material = await library.surface("lime", { normalScale: 0.6, tint: [1.55, 1.52, 1.38] });
    material.side = THREE.DoubleSide;
    return material;
  });
}

export function turnedRing(work: RingWork, material: THREE.Material): THREE.Mesh {
  const tile = work.finish === "copper" ? COPPER_TILE_METRES : LIME_TILE_METRES;
  const bevel = Math.min(0.028, (work.rim - work.radius) / 3);
  const profile: [number, number][] = [
    [work.rim, 0],
    [work.rim, work.curb - bevel],
  ];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    profile.push([work.rim - bevel + Math.cos(a) * bevel, work.curb - bevel + Math.sin(a) * bevel]);
  }
  profile.push([work.radius + bevel, work.curb]);
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    profile.push([work.radius + bevel - Math.sin(a) * bevel, work.curb - bevel + Math.cos(a) * bevel]);
  }
  profile.push([work.radius, WORK_FLOOR_Y + 0.08]);
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    profile.push([work.radius - 0.08 + Math.cos(a) * 0.08, WORK_FLOOR_Y + 0.08 - Math.sin(a) * 0.08]);
  }
  for (const part of [0.75, 0.5, 0.25, 0]) profile.push([(work.radius - 0.08) * part, WORK_FLOOR_Y]);
  const geometry = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 256);
  const uv = geometry.attributes.uv!;
  let along = 0;
  const lengths = profile.map((point, i) => {
    if (i > 0) along += Math.hypot(point[0] - profile[i - 1]![0], point[1] - profile[i - 1]![1]);
    return along;
  });
  const circumference = 2 * Math.PI * work.rim;
  for (let i = 0; i < uv.count; i++) {
    const row = i % profile.length;
    uv.setXY(i, uv.getX(i) * Math.round(circumference / tile), lengths[row]! / tile);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function addTankLining(parent: THREE.Object3D, work: TankWork, plaster: THREE.Material): void {
  const depth = -WORK_FLOOR_Y;
  const thick = 0.02;
  for (const a of [-1, 1]) {
    softBox(parent, [thick, depth + 0.04, work.halfZ * 2 + thick * 2], plaster, [a * (work.halfX + thick / 2), WORK_FLOOR_Y + depth / 2 + 0.02, 0], { radius: 0.004, tile: [LIME_TILE_METRES, LIME_TILE_METRES], cast: false });
    softBox(parent, [work.halfX * 2 + thick * 2, depth + 0.04, thick], plaster, [0, WORK_FLOOR_Y + depth / 2 + 0.02, a * (work.halfZ + thick / 2)], { radius: 0.004, tile: [LIME_TILE_METRES, LIME_TILE_METRES], cast: false });
  }
  softBox(parent, [work.halfX * 2 + thick * 2, thick, work.halfZ * 2 + thick * 2], plaster, [0, WORK_FLOOR_Y - thick / 2, 0], { radius: 0.004, tile: [LIME_TILE_METRES, LIME_TILE_METRES], cast: false });
}

function surfaceOf(work: RingWork | TankWork): THREE.BufferGeometry {
  const geometry = work.type === "ring" ? new THREE.RingGeometry(0.001, work.radius + 0.002, 192, 48) : new THREE.PlaneGeometry(work.halfX * 2 + 0.004, work.halfZ * 2 + 0.004, 96, 160);
  geometry.rotateX(-Math.PI / 2);
  rippleNormals(geometry, 0.00016);
  return geometry;
}

export async function addWorkLiquid(library: MaterialLibrary, parent: THREE.Object3D, work: RingWork | TankWork, look: SubstanceLook): Promise<Float32Array> {
  const geometry = surfaceOf(work);
  const surface = new THREE.Mesh(geometry, await liquidMaterial(library, look));
  surface.position.y = work.level;
  parent.add(surface);
  const marks = liquidMarks(look);
  const position = geometry.attributes.position!;
  const points: number[] = [];
  for (let i = 0; i < position.count; i++) points.push(position.getX(i), work.level, position.getZ(i));
  if (marks.scum) await addScum(library, parent, geometry, work.level);
  if (!marks.bubbles) return Float32Array.from(points);
  const reach = work.type === "ring" ? () => work.radius : (theta: number) => Math.min(work.halfX / Math.max(Math.abs(Math.cos(theta)), 1e-3), work.halfZ / Math.max(Math.abs(Math.sin(theta)), 1e-3));
  points.push(...(await addBubbles(library, parent, work.level + 0.002, { reach, count: marks.scum ? 420 : 150, smallest: 0.003, largest: marks.scum ? 0.016 : 0.009 })));
  return Float32Array.from(points);
}

export function groundWithOpening(width: number, length: number, centreX: number, centreZ: number, work: WorkStructure, metresPerRepeat: number, originX: number, originZ: number): THREE.BufferGeometry {
  const halfW = width / 2;
  const halfL = length / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, -halfL).lineTo(halfW, -halfL).lineTo(halfW, halfL).lineTo(-halfW, halfL).closePath();
  const x = originX - centreX;
  const y = centreZ - originZ;
  if (work.type === "ring") {
    const hole = new THREE.Path();
    hole.absarc(x, y, work.radius + HOLE_TUCK_METRES, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  if (work.type === "tank") {
    const hole = new THREE.Path();
    hole.moveTo(x - work.halfX, y - work.halfZ).lineTo(x - work.halfX, y + work.halfZ).lineTo(x + work.halfX, y + work.halfZ).lineTo(x + work.halfX, y - work.halfZ).closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ShapeGeometry(shape, 96);
  const uv = geometry.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / metresPerRepeat, uv.getY(i) / metresPerRepeat);
  return geometry;
}
