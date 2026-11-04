import * as THREE from "three";
import { catalogueModel } from "@/features/process/domain/asset-catalogue";
import type { SubstanceLook } from "@/features/process/domain/substance-look";
import { structureFor } from "../domain/yard-plan";
import { placeCatalogueModel, type YardKit } from "./build-yard";
import { softBox } from "./solid-builders";
import { addTankLining, addWorkLiquid, copperMaterial, groundWithOpening, plasterMaterial, turnedRing } from "./work-structures";

export interface StillSubject {
  readonly group: THREE.Group;
  readonly radius: number;
  readonly centreY: number;
}

export interface StillRequest {
  readonly modelId?: string;
  readonly looks?: readonly SubstanceLook[];
  readonly liquid?: SubstanceLook | null;
  readonly tray?: SubstanceLook | null;
}

const NO_OPENING = { type: "open" } as const;

async function integralSubject(kit: YardKit, modelId: string, liquid: SubstanceLook | null, group: THREE.Group): Promise<void> {
  if (modelId === "dye-vat" || modelId === "boiling-vessel") {
    const work = structureFor(modelId === "dye-vat" ? "vat" : "boil");
    if (work.type !== "ring") return;
    group.add(turnedRing(work, modelId === "boiling-vessel" ? await copperMaterial(kit.library) : await plasterMaterial(kit.library)));
    if (liquid) await addWorkLiquid(kit.library, group, work, liquid);
    return;
  }
  if (modelId === "wash-tank") {
    const plaster = await plasterMaterial(kit.library);
    const work = structureFor("wash");
    if (work.type !== "tank") return;
    const outerX = work.halfX + work.rim;
    for (const [x, z, sx, sz] of [
      [0, work.halfZ + work.rim / 2, outerX * 2, work.rim],
      [0, -work.halfZ - work.rim / 2, outerX * 2, work.rim],
      [-work.halfX - work.rim / 2, 0, work.rim, work.halfZ * 2],
      [work.halfX + work.rim / 2, 0, work.rim, work.halfZ * 2],
    ] as const) softBox(group, [sx, work.curb, sz], plaster, [x, work.curb / 2, z], { radius: 0.02, tile: [2, 2] });
    addTankLining(group, work, plaster);
    if (liquid) await addWorkLiquid(kit.library, group, work, liquid);
    return;
  }
  if (modelId === "printing-table") {
    const top = await kit.library.surface("table", { normalScale: 0.9 });
    softBox(group, [1.84, 0.2, 4], top, [0, 0.76, 0], { radius: 0.018, tile: [0.55, 0.55] });
    for (const z of [-1.6, 1.6]) for (const a of [-1, 1]) softBox(group, [0.1, 0.66, 0.1], top, [a * 0.82, 0.33, z], { radius: 0.008, tile: [0.55, 0.55] });
    return;
  }
  await placeCatalogueModel(kit, group, modelId, 0, 0, 0);
}

const openingOf = (modelId: string | undefined) => (modelId === "dye-vat" ? structureFor("vat") : modelId === "boiling-vessel" ? structureFor("boil") : modelId === "wash-tank" ? structureFor("wash") : NO_OPENING);

async function lookSubject(kit: YardKit, looks: readonly SubstanceLook[], subject: THREE.Group): Promise<void> {
  const placed = [];
  for (const look of looks) placed.push(await placeCatalogueModel(kit, subject, look.vesselModelId, 0, 0, 0, { look }));
  const widths = placed.map(({ object }) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x);
  let cursor = -(widths.reduce((sum, width) => sum + width, 0) + 0.05 * (placed.length - 1)) / 2;
  placed.forEach(({ object }, i) => {
    object.position.x = cursor + widths[i]! / 2;
    cursor += widths[i]! + 0.05;
  });
}

export async function buildStillSubject(kit: YardKit, request: StillRequest): Promise<StillSubject> {
  const group = new THREE.Group();
  const groundMaterial = await kit.library.surface("lime", { normalScale: 0.4, tint: [1.42, 1.34, 1.16] });
  const subject = new THREE.Group();
  if (request.looks && request.looks.length > 0) await lookSubject(kit, request.looks, subject);
  else if (request.modelId && catalogueModel(request.modelId).form === "integral" && request.modelId !== "printing-tray") await integralSubject(kit, request.modelId, request.liquid ?? null, subject);
  else if (request.modelId) await placeCatalogueModel(kit, subject, request.modelId, 0, 0, 0, { tray: request.tray ?? null });
  group.add(subject);
  const bounds = new THREE.Box3().setFromObject(subject);
  bounds.min.y = Math.max(bounds.min.y, 0);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const tile = Math.max(2, sphere.radius * 6);
  const ground = new THREE.Mesh(groundWithOpening(40, 40, 0, 0, openingOf(request.modelId), tile, 0, 0), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  ground.receiveShadow = true;
  group.add(ground);
  return { group, radius: sphere.radius, centreY: sphere.center.y };
}
