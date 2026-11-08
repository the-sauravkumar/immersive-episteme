import * as THREE from "three";
import type { ThrownShape } from "@/features/process/domain/asset-catalogue";
import { CLAY_BOWL, CLAY_POT, throwingSteps, type ThrownForm } from "../domain/thrown-vessel";
import { normalSteps } from "./stepped-geometry";
import type { MaterialLibrary } from "./material-library";
import { projectedMaterial, solidMesh } from "./built-materials";

const FORMS: Readonly<Record<ThrownShape, ThrownForm>> = { "clay-bowl": CLAY_BOWL, "clay-pot": CLAY_POT };

const FIRED_CLAY = { key: "fired clay", scan: "firedClay", hex: "#B56A47", contrast: 0.42, leastRough: 0.74, normalScale: 0.75, specular: 0.32, toned: true } as const;

function* thrownSteps(form: ThrownForm): Generator<void, THREE.BufferGeometry> {
  const mesh = yield* throwingSteps(form);
  const colours = new Float32Array(mesh.tones.length * 3);
  mesh.tones.forEach((tone, i) => colours.set([tone, tone, tone], i * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  return yield* normalSteps(geometry);
}

export async function buildThrownVessel(library: MaterialLibrary, shape: ThrownShape): Promise<THREE.Object3D> {
  const [geometry, material] = await Promise.all([library.shared(`thrown:${shape}`, () => library.pacer.run(thrownSteps(FORMS[shape]))), projectedMaterial(library, FIRED_CLAY)]);
  material.shadowSide = THREE.DoubleSide;
  return solidMesh(geometry, material);
}
