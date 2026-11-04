import * as THREE from "three";
import { catalogueModel } from "@/features/process/domain/asset-catalogue";
import { structureFor } from "../domain/yard-plan";
import { placeCatalogueModel, turnedRing, waterMaterial, type YardKit } from "./build-yard";
import { softBox } from "./solid-builders";

export interface StillSubject {
  readonly group: THREE.Group;
  readonly radius: number;
  readonly centreY: number;
}

async function integralSubject(kit: YardKit, modelId: string, group: THREE.Group): Promise<void> {
  if (modelId === "dye-vat" || modelId === "boiling-vessel") {
    const work = structureFor(modelId === "dye-vat" ? "vat" : "boil");
    if (work.type !== "ring") return;
    const material = modelId === "boiling-vessel" ? await kit.copperMaterial() : await kit.library.surface("lime", { normalScale: 0.6, tint: [1.55, 1.52, 1.38] });
    material.side = THREE.DoubleSide;
    const ring = turnedRing(work, material);
    group.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(work.radius + 0.01, 128), waterMaterial());
    water.rotation.x = -Math.PI / 2;
    water.position.y = work.level;
    group.add(water);
    return;
  }
  if (modelId === "wash-tank") {
    const plaster = await kit.library.surface("lime", { normalScale: 0.6, tint: [1.55, 1.52, 1.38] });
    const work = structureFor("wash");
    if (work.type !== "tank") return;
    const outerX = work.halfX + work.rim;
    for (const [x, z, sx, sz] of [
      [0, work.halfZ + work.rim / 2, outerX * 2, work.rim],
      [0, -work.halfZ - work.rim / 2, outerX * 2, work.rim],
      [-work.halfX - work.rim / 2, 0, work.rim, work.halfZ * 2],
      [work.halfX + work.rim / 2, 0, work.rim, work.halfZ * 2],
    ] as const) softBox(group, [sx, work.curb, sz], plaster, [x, work.curb / 2, z], { radius: 0.02, segments: 3, tile: [2, 2] });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(work.halfX * 2 + 0.02, work.halfZ * 2 + 0.02), waterMaterial());
    water.rotation.x = -Math.PI / 2;
    water.position.y = work.level;
    group.add(water);
    return;
  }
  if (modelId === "printing-table") {
    const [top, timber] = await Promise.all([kit.library.surface("table", { normalScale: 0.9 }), kit.library.surface("timber")]);
    softBox(group, [1.84, 0.2, 4], top, [0, 0.76, 0], { radius: 0.018, segments: 3, tile: [0.55, 0.55] });
    for (const z of [-1.6, 1.6]) for (const a of [-1, 1]) softBox(group, [0.1, 0.66, 0.1], timber, [a * 0.82, 0.33, z], { radius: 0.008, tile: [1.8, 1.8] });
    return;
  }
  await placeCatalogueModel(kit, group, modelId, 0, 0, 0);
}

export async function buildStillSubject(kit: YardKit, modelId: string): Promise<StillSubject> {
  const group = new THREE.Group();
  const groundMaterial = await kit.library.surface("lime", { normalScale: 0.4, tint: [1.42, 1.34, 1.16] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  ground.receiveShadow = true;
  const subject = new THREE.Group();
  if (catalogueModel(modelId).form === "integral") await integralSubject(kit, modelId, subject);
  else await placeCatalogueModel(kit, subject, modelId, 0, 0, 0);
  group.add(subject);
  const bounds = new THREE.Box3().setFromObject(subject);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const uv = ground.geometry.attributes.uv!;
  const tile = 40 / Math.max(2, sphere.radius * 6);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tile, uv.getY(i) * tile);
  group.add(ground);
  return { group, radius: sphere.radius, centreY: sphere.center.y };
}
